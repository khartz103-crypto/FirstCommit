/**
 * verify-db.ts — Definitive Supabase database verification.
 *
 * After running the SQL migrations in the Supabase SQL Editor, run this script
 * to confirm tables exist and CRUD operations work:
 *
 *   bun run scripts/verify-db.ts
 *
 * Prerequisites: .env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

const projectRef = new URL(url).hostname.split(".")[0];
const sqlEditorUrl = `https://supabase.com/dashboard/project/${projectRef}/sql`;

const serviceClient = createClient(url, serviceKey);
const anonClient = createClient(url, anonKey);

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`   ✅ ${label}${detail ? ` — ${detail}` : ""}`);
    passed++;
  } else {
    console.log(`   ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function main() {
  console.log("🔍 FirstCommit DB Verification\n");
  console.log(`   Project:  ${projectRef}`);
  console.log(`   REST API: ${url}\n`);

  // 1. REST API reachable
  console.log("1️⃣  REST API reachable...");
  try {
    const res = await fetch(`${url}/rest/v1/jobs?limit=0`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    const apiOk = res.ok;
    check("REST API", apiOk, apiOk ? `HTTP ${res.status}` : `HTTP ${res.status}`);
  } catch (err: any) {
    check("REST API", false, err.message);
  }

  // 2. jobs table
  console.log("\n2️⃣  jobs table...");
  const { data: jobsData, error: jobsErr } = await serviceClient
    .from("jobs")
    .select("id", { count: "exact", head: false });
  check("jobs table exists", !jobsErr, jobsErr?.message);
  if (!jobsErr) {
    check("SELECT jobs", true, `${jobsData?.length ?? 0} rows`);
  }

  // 3. subscribers table
  console.log("\n3️⃣  subscribers table...");
  const testEmail = `verify-${Date.now()}@firstcommit.dev`;

  const { error: insertErr } = await serviceClient
    .from("subscribers")
    .insert({ email: testEmail });
  check("subscribers INSERT", !insertErr, insertErr?.message);

  if (!insertErr) {
    const { error: delErr } = await serviceClient
      .from("subscribers")
      .delete()
      .eq("email", testEmail);
    check("subscribers DELETE", !delErr, delErr?.message);
  }

  // 4. RPC function
  console.log("\n4️⃣  RPC functions...");
  const { error: rpcErr } = await serviceClient.rpc("delete_old_jobs");
  check("delete_old_jobs RPC", !rpcErr, rpcErr?.message);

  // 5. RLS policies
  console.log("\n5️⃣  RLS policies (anon key)...");
  const { error: anonJobsErr } = await anonClient
    .from("jobs")
    .select("id").limit(1);
  check("Anon SELECT jobs", !anonJobsErr, anonJobsErr?.message);

  const anonEmail = `anon-verify-${Date.now()}@firstcommit.dev`;
  const { error: anonInsertErr } = await anonClient
    .from("subscribers")
    .insert({ email: anonEmail });
  check("Anon INSERT subscribers", !anonInsertErr, anonInsertErr?.message);

  // Cleanup anon test if it succeeded
  if (!anonInsertErr) {
    await serviceClient.from("subscribers").delete().eq("email", anonEmail);
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log("✅ DATABASE FULLY READY");
  } else {
    console.log("❌ DATABASE NOT READY");
    console.log(`   Run migrations in the Supabase SQL Editor:`);
    console.log(`   ${sqlEditorUrl}`);
    console.log(`   Files to run:`);
    console.log(`     supabase/migrations/001_initial_schema.sql`);
    console.log(`     supabase/migrations/002_rls_policies.sql`);
  }
  console.log("=".repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
