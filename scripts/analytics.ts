/**
 * analytics.ts — Quick CLI stats for the pageviews table.
 *
 * Usage: bun run scripts/analytics.ts  (or `bun run analytics`)
 *
 * Outputs:
 *   - Total pageviews
 *   - Unique days with traffic
 *   - Top referrers (last 30 days)
 *   - Daily breakdown (last 30 days)
 *
 * Prerequisites: .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const client = createClient(url, serviceKey);

async function main() {
  console.log("📊 FirstCommit Pageview Analytics\n");
  console.log(`   Project: ${new URL(url).hostname.split(".")[0]}\n`);

  // 1. Total pageviews
  const { count: total, error: countErr } = await client
    .from("pageviews")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    console.error(`   ❌ Could not query pageviews: ${countErr.message}`);
    console.error(
      "   Make sure the pageviews table exists — run supabase/migrations/003_pageviews.sql"
    );
    process.exit(1);
  }

  console.log(`   Total pageviews:  ${total ?? 0}\n`);

  // 2. Unique days with traffic
  const { data: days, error: daysErr } = await client
    .from("pageviews")
    .select("created_at");

  if (!daysErr && days) {
    const uniqueDays = new Set(
      days.map((r) => r.created_at.slice(0, 10))
    ).size;
    console.log(`   Unique days:      ${uniqueDays}\n`);
  }

  // 3. Top referrers (last 30 days, top 10)
  console.log("🔗 Top referrers (last 30 days):");
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: refs, error: refsErr } = await client
    .from("pageviews")
    .select("referrer")
    .gte("created_at", thirtyDaysAgo);

  if (!refsErr && refs) {
    const counts: Record<string, number> = {};
    for (const r of refs) {
      const ref = r.referrer || "(direct / none)";
      counts[ref] = (counts[ref] || 0) + 1;
    }
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (sorted.length === 0) {
      console.log("   (no data)");
    } else {
      for (const [ref, count] of sorted) {
        const truncated =
          ref.length > 60 ? ref.slice(0, 57) + "..." : ref;
        console.log(`   ${String(count).padStart(6)}  ${truncated}`);
      }
    }
    console.log();
  }

  // 4. Daily breakdown (last 30 days)
  console.log("📅 Daily breakdown (last 30 days):");
  const { data: daily, error: dailyErr } = await client
    .from("pageviews")
    .select("created_at")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true });

  if (!dailyErr && daily) {
    const byDay: Record<string, number> = {};
    for (const r of daily) {
      const day = r.created_at.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    }
    // Fill in missing days with zeros for a clean chart
    const dateRange: string[] = [];
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (let i = 0; i <= 30; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      dateRange.push(d.toISOString().slice(0, 10));
    }
    const maxCount = Math.max(1, ...Object.values(byDay));
    for (const day of dateRange) {
      const count = byDay[day] || 0;
      const bar = "█".repeat(Math.round((count / maxCount) * 30));
      console.log(`   ${day}  ${String(count).padStart(4)}  ${bar}`);
    }
    console.log();
  }

  console.log("✅ Done.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
