-- 001_initial_schema.sql
-- FirstCommit Job Board — initial database schema
-- Run against your Supabase project's SQL editor or via `supabase db push`.

-- jobs table: stores scraped job postings
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company TEXT,
  location TEXT DEFAULT 'Remote',
  url TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('github_jobs', 'hn_whoishiring', 'google_jobs')),
  skills_summary TEXT, -- OpenAI-generated bullet: required skills
  salary_range TEXT,   -- OpenAI-generated bullet: salary range
  apply_by TEXT,       -- OpenAI-generated bullet: apply-by deadline
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_early_access BOOLEAN DEFAULT FALSE -- TRUE for first 2 days
);

-- subscribers table: email waiting list
CREATE TABLE subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed BOOLEAN DEFAULT FALSE
);

-- Indexes for fast queries
CREATE INDEX idx_jobs_posted_at ON jobs (posted_at DESC);
CREATE INDEX idx_jobs_source ON jobs (source);

-- Function to delete jobs older than 7 days (called by cron / pg_cron)
CREATE OR REPLACE FUNCTION delete_old_jobs() RETURNS void AS $$
BEGIN
  DELETE FROM jobs WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
