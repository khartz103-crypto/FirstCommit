/**
 * newsletter.ts — Weekly cron: send job digest to all subscribers via Resend.
 * Usage: bun run newsletter
 */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// ── Helpers ─────────────────────────────────────────────────────────────────

const env = (k: string, fb = "") => process.env[k] ?? fb;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function db() {
  const url = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required.");
  return createClient(url, key);
}

// ── Source badge styling ────────────────────────────────────────────────────

const BADGE_COLORS: Record<string, string> = {
  hn_whoishiring: "#ff6600",
  github_jobs: "#24292e",
  google_jobs: "#4285f4",
};

function badgeStyle(source: string) {
  const bg = BADGE_COLORS[source] ?? "#6b7280";
  return `display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background:${bg};`;
}

function sourceLabel(s: string) {
  const map: Record<string, string> = { hn_whoishiring: "HN", github_jobs: "GitHub", google_jobs: "Google" };
  return map[s] ?? s;
}

// ── HTML Email Builder ─────────────────────────────────────────────────────

function buildEmail(jobs: { title: string; company: string; source: string; skills_summary: string; salary_range: string; apply_by: string; url: string }[]) {
  const jobCards = jobs
    .map(
      (j) => `
    <tr>
      <td style="padding:16px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="padding-bottom:6px;">
              <span style="font-size:16px;font-weight:700;color:#111827;">${esc(j.title)}</span>
            </td>
            <td align="right" style="padding-bottom:6px;">
              <span style="${badgeStyle(j.source)}">${sourceLabel(j.source)}</span>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding-bottom:8px;font-size:14px;color:#4b5563;">
              ${esc(j.company)}${j.location ? ` · ${esc(j.location)}` : ""}
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding-bottom:8px;font-size:13px;color:#374151;line-height:1.5;">
              <strong>Skills:</strong> ${esc(j.skills_summary || "Not specified")}<br/>
              <strong>Salary:</strong> ${esc(j.salary_range || "Not specified")}<br/>
              <strong>Apply by:</strong> ${esc(j.apply_by || "Not specified")}
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding-top:6px;">
              <a href="${esc(j.url)}" style="display:inline-block;padding:8px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">View Job &rarr;</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr><td style="height:12px;"></td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

        <!-- Header -->
        <tr>
          <td style="padding:24px 24px 8px;text-align:center;">
            <span style="font-size:24px;font-weight:800;color:#111827;">FirstCommit &#x1f4bc;</span>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 20px;text-align:center;font-size:14px;color:#6b7280;">
            ${jobs.length} new entry-level Python &amp; SQL jobs this week
          </td>
        </tr>

        <!-- Job cards -->
        <tr>
          <td style="padding:0 24px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${jobCards || '<tr><td style="padding:32px;text-align:center;color:#9ca3af;font-size:14px;">No new jobs this week.</td></tr>'}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 24px;background:#f3f4f6;text-align:center;font-size:12px;color:#9ca3af;line-height:1.6;">
            You&rsquo;re receiving this because you subscribed at FirstCommit.<br/>
            <a href="#unsubscribe" style="color:#6b7280;">Unsubscribe</a>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== FirstCommit Newsletter ===\n");

  // Validate Resend key
  const resendKey = env("RESEND_API_KEY");
  if (!resendKey) {
    console.error("RESEND_API_KEY is required but not set. Exiting.");
    process.exit(1);
  }
  const resend = new Resend(resendKey);
  const fromEmail = env("NEWSLETTER_FROM_EMAIL", "jobs@firstcommit.dev");

  // Fetch jobs from Supabase
  let supabase: ReturnType<typeof db>;
  try {
    supabase = db();
  } catch (e: unknown) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  console.log("[DB] Fetching jobs from last 7 days...");
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("*")
    .gt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("posted_at", { ascending: false });

  if (jobsErr) {
    console.error(`[DB] Jobs query failed: ${jobsErr.message}`);
    process.exit(1);
  }

  console.log(`[DB] ${jobs?.length ?? 0} jobs found.`);

  // Fetch subscribers
  console.log("[DB] Fetching subscribers...");
  const { data: subscribers, error: subsErr } = await supabase
    .from("subscribers")
    .select("*")
    .eq("confirmed", true);

  if (subsErr) {
    // Fall back to all subscribers if confirmed column isn't populated
    console.warn(`[DB] Confirmed query failed (${subsErr.message}), trying all subscribers...`);
    const { data: allSubs, error: allErr } = await supabase.from("subscribers").select("*");
    if (allErr) {
      console.error(`[DB] Subscribers query failed: ${allErr.message}`);
      process.exit(1);
    }
    console.log(`[DB] ${allSubs?.length ?? 0} total subscribers (unfiltered).`);
    await sendAll(resend, fromEmail, jobs ?? [], allSubs ?? []);
  } else {
    console.log(`[DB] ${subscribers?.length ?? 0} confirmed subscribers.`);
    await sendAll(resend, fromEmail, jobs ?? [], subscribers ?? []);
  }
}

async function sendAll(
  resend: Resend,
  from: string,
  jobs: { title: string; company: string; source: string; skills_summary: string; salary_range: string; apply_by: string; url: string }[],
  subscribers: { email: string }[]
) {
  if (subscribers.length === 0) {
    console.log("No subscribers to send to. Exiting.");
    return;
  }

  if (jobs.length === 0) {
    console.log("No jobs to include — skipping send to avoid empty newsletter.");
    return;
  }

  const subject = `FirstCommit Weekly — ${jobs.length} new entry-level Python & SQL jobs`;
  const html = buildEmail(jobs);

  let sent = 0, failed = 0;

  for (const sub of subscribers) {
    try {
      const { error } = await resend.emails.send({
        from,
        to: [sub.email],
        subject,
        html,
      });
      if (error) {
        console.error(`[Resend] Failed for ${sub.email}: ${error.message}`);
        failed++;
      } else {
        sent++;
      }
    } catch (e: unknown) {
      console.error(`[Resend] Failed for ${sub.email}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }

    // Rate limit: Resend free tier = 100/day, so be gentle
    await sleep(350);
  }

  console.log(`\n=== Done ===`);
  console.log(`Newsletter sent to ${sent} subscribers with ${jobs.length} jobs.`);
  if (failed > 0) console.log(`${failed} failures — check logs above.`);
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
