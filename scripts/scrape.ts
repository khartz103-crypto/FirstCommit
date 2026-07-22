/**
 * scrape.ts — Daily cron: scrape entry-level remote Python/SQL dev jobs.
 * Sources: HN Who's Hiring (Algolia), GitHub Jobs (graceful), Google Jobs (SerpAPI).
 * Filters → deduplicates against Supabase → AI-summarizes → stores.
 * Usage: bun run scripts/scrape.ts  (or `bun run scrape`)
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ── Helpers ─────────────────────────────────────────────────────────────────

const env = (k: string, fb = "") => process.env[k] ?? fb;

const re = {
  python: /\bpython\b/i,
  sql: /\bsql\b/i,
  remote: /\b(remote|work from home|wfh|anywhere)\b/i,
  entry: /\b(junior|entry.level|entry level|new grad|bootcamp|0.?2 years|beginner|associate)\b/i,
};

const matches = (t: string) =>
  (re.python.test(t) || re.sql.test(t)) && re.remote.test(t) && re.entry.test(t);

const trunc = (s: string, n = 1200) => (s.length <= n ? s : s.slice(0, n) + "...");

// ── OpenAI ──────────────────────────────────────────────────────────────────

async function summarize(ai: OpenAI, job: { title: string; company: string; description: string }) {
  const r = await ai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "user",
        content:
          `Summarize this job posting into exactly 3 bullet points:\n` +
          `1. Required skills (technologies, languages, tools)\n` +
          `2. Salary range (if mentioned, otherwise "Not specified")\n` +
          `3. Application deadline / apply-by date (if mentioned, otherwise "Not specified")\n\n` +
          `Keep each bullet short — max 80 chars. If you cannot determine something, write "Not specified".\n\n` +
          `Job posting:\n${trunc(`${job.title}\n${job.company}\n${job.description}`)}`,
      },
    ],
    max_tokens: 150,
    temperature: 0.3,
  });
  const lines = (r.choices[0]?.message?.content ?? "")
    .split("\n")
    .map((l) => l.replace(/^\d+\.\s*/, "").replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  return {
    skills_summary: lines[0]?.slice(0, 120) ?? "Not specified",
    salary_range: lines[1]?.slice(0, 120) ?? "Not specified",
    apply_by: lines[2]?.slice(0, 120) ?? "Not specified",
  };
}

// ── Source: HN Who's Hiring (Algolia API) ──────────────────────────────────

async function scrapeHN(): Promise<
  { title: string; company: string; location: string; url: string; source: string; description: string }[]
> {
  console.log("[HN] Searching latest 'Who is hiring'...");
  const search = await fetch(
    "https://hn.algolia.com/api/v1/search?query=who+is+hiring&tags=story&hitsPerPage=5&restrictSearchableAttributes=title"
  );
  const { hits: stories } = (await search.json()) as {
    hits: { objectID: string; title: string; created_at: string }[];
  };
  const story = stories
    .filter(
      (h) =>
        /who is hiring/i.test(h.title) &&
        /(\b(january|february|march|april|may|june|july|august|september|october|november|december)\b|\d{4})/i.test(h.title)
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  if (!story) {
    console.log("[HN] No recent 'Who is hiring' story found.");
    return [];
  }
  console.log(`[HN] Story: "${story.title}" (${story.objectID})`);

  const comments = await fetch(
    `https://hn.algolia.com/api/v1/search?tags=comment,story_${story.objectID}&hitsPerPage=500`
  );
  const { hits: cmts } = (await comments.json()) as {
    hits: { comment_text: string; author: string; objectID: string }[];
  };

  const jobs: ReturnType<typeof scrapeHN> = [];
  for (const c of cmts) {
    const t = c.comment_text ?? "";
    if (!matches(t)) continue;
    const first = t.split("\n")[0].trim().slice(0, 150);
    const m = first.match(/^([A-Z][A-Za-z0-9 .&,-]+?)\s*(:|\||-|–|—|is hiring|is looking)/);
    jobs.push({
      title: first.length > 8 ? first : "See posting",
      company: m ? m[1].trim() : c.author ?? "Unknown",
      location: "Remote",
      url: `https://news.ycombinator.com/item?id=${story.objectID}#${c.objectID}`,
      source: "hn_whoishiring",
      description: t,
    });
  }
  console.log(`[HN] ${jobs.length} matches from ${cmts.length} comments.`);
  return jobs;
}

// ── Source: GitHub Jobs (deprecated — handled gracefully) ───────────────────

async function scrapeGH(): Promise<
  { title: string; company: string; location: string; url: string; source: string; description: string }[]
> {
  console.log("[GitHub Jobs] Trying jobs.github.com API...");
  try {
    const ctrl = new AbortController();
    const tmr = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch("https://jobs.github.com/positions.json?description=python&full_time=false", {
      signal: ctrl.signal,
    });
    clearTimeout(tmr);
    if (!res.ok) {
      console.log(`[GitHub Jobs] HTTP ${res.status} — deprecated. Skipping.`);
      return [];
    }
    const positions = (await res.json()) as {
      title: string; company: string; location: string; url: string; description: string;
    }[];
    const jobs: ReturnType<typeof scrapeGH> = [];
    for (const p of positions) {
      if (!matches(`${p.title} ${p.description} ${p.location}`)) continue;
      jobs.push({
        title: p.title,
        company: p.company ?? "Unknown",
        location: p.location ?? "Remote",
        url: p.url ?? `https://jobs.github.com/positions/${p.title}`,
        source: "github_jobs",
        description: p.description ?? "",
      });
    }
    console.log(`[GitHub Jobs] ${jobs.length} matches from ${positions.length}.`);
    return jobs;
  } catch (e: unknown) {
    console.log(`[GitHub Jobs] ${e instanceof Error ? e.message : e}. Skipping.`);
    return [];
  }
}

// ── Source: Google Jobs (SerpAPI — optional) ────────────────────────────────

async function scrapeGoogle(): Promise<
  { title: string; company: string; location: string; url: string; source: string; description: string }[]
> {
  const key = env("SERPAPI_KEY");
  if (!key) {
    console.log("[Google Jobs] No SERPAPI_KEY — skipping.");
    return [];
  }
  console.log("[Google Jobs] Querying SerpAPI...");
  const all: ReturnType<typeof scrapeGoogle> = [];
  const seen = new Set<string>();
  for (const q of ["entry level remote python developer", "junior remote sql developer"]) {
    try {
      const res = await fetch(
        `https://serpapi.com/search?${new URLSearchParams({ engine: "google_jobs", q, api_key: key })}`
      );
      if (!res.ok) {
        console.log(`[Google Jobs] HTTP ${res.status} for "${q}".`);
        continue;
      }
      const data = (await res.json()) as {
        jobs_results?: { title: string; company_name: string; location: string; description: string; related_links?: { link: string }[] }[];
      };
      for (const j of data.jobs_results ?? []) {
        if (!matches(`${j.title} ${j.description ?? ""} ${j.location ?? ""}`)) continue;
        const url = j.related_links?.[0]?.link ?? "";
        if (!url || seen.has(url)) continue;
        seen.add(url);
        all.push({
          title: j.title,
          company: j.company_name ?? "Unknown",
          location: j.location ?? "Remote",
          url,
          source: "google_jobs",
          description: j.description ?? "",
        });
      }
    } catch (e: unknown) {
      console.log(`[Google Jobs] ${e instanceof Error ? e.message : e} for "${q}".`);
    }
  }
  console.log(`[Google Jobs] ${all.length} matches.`);
  return all;
}

// ── Supabase ────────────────────────────────────────────────────────────────

function db() {
  const url = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required.");
  return createClient(url, key);
}

async function existingUrls(s: ReturnType<typeof db>) {
  const { data } = await s.from("jobs").select("url");
  return new Set((data ?? []).map((r: { url: string }) => r.url));
}

async function insert(s: ReturnType<typeof db>, j: {
  title: string; company: string; location: string; url: string; source: string;
  skills_summary: string; salary_range: string; apply_by: string;
}) {
  const { error } = await s.from("jobs").insert({ ...j, posted_at: new Date().toISOString(), is_early_access: true });
  if (error) { console.error(`[DB] Insert failed "${j.title}": ${error.message}`); return false; }
  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Job Scraper ===\n");

  const openaiKey = env("OPENAI_API_KEY");
  const ai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
  if (!ai) console.warn("[OpenAI] No OPENAI_API_KEY — summaries disabled.");

  const supabase = db();

  // Scrape all sources independently
  let hn: Awaited<ReturnType<typeof scrapeHN>> = [], gh: Awaited<ReturnType<typeof scrapeGH>> = [],
    goog: Awaited<ReturnType<typeof scrapeGoogle>> = [];
  for (const [label, fn, store] of [
    ["HN", scrapeHN, (v: typeof hn) => (hn = v)] as const,
    ["GitHub Jobs", scrapeGH, (v: typeof gh) => (gh = v)] as const,
    ["Google Jobs", scrapeGoogle, (v: typeof goog) => (goog = v)] as const,
  ]) {
    try { store(await fn()); } catch (e: unknown) { console.error(`[${label}] ${e instanceof Error ? e.message : e}`); }
  }

  const all = [...hn, ...gh, ...goog];
  console.log(`\n--- Raw matches: ${all.length} (HN:${hn.length} GH:${gh.length} Google:${goog.length}) ---\n`);

  if (!all.length) { console.log("No jobs. Exiting."); return; }

  // Dedup
  console.log("[DB] Checking existing URLs...");
  let exist: Set<string>;
  try { exist = await existingUrls(supabase); } catch (e: unknown) {
    console.error(`[DB] URL fetch failed: ${e instanceof Error ? e.message : e}`);
    exist = new Set();
  }
  const fresh = all.filter((j) => !exist.has(j.url));
  console.log(`[DB] ${fresh.length} new, ${all.length - fresh.length} dupes skipped.\n`);

  // Summarize + store
  let sumd = 0, stored = 0;
  for (const j of fresh) {
    let s = { skills_summary: "", salary_range: "", apply_by: "" };
    if (ai) {
      try { s = await summarize(ai, j); sumd++; } catch (e: unknown) {
        console.error(`[OpenAI] Failed "${j.title}": ${e instanceof Error ? e.message : e}`);
      }
    }
    try { if (await insert(supabase, { title: j.title, company: j.company, location: j.location, url: j.url, source: j.source, ...s })) stored++; } catch (e: unknown) {
      console.error(`[DB] Insert "${j.title}": ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Scraped ${hn.length} jobs from HN, ${gh.length} from GitHub Jobs, ${goog.length} from Google Jobs.`);
  console.log(`OpenAI summarized ${sumd}. Stored ${stored} new.`);
}

main().catch((e) => { console.error("FATAL:", e instanceof Error ? e.message : e); process.exit(1); });
