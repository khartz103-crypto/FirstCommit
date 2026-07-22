-- 002_rls_policies.sql
-- Row Level Security policies for FirstCommit Job Board
--
-- If RLS is enabled on your Supabase project (recommended for production),
-- the anon-key client will be blocked unless these policies are in place.
-- Run these statements in the Supabase SQL editor manually, or via
-- `supabase db push` if using the Supabase CLI.

-- Allow public (unauthenticated) read access to the jobs table
CREATE POLICY "Public read jobs" ON jobs FOR SELECT USING (true);

-- Allow public insert to the subscribers table (newsletter signup)
CREATE POLICY "Public insert subscribers" ON subscribers FOR INSERT WITH CHECK (true);
