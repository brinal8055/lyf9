import { createClient } from "@supabase/supabase-js";

export type SupabasePublicConfig = {
  anonKey: string | null;
  url: string | null;
};

export function getSupabasePublicConfig(): SupabasePublicConfig {
  return {
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null
  };
}

export function createSupabaseAnonClient() {
  const config = getSupabasePublicConfig();

  if (!config.url || !config.anonKey) {
    throw new Error("Supabase anon client is not configured.");
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
