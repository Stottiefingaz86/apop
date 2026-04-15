"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

let browserClient: SupabaseClient | null = null;

/** Singleton for client components. Uses the publishable / anon key (RLS applies). */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or anon/publishable key (NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).",
    );
  }
  browserClient = createClient(url, key);
  return browserClient;
}
