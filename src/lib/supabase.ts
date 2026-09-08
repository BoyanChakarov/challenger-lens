import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

const looksConfigured = Boolean(
  supabaseUrl &&
    supabasePublishableKey &&
    /^https:\/\/.+\.supabase\.co\/?$/i.test(supabaseUrl) &&
    !supabaseUrl.includes("your-project") &&
    !supabasePublishableKey.includes("your_key") &&
    !supabasePublishableKey.includes("your-key"),
);

export const isSupabaseConfigured = looksConfigured;

const BACKEND_TIMEOUT_MS = 2_500;

const timedFetch: typeof fetch = async (input, init = {}) => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
};

export const supabase: SupabaseClient | null = looksConfigured
  ? createClient(supabaseUrl as string, supabasePublishableKey as string, {
      db: {
        // Champion-select reads have a strict latency budget. A stale local
        // cache is preferable to the SDK's default 1s/2s/4s retry sequence.
        retry: false,
      },
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        fetch: timedFetch,
      },
    })
  : null;
