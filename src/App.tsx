import { useState, useEffect, useCallback } from "react";
import type { Job } from "./types";
import { supabase } from "./lib/supabase";
import {
  STRIPE_EARLY_ACCESS_LINK,
  BUY_ME_A_COFFEE_LINK,
  VALID_UNLOCK_CODE,
} from "./lib/config";

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "hn_whoishiring", label: "HN Who's Hiring" },
  { value: "github_jobs", label: "GitHub Jobs" },
  { value: "google_jobs", label: "Google Jobs" },
] as const;

function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [earlyAccessUnlocked, setEarlyAccessUnlocked] = useState(false);

    // Early-access window: jobs created within the last 2 days are gated for subscribers.
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

    // Check localStorage for early access flag on mount
    useEffect(() => {
      const unlocked = localStorage.getItem("early_access_unlocked") === "true";
      setEarlyAccessUnlocked(unlocked);
    }, []);

    // Fire-and-forget pageview tracking
    useEffect(() => {
      supabase
        .from("pageviews")
        .insert({
          path: window.location.pathname,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent,
        })
        .then(({ error }) => {
          if (error) {
            // Silently ignore — analytics must not disrupt UX
            console.debug("pageview track failed:", error.message);
          }
        });
    }, []);

    const unlockEarlyAccess = useCallback(() => {
      localStorage.setItem("early_access_unlocked", "true");
      setEarlyAccessUnlocked(true);
    }, []);

    // Fetch jobs from Supabase
    const fetchJobs = useCallback(async () => {
      setLoading(true);
      setFetchError("");

      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .order("posted_at", { ascending: false });

      if (error) {
        setFetchError("Couldn't load jobs right now");
        setJobs([]);
      } else {
        // Compute early-access status client-side based on the 2-day window
        // from created_at. This overrides the DB column so gating is always
        // accurate regardless of when/if the scraper flips the flag.
        const now = Date.now();
        const processed = (data as Job[]).map((job) => ({
          ...job,
          is_early_access:
            new Date(job.created_at).getTime() > now - TWO_DAYS_MS,
        }));
        setJobs(processed ?? []);
      }

      setLoading(false);
    }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Filter jobs by selected source
  const filteredJobs =
    sourceFilter === "all"
      ? jobs
      : jobs.filter((j) => j.source === sourceFilter);

  // Handle email subscription
  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribeError("");

    if (!email.includes("@") || email.trim().length < 5) {
      setSubscribeError("Please enter a valid email address.");
      return;
    }

    setSubscribing(true);

    const { error } = await supabase
      .from("subscribers")
      .insert({ email: email.trim() });

    if (error) {
      // Handle duplicate email (unique constraint violation)
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        setSubscribeError("You're already subscribed!");
      } else {
        setSubscribeError("Something went wrong. Please try again.");
      }
    } else {
      setSubscribed(true);
      setEmail("");
    }

    setSubscribing(false);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="text-2xl">💼</span>
            FirstCommit
          </a>
          <nav className="flex items-center gap-6 text-sm text-gray-500">
            <a href="#jobs" className="hover:text-gray-900 transition-colors">
              Jobs
            </a>
            <a href="#subscribe" className="hover:text-gray-900 transition-colors">
              Newsletter
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-gray-100 px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
            Entry-level remote jobs
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Find your first remote
            <br />
            Python &amp; SQL role
          </h1>
          <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
            We aggregate entry-level developer jobs from GitHub Jobs, HN Who's Hiring, and Google Jobs.
            Each listing is summarized by AI so you see skills, salary, and deadline at a glance.
          </p>
          <div className="mt-8">
            <a
              href={STRIPE_EARLY_ACCESS_LINK}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-full border-2 border-indigo-500 px-6 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <span>⚡</span>
              Get early access — $5/month
            </a>
          </div>
        </div>
      </section>

      {/* Job List */}
      <section id="jobs" className="px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight">Latest jobs</h2>
          <p className="mt-1 text-sm text-gray-500">
            Fresh listings updated daily.{" "}
            <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              ⚡ Early access
            </span>{" "}
            jobs are available 2 days before the free tier.
          </p>

          {/* Source filter chips */}
          <div className="mt-6 flex flex-wrap gap-2">
            {SOURCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSourceFilter(opt.value)}
                className={
                  sourceFilter === opt.value
                    ? "rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-colors"
                    : "rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Job cards — loading / error / empty / populated */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              // Skeleton cards
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-gray-100 bg-white p-5 animate-pulse"
                >
                  <div className="h-5 w-3/4 rounded bg-gray-200" />
                  <div className="mt-2 h-4 w-1/2 rounded bg-gray-100" />
                  <div className="mt-4 space-y-2">
                    <div className="h-3 w-full rounded bg-gray-100" />
                    <div className="h-3 w-2/3 rounded bg-gray-100" />
                    <div className="h-3 w-1/2 rounded bg-gray-100" />
                  </div>
                </div>
              ))
            ) : fetchError ? (
              // Error state
              <div className="col-span-full rounded-xl border border-red-100 bg-red-50 px-6 py-12 text-center">
                <p className="text-4xl">⚠️</p>
                <p className="mt-3 text-sm font-medium text-red-700">{fetchError}</p>
                <button
                  onClick={fetchJobs}
                  className="mt-4 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
                >
                  Try again
                </button>
              </div>
            ) : filteredJobs.length === 0 ? (
              // Empty state
              <div className="col-span-full rounded-xl border border-gray-100 bg-gray-50 px-6 py-12 text-center">
                <p className="text-4xl">📭</p>
                <p className="mt-3 text-sm font-medium text-gray-600">
                  {sourceFilter !== "all"
                    ? "No jobs from this source right now — try another filter."
                    : "No jobs yet — check back tomorrow!"}
                </p>
              </div>
            ) : (
              filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  earlyAccessUnlocked={earlyAccessUnlocked}
                  onUnlock={unlockEarlyAccess}
                />
              ))
            )}
          </div>
        </div>
      </section>

      {/* Newsletter signup */}
      <section id="subscribe" className="border-t border-gray-100 bg-gray-50 px-6 py-16">
        <div className="mx-auto max-w-md text-center">
          <h2 className="text-2xl font-bold tracking-tight">Stay in the loop</h2>
          <p className="mt-2 text-sm text-gray-500">
            Get the latest entry-level remote jobs delivered to your inbox every week. Free.
          </p>

          {subscribed ? (
            <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              🎉 You're on the list! Check your inbox for a confirmation email.
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="mt-6 flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
              <button
                type="submit"
                disabled={subscribing}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {subscribing && (
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                )}
                Subscribe
              </button>
            </form>
          )}
          {subscribeError && (
            <p className="mt-2 text-sm text-red-600">{subscribeError}</p>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="mx-auto max-w-4xl text-center text-sm text-gray-400">
          FirstCommit &copy; {new Date().getFullYear()} &mdash; Entry-level remote jobs for Python &amp; SQL developers.
        </div>
      </footer>

      {/* Buy Me a Coffee floating button */}
      <a
        href={BUY_ME_A_COFFEE_LINK}
        target="_blank"
        rel="noopener"
        className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-amber-600 transition-colors"
      >
        <span>☕</span>
        Buy Me a Coffee
      </a>
    </div>
  );
}

function JobCard({
  job,
  earlyAccessUnlocked,
  onUnlock,
}: {
  job: Job;
  earlyAccessUnlocked: boolean;
  onUnlock: () => void;
}) {
  const [cardUnlockCode, setCardUnlockCode] = useState("");
  const [cardUnlockError, setCardUnlockError] = useState("");

  const sourceLabel =
    job.source === "github_jobs"
      ? "GitHub Jobs"
      : job.source === "hn_whoishiring"
        ? "HN Who's Hiring"
        : "Google Jobs";

  const isLocked = job.is_early_access && !earlyAccessUnlocked;

  const handleCardUnlock = () => {
    if (cardUnlockCode.trim().toUpperCase() === VALID_UNLOCK_CODE) {
      onUnlock();
      setCardUnlockError("");
      setCardUnlockCode("");
    } else {
      setCardUnlockError("Invalid code. Please try again.");
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug">{job.title}</h3>
        {job.is_early_access && (
          <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            ⚡ EARLY
          </span>
        )}
      </div>
      {job.company && (
        <p className="mt-1 text-sm text-gray-500">{job.company}</p>
      )}

      <div className="mt-3 space-y-1 text-sm text-gray-600">
        {isLocked ? (
          // Locked early-access content
          <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 p-3 space-y-3">
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <span>🔒</span>
              <span>Early access — available in 2 days for free users</span>
            </div>
            <a
              href={STRIPE_EARLY_ACCESS_LINK}
              target="_blank"
              rel="noopener"
              className="inline-block rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Unlock instantly for $5/month →
            </a>
            <div className="border-t border-amber-200 pt-3">
              <p className="text-[11px] text-amber-600 mb-2">
                Already a subscriber? Enter unlock code
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cardUnlockCode}
                  onChange={(e) => {
                    setCardUnlockCode(e.target.value);
                    setCardUnlockError("");
                  }}
                  placeholder="Unlock code"
                  className="flex-1 rounded-md border border-amber-200 bg-white px-2 py-1 text-xs outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCardUnlock();
                  }}
                />
                <button
                  onClick={handleCardUnlock}
                  className="rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
                >
                  Unlock
                </button>
              </div>
              {cardUnlockError && (
                <p className="mt-1 text-[11px] text-red-500">{cardUnlockError}</p>
              )}
            </div>
          </div>
        ) : (
          // Full details visible
          <>
            {job.skills_summary && (
              <p>
                <span className="font-medium text-gray-700">Skills:</span>{" "}
                {job.skills_summary}
              </p>
            )}
            {job.salary_range && (
              <p>
                <span className="font-medium text-gray-700">Salary:</span>{" "}
                {job.salary_range}
              </p>
            )}
            {job.apply_by && (
              <p>
                <span className="font-medium text-gray-700">Apply by:</span>{" "}
                {job.apply_by}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide">
          {sourceLabel}
        </span>
        <a
          href={job.url}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          View &rarr;
        </a>
      </div>
    </div>
  );
}

export default App;
