"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { PRODUCT_NAME } from "@lyf9/shared";

import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/reports/types";

export function AppNav({ role, userName }: { role: UserRole; userName: string }) {
  const router = useRouter();
  const canSeeAdmin = role === "admin" || role === "superadmin";
  const canSeeDoctor = role === "doctor" || role === "superadmin";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-b border-white/10 bg-ink/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-shell flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link className="text-base font-semibold text-ivory" href="/app">
            {PRODUCT_NAME}
          </Link>
          <p className="text-sm text-muted">Signed in as {userName}</p>
        </div>
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          <Link className="rounded-full px-3 py-2 text-muted hover:bg-white/5 hover:text-ivory" href="/app/profile">
            Profile
          </Link>
          <Link className="rounded-full px-3 py-2 text-muted hover:bg-white/5 hover:text-ivory" href="/app/questionnaire">
            Questionnaire
          </Link>
          <Link className="rounded-full px-3 py-2 text-muted hover:bg-white/5 hover:text-ivory" href="/app/consent">
            Consent
          </Link>
          <Link className="rounded-full px-3 py-2 text-muted hover:bg-white/5 hover:text-ivory" href="/app/reports">
            Reports
          </Link>
          <Link className="rounded-full px-3 py-2 text-muted hover:bg-white/5 hover:text-ivory" href="/app/timeline">
            Timeline
          </Link>
          <Link className="rounded-full px-3 py-2 text-muted hover:bg-white/5 hover:text-ivory" href="/app/pricing">
            Pricing
          </Link>
          <Link className="rounded-full px-3 py-2 text-muted hover:bg-white/5 hover:text-ivory" href="/app/reports/new">
            Upload
          </Link>
          {canSeeDoctor ? (
            <Link className="rounded-full px-3 py-2 text-muted hover:bg-white/5 hover:text-ivory" href="/doctor/reviews">
              Doctor
            </Link>
          ) : null}
          {canSeeAdmin ? (
            <Link className="rounded-full px-3 py-2 text-muted hover:bg-white/5 hover:text-ivory" href="/admin/reports">
              Admin
            </Link>
          ) : null}
          <Button onClick={logout} variant="secondary">
            Log out
          </Button>
        </nav>
      </div>
    </header>
  );
}
