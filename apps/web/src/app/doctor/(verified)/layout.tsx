import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  getSupabaseUserFromAccessToken,
  shouldUseSupabaseAuth,
  SUPABASE_ACCESS_TOKEN_COOKIE_NAME
} from "@/lib/auth/supabase-auth";
import { getDoctorProfile } from "@/lib/doctors/profiles";

/**
 * Gates the working doctor panel on an *approved* profile.
 *
 * The parent /doctor layout already established authentication and the
 * doctor role. This adds the approval check, which the role row alone does
 * not imply: a suspended doctor keeps their role but must lose panel access
 * immediately. /doctor/pending sits outside this group so a doctor awaiting
 * verification still has somewhere to land.
 */
export default async function VerifiedDoctorLayout({
  children
}: {
  children: React.ReactNode;
}) {
  if (!shouldUseSupabaseAuth()) {
    return <>{children}</>;
  }

  const cookieStore = await cookies();
  const user = await getSupabaseUserFromAccessToken(
    cookieStore.get(SUPABASE_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null
  );

  if (!user) {
    redirect("/login?next=/doctor");
  }

  const profile = await getDoctorProfile(user.id);

  if (!profile || profile.status !== "approved") {
    redirect("/doctor/pending");
  }

  return <>{children}</>;
}
