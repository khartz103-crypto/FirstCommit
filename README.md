# FirstCommit

Entry-level remote developer job board aggregating Python & SQL roles from GitHub Jobs, HN "Who's Hiring", and Google Jobs — with AI-powered summaries.

## Tech Stack

- **Frontend**: React 19, Vite 7, TypeScript, Tailwind CSS 4
- **Backend / DB**: Supabase (PostgreSQL)
- **AI Summaries**: OpenAI (gpt-4o-mini)
- **Email**: Resend (transactional newsletter)
- **Payments**: Stripe payment links
- **Runtime**: Bun

## Setup

```bash
# Clone the repo
git clone <repo-url>
cd site

# Install dependencies
bun install

# Copy and fill in environment variables
cp .env.example .env

# Start the dev server
bun run dev
```

The dev server starts on **http://localhost:3000**.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Scraper | Supabase service role key for server-side scripts |
| `OPENAI_API_KEY` | Scraper | OpenAI API key for job summary generation |
| `RESEND_API_KEY` | Newsletter | Resend API key for sending emails |
| `NEWSLETTER_FROM_EMAIL` | Newsletter | Sender address for newsletter emails |
| `VITE_STRIPE_EARLY_ACCESS_LINK` | No | Stripe payment link for $5/month early access |
| `VITE_BUY_ME_A_COFFEE_LINK` | No | Stripe payment link / Buy Me a Coffee link |

## Available Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `bun run dev` | Start Vite dev server on port 3000 |
| `build` | `bun run build` | Production build (`vite build`) |
| `start` | `bun run start` | Serve the production build |
| `scrape` | `bun run scrape` | Run the job scraper (fetches + AI-summarizes listings) |
| `newsletter` | `bun run newsletter` | Send the weekly newsletter to subscribers |
| `publish` | `bun run publish` | Rebuild and republish the live site on port 3000 |
| `format` | `bun run format` | Format all files with Prettier |

## Database

### Schema

See `supabase/migrations/001_initial_schema.sql` for the full database schema, including the `jobs` and `subscribers` tables.

### Row Level Security (RLS)

If RLS is enabled on your Supabase project, run the policies in `supabase/migrations/002_rls_policies.sql` via the Supabase SQL editor:

```sql
CREATE POLICY "Public read jobs" ON jobs FOR SELECT USING (true);
CREATE POLICY "Public insert subscribers" ON subscribers FOR INSERT WITH CHECK (true);
```

## Architecture

- **Job scraping** (`scripts/scrape.ts`): Fetches listings from GitHub Jobs, HN "Who's Hiring", and Google Jobs APIs, generates AI summaries via OpenAI, and inserts into Supabase. Run via GitHub Actions cron (`scrape.yml`) on a daily schedule.
- **Newsletter** (`scripts/newsletter.ts`): Queries recent jobs from Supabase and sends a formatted email to all confirmed subscribers via Resend. Run via GitHub Actions cron (`newsletter.yml`) on a weekly schedule.
- **Frontend** (`src/App.tsx`): React SPA that reads jobs from Supabase (anon key). Early-access jobs (created within the last 2 days) show a locked card with an upgrade prompt for free users. Subscribers can unlock with a code or via the Stripe payment link.
- **Early-access gating**: Computed client-side from `created_at` — jobs older than 2 days are freely visible; newer jobs are gated behind the $5/mo subscription.

## Deployment

Deployed on Vercel. The GitHub Actions workflows in `.github/workflows/` handle cron-scheduled scraping and newsletter delivery.

### Site publication

The `publish` script (`publish.sh`) builds the Vite app and serves it on port 3000 behind a reverse proxy. Run `bun run publish` after making changes to deploy them live.
