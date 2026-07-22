/**
 * migrate.ts — Run Supabase migrations and verify database connectivity.
 *
 * Strategy:
 * 1. Try the Supabase SQL endpoint (used by Supabase Studio) with service_role key
 * 2. If that fails, try the Management API 
 * 3. Fall back: verify connectivity by querying information_schema
 * 4. If tables don't exist, output clear instructions for the lead
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Read env vars (Bun reads .env automatically in scripts)
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
  process.exit(1);
}

// Extract project ref from URL: https://<ref>.supabase.co
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
console.log(`📡 Supabase project: ${projectRef}`);

// ---------------------------------------------------------------------------
// Approach 1: Try the Supabase Studio SQL endpoint
// ---------------------------------------------------------------------------
async function trySqlEndpoint(sql: string): Promise<boolean> {
  console.log("🔧 Attempting Supabase SQL endpoint...");
  
  // Try multiple known SQL endpoint paths
  const endpoints = [
    `${SUPABASE_URL}/sql`,
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ query: sql }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`✅ SQL endpoint ${endpoint} succeeded:`, JSON.stringify(data).slice(0, 200));
        return true;
      }
      console.log(`   ${endpoint}: HTTP ${res.status} — ${(await res.text()).slice(0, 120)}`);
    } catch (err: any) {
      console.log(`   ${endpoint}: ${err.message}`);
    }
  }
  
  return false;
}

// ---------------------------------------------------------------------------
// Approach 2: Try creating tables via REST DDL (won't work with PostgREST, 
// but we try anyway in case project has extended capabilities)
// ---------------------------------------------------------------------------
async function tryRestDdl(): Promise<boolean> {
  console.log("🔧 Attempting REST DDL...");
  
  // PostgREST doesn't support DDL, but some Supabase projects have extensions
  // Try to call an exec_sql RPC if it exists
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ sql: "SELECT 1" }),
    });
    
    if (res.ok) {
      console.log("✅ exec_sql RPC available");
      return true;
    }
    console.log(`   exec_sql RPC: HTTP ${res.status}`);
  } catch (err: any) {
    console.log(`   exec_sql RPC: ${err.message}`);
  }
  
  return false;
}

// ---------------------------------------------------------------------------
// Approach 3: Check if tables already exist (query information_schema via REST)
// This works because PostgREST exposes the information_schema under the 
// service_role key when accessed through the schema
// ---------------------------------------------------------------------------
async function checkTablesExist(): Promise<{ jobs: boolean; subscribers: boolean }> {
  console.log("🔍 Checking if tables exist via REST...");
  
  const result = { jobs: false, subscribers: false };
  
  // Try direct table access with service_role
  for (const table of ["jobs", "subscribers"]) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?limit=0`,
        {
          headers: {
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
          },
        }
      );
      
      if (res.ok) {
        console.log(`   ✅ Table "${table}" exists`);
        (result as any)[table] = true;
      } else {
        const body = await res.text();
        console.log(`   ❌ Table "${table}" not found (HTTP ${res.status}: ${body.slice(0, 100)})`);
      }
    } catch (err: any) {
      console.log(`   ❌ Table "${table}" check failed: ${err.message}`);
    }
  }
  
  return result;
}

// ---------------------------------------------------------------------------
// Approach 4: Use supabase-js client for verification queries
// ---------------------------------------------------------------------------
async function verifyWithClient() {
  console.log("\n🔍 Verifying with Supabase JS client...");
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  // Test 1: SELECT COUNT(*) FROM jobs
  try {
    const { count, error } = await supabase
      .from("jobs")
      .select("*", { count: "exact", head: true });
    
    if (error) {
      console.log(`   ❌ jobs table query failed: ${error.message}`);
    } else {
      console.log(`   ✅ jobs table: ${count} rows`);
    }
  } catch (err: any) {
    console.log(`   ❌ jobs table query exception: ${err.message}`);
  }
  
  // Test 2: Insert a test subscriber
  const testEmail = `test-${Date.now()}@example.com`;
  try {
    const { data, error } = await supabase
      .from("subscribers")
      .insert({ email: testEmail, confirmed: false })
      .select();
    
    if (error) {
      console.log(`   ❌ subscribers insert failed: ${error.message}`);
    } else {
      console.log(`   ✅ Inserted test subscriber: ${testEmail}`);
      
      // Test 3: Delete the test subscriber
      const { error: delError } = await supabase
        .from("subscribers")
        .delete()
        .eq("email", testEmail);
      
      if (delError) {
        console.log(`   ⚠️  Could not delete test subscriber: ${delError.message}`);
      } else {
        console.log(`   ✅ Deleted test subscriber`);
      }
    }
  } catch (err: any) {
    console.log(`   ❌ subscribers insert exception: ${err.message}`);
  }

  // Test 4: Try calling delete_old_jobs RPC
  try {
    const { error } = await supabase.rpc("delete_old_jobs");
    if (error) {
      console.log(`   ⚠️  delete_old_jobs RPC not available: ${error.message}`);
    } else {
      console.log(`   ✅ delete_old_jobs RPC works`);
    }
  } catch (err: any) {
    console.log(`   ⚠️  delete_old_jobs RPC exception: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🚀 FirstCommit DB Migration & Verification\n");
  console.log("=" .repeat(60));

  // First, check if tables already exist
  const existing = await checkTablesExist();
  const allExist = existing.jobs && existing.subscribers;

  if (!allExist) {
    console.log("\n📋 Tables missing — attempting to create them programmatically...\n");
    
    // Read the SQL migration files
    const sqlFiles = [
      "supabase/migrations/001_initial_schema.sql",
      "supabase/migrations/002_rls_policies.sql",
    ];
    
    let sqlApplied = false;
    
    for (const file of sqlFiles) {
      const sql = await Bun.file(file).text();
      console.log(`\n📄 Processing ${file}...`);
      
      // Try SQL endpoint
      const success = await trySqlEndpoint(sql);
      if (success) {
        sqlApplied = true;
        console.log(`   ✅ ${file} applied via SQL endpoint`);
      } else {
        console.log(`   ⚠️  Could not apply ${file} programmatically`);
      }
    }
    
    if (!sqlApplied) {
      // Try REST DDL approach
      const restSuccess = await tryRestDdl();
      if (!restSuccess) {
        console.log("\n" + "=".repeat(60));
        console.log("⚠️  AUTOMATED MIGRATION FAILED");
        console.log("=".repeat(60));
        console.log("\nThe Supabase project doesn't expose a programmatic SQL endpoint.");
        console.log("You need to run these SQL files manually in the Supabase SQL Editor:");
        console.log("\n  1. Go to: https://supabase.com/dashboard/project/" + projectRef + "/sql");
        console.log("  2. Copy the contents of: supabase/migrations/001_initial_schema.sql");
        console.log("  3. Run it, then do the same for: supabase/migrations/002_rls_policies.sql");
        console.log("\nAfter running the SQL, re-run this script to verify everything works.");
      }
    }

    // Re-check after attempted migration
    const afterMigration = await checkTablesExist();
    if (afterMigration.jobs && afterMigration.subscribers) {
      console.log("\n✅ Tables now exist! Proceeding with verification...\n");
    } else {
      console.log("\n⚠️  Tables still missing. Verification will be limited.\n");
    }
  } else {
    console.log("\n✅ All tables already exist! Proceeding with verification...\n");
  }

  // Run verification queries
  await verifyWithClient();

  console.log("\n" + "=".repeat(60));
  console.log("🏁 Migration & verification complete");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
