import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AUTH_COOKIE_NAME,
  getAuthSecret,
  readSessionCookie
} from "@/lib/auth/session";
import {
  getSupabaseUserFromAccessToken,
  shouldUseSupabaseAuth,
  SUPABASE_ACCESS_TOKEN_COOKIE_NAME
} from "@/lib/auth/supabase-auth";
import { roleCanAccess } from "@/lib/auth/roles";

/**
 * Authentication + role gate for every /doctor route.
 *
 * The approved-profile check lives in the nested (verified) layout rather
 * than here, so /doctor/pending stays reachable for doctors awaiting
 * verification without creating a redirect loop.
 */
export default async function DoctorLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const user = shouldUseSupabaseAuth()
    ? await getSupabaseUserFromAccessToken(
        cookieStore.get(SUPABASE_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null
      )
    : readSessionCookie(
        cookieStore.get(AUTH_COOKIE_NAME)?.value,
        getAuthSecret()
      );

  if (!user) {
    redirect("/login?next=/doctor");
  }

  if (!roleCanAccess(user.role, ["doctor"])) {
    redirect("/app");
  }

  return <>{children}</>;
}
