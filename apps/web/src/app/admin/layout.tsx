import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppNav } from "@/components/app/app-nav";
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

export default async function AdminLayout({
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
    redirect("/login?next=/admin");
  }

  if (!roleCanAccess(user.role, ["admin"])) {
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-ink text-ivory">
      <AppNav role={user.role} userName={user.name} />
      <main className="mx-auto w-full max-w-shell px-5 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
