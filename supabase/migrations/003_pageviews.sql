-- 003_pageviews.sql
-- Simple pageview analytics — lightweight, no external service needed.
-- Run in Supabase SQL Editor or via `supabase db push`.

CREATE TABLE pageviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT DEFAULT '/',
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pageviews_created_at ON pageviews(created_at DESC);

-- Public insert for tracking (fire-and-forget from the client)
ALTER TABLE pageviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert pageviews" ON pageviews FOR INSERT WITH CHECK (true);
