export const STRIPE_EARLY_ACCESS_LINK =
  import.meta.env.VITE_STRIPE_EARLY_ACCESS_LINK || "#early-access";

export const BUY_ME_A_COFFEE_LINK =
  import.meta.env.VITE_BUY_ME_A_COFFEE_LINK || "#coffee";

/** Simple hardcoded unlock code for early access — in production this would validate against Supabase. */
export const VALID_UNLOCK_CODE = "FIRSTCOMMIT2026";
