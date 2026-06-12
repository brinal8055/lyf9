import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig, type SupabasePublicConfig } from "./supabase";

export type SupabaseServerConfig = SupabasePublicConfig & {
  serviceRoleKeyConfigured: boolean;
};

export type AuthProviderMode = "supabase" | "local_cookie_scaffold" | "configuration_error";

export function getSupabaseServerConfig(): SupabaseServerConfig {
  return {
    ...getSupabasePublicConfig(),
    serviceRoleKeyConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

export function getAuthProviderMode(): AuthProviderMode {
  const publicConfig = getSupabasePublicConfig();

  if (publicConfig.url && publicConfig.anonKey && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "supabase";
  }

  if (isLocalAuthFallbackEnabled()) {
    return "local_cookie_scaffold";
  }

  return "configuration_error";
}

export function isSupabaseAuthConfigured() {
  return getAuthProviderMode() === "supabase";
}

export function isLocalAuthFallbackEnabled() {
  return isLocalAppEnv() && process.env.ENABLE_LOCAL_AUTH_FALLBACK === "true";
}

export function getAuthConfigurationErrorMessage() {
  return "Supabase auth is not configured and local auth fallback is disabled for this environment.";
}

export function createSupabaseServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase service client is not configured.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function isLocalAppEnv() {
  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  return appEnv === "local" || appEnv === "development";
}
