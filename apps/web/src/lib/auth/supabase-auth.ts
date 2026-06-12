import { CONSENT_VERSION } from "@lyf9/shared";

import {
  createSupabaseAnonClient
} from "./providers/supabase";
import {
  createSupabaseServiceClient,
  getAuthConfigurationErrorMessage,
  getAuthProviderMode,
  isSupabaseAuthConfigured
} from "./providers/supabase-server";
import {
  SUPABASE_ACCESS_TOKEN_COOKIE_NAME,
  SUPABASE_REFRESH_TOKEN_COOKIE_NAME
} from "./constants";
import type { SessionUser } from "./session";
import type { UserRole } from "@/lib/reports/types";

export { SUPABASE_ACCESS_TOKEN_COOKIE_NAME, SUPABASE_REFRESH_TOKEN_COOKIE_NAME };
export { getAuthConfigurationErrorMessage };

const defaultRole: UserRole = "user";

export function shouldUseSupabaseAuth() {
  return isSupabaseAuthConfigured();
}

export function shouldUseLocalAuthFallback() {
  return getAuthProviderMode() === "local_cookie_scaffold";
}

export function hasAuthConfigurationError() {
  return getAuthProviderMode() === "configuration_error";
}

export async function signUpWithSupabase(input: {
  email: string;
  name: string;
  password: string;
}) {
  const authClient = createSupabaseAnonClient();
  const result = await authClient.auth.signUp({
    email: input.email,
    options: {
      data: {
        full_name: input.name
      }
    },
    password: input.password
  });

  if (result.error || !result.data.user) {
    throw new Error(result.error?.message ?? "Unable to sign up.");
  }

  const userId = result.data.user.id;
  await ensureSupabaseUserFoundation({
    email: input.email,
    fullName: input.name,
    userId
  });

  return {
    accessToken: result.data.session?.access_token ?? null,
    refreshToken: result.data.session?.refresh_token ?? null,
    user: {
      email: input.email,
      id: userId,
      name: input.name,
      role: defaultRole
    }
  };
}

export async function signInWithSupabase(input: {
  email: string;
  password: string;
}) {
  const authClient = createSupabaseAnonClient();
  const result = await authClient.auth.signInWithPassword({
    email: input.email,
    password: input.password
  });

  if (result.error || !result.data.session || !result.data.user) {
    throw new Error(result.error?.message ?? "Invalid email or password.");
  }

  const userId = result.data.user.id;
  const name =
    getStringMetadata(result.data.user.user_metadata.full_name) ??
    getStringMetadata(result.data.user.user_metadata.name) ??
    input.email.split("@")[0];
  await ensureSupabaseUserFoundation({
    email: input.email,
    fullName: name,
    userId
  });

  return {
    accessToken: result.data.session.access_token,
    refreshToken: result.data.session.refresh_token,
    user: {
      email: input.email,
      id: userId,
      name,
      role: await getTrustedUserRole(userId)
    }
  };
}

export async function getSupabaseUserFromAccessToken(token: string | null) {
  if (!token) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.auth.getUser(token);

  if (error || !data.user?.email) {
    return null;
  }

  return {
    email: data.user.email.toLowerCase(),
    id: data.user.id,
    name:
      getStringMetadata(data.user.user_metadata.full_name) ??
      getStringMetadata(data.user.user_metadata.name) ??
      data.user.email.split("@")[0],
    role: await getTrustedUserRole(data.user.id)
  } satisfies SessionUser;
}

export async function getTrustedUserRole(userId: string): Promise<UserRole> {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to resolve user role: ${error.message}`);
  }

  return isUserRole(data?.role) ? data.role : defaultRole;
}

export async function grantSupabaseRole(input: {
  actorUserId: string | null;
  role: UserRole;
  targetUserId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const existing = await serviceClient
    .from("user_roles")
    .select("id")
    .eq("user_id", input.targetUserId)
    .eq("role", input.role)
    .is("revoked_at", null)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`Unable to check existing role: ${existing.error.message}`);
  }

  if (existing.data?.id) {
    return;
  }

  const { error } = await serviceClient.from("user_roles").insert({
    granted_at: new Date().toISOString(),
    granted_by: input.actorUserId,
    revoked_at: null,
    role: input.role,
    user_id: input.targetUserId
  });

  if (error) {
    throw new Error(`Unable to grant role: ${error.message}`);
  }
}

export async function ensureSupabaseUserFoundation(input: {
  email: string;
  fullName: string;
  userId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error: profileError } = await serviceClient.from("user_profiles").upsert(
    {
      email: input.email,
      full_name: input.fullName,
      updated_at: now,
      user_id: input.userId
    },
    { onConflict: "user_id" }
  );

  if (profileError) {
    throw new Error(`Unable to create user profile: ${profileError.message}`);
  }

  await grantSupabaseRole({
    actorUserId: null,
    role: defaultRole,
    targetUserId: input.userId
  });

  await writeSupabaseAuditLog({
    action: "user_profile_created",
    actorRole: "user",
    actorUserId: input.userId,
    metadata: { consentVersion: CONSENT_VERSION },
    resourceId: input.userId,
    resourceType: "user_profile"
  });
}

export async function writeSupabaseAuditLog(input: {
  action: string;
  actorRole: UserRole | null;
  actorUserId: string | null;
  metadata: Record<string, unknown>;
  resourceId: string | null;
  resourceType: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const { error } = await serviceClient.from("audit_logs").insert({
    action: input.action,
    actor_role: input.actorRole,
    actor_user_id: input.actorUserId,
    entity_id: input.resourceId,
    entity_type: input.resourceType,
    metadata: input.metadata,
    resource_id: input.resourceId,
    resource_type: input.resourceType,
    safe_metadata: input.metadata
  });

  if (error) {
    throw new Error(`Unable to write audit log: ${error.message}`);
  }
}

function getStringMetadata(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isUserRole(value: unknown): value is UserRole {
  return value === "user" || value === "admin" || value === "doctor" || value === "superadmin";
}
