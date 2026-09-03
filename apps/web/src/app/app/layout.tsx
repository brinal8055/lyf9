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

export default async function AppLayout({
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
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-ink text-ivory">
      <AppNav role={user.role} userName={user.name} />
      <main className="mx-auto max-w-shell px-5 py-10 sm:px-8">{children}</main>
    </div>
  );
}
