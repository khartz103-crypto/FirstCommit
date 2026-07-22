import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/*
 * RLS Policies — run these in the Supabase SQL editor if Row Level Security
 * is enabled on your project (the anon key will be blocked otherwise):
 *
 *   -- Allow public read access to jobs table
 *   CREATE POLICY "Public read jobs" ON jobs FOR SELECT USING (true);
 *
 *   -- Allow public insert to subscribers
 *   CREATE POLICY "Public insert subscribers" ON subscribers
 *     FOR INSERT WITH CHECK (true);
 *
 * See also: supabase/migrations/002_rls_policies.sql
 */
