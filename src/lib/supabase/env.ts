/**
 * Resolve Supabase URL + browser-safe key from env.
 * Supports several dashboard / doc naming conventions.
 */
export function getSupabaseUrl(): string | undefined {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return v || undefined;
}

export function getSupabaseAnonKey(): string | undefined {
  const v =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim();
  return v || undefined;
}

export function getSupabaseSecretKey(): string | undefined {
  const v =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return v || undefined;
}
