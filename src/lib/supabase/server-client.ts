import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseSecretKey, getSupabaseUrl } from "@/lib/supabase/env";

type ServerClientMode = "anon" | "service_role";

/**
 * Server-side Supabase client (Route Handlers, Server Actions, `async` RSC).
 * - `anon`: respects RLS (same as browser).
 * - `service_role`: bypasses RLS — only use on the server, never expose to the client.
 */
export function createSupabaseServerClient(mode: ServerClientMode = "anon"): SupabaseClient {
  const url = getSupabaseUrl();
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (mode === "service_role") {
    const secret = getSupabaseSecretKey();
    if (!secret) {
      throw new Error("Missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) for service_role client.");
    }
    return createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  const key = getSupabaseAnonKey();
  if (!key) {
    throw new Error(
      "Missing anon/publishable key (NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
