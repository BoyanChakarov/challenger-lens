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

export const supabase: SupabaseClient | null = looksConfigured
  ? createClient(supabaseUrl as string, supabasePublishableKey as string, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
  : null;
