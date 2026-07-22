export interface Job {
  id: string;
  title: string;
  company: string | null;
  location: string;
  url: string;
  source: "github_jobs" | "hn_whoishiring" | "google_jobs";
  skills_summary: string | null;
  salary_range: string | null;
  apply_by: string | null;
  posted_at: string;
  created_at: string;
  is_early_access: boolean;
}

export interface Subscriber {
  id: string;
  email: string;
  subscribed_at: string;
  confirmed: boolean;
}
