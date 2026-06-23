"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { PRODUCT_NAME } from "@lyf9/shared";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/reports/types";

const navLinks = [
  { label: "Reports", href: "/app/reports" },
  { label: "Upload", href: "/app/reports/new" },
  { label: "Timeline", href: "/app/timeline" },
  { label: "Profile", href: "/app/profile" },
  { label: "Consent", href: "/app/consent" },
  { label: "Questionnaire", href: "/app/questionnaire" },
  { label: "Pricing", href: "/app/pricing" }
];

function NavLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      className={cn(
        "rounded-full px-3 py-2 text-sm transition-colors duration-150",
        isActive
          ? "bg-white/10 text-ivory font-medium"
          : "text-muted hover:bg-white/5 hover:text-ivory"
      )}
      href={href}
      onClick={onClick}
    >
      {label}
    </Link>
  );
}

export function AppNav({ role, userName }: { role: UserRole; userName: string }) {
  const router = useRouter();
  const canSeeAdmin = role === "admin" || role === "superadmin";
  const canSeeDoctor = role === "doctor" || role === "superadmin";
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const allLinks = [
    ...navLinks,
    ...(canSeeDoctor ? [{ label: "Doctor", href: "/doctor/reviews" }] : []),
    ...(canSeeAdmin ? [{ label: "Admin", href: "/admin/reports" }] : [])
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-shell items-center justify-between px-5 sm:px-8">
        {/* Logo + user */}
        <div className="flex items-center gap-4">
          <Link className="flex flex-col" href="/app">
            <span className="text-base font-semibold text-ivory">{PRODUCT_NAME}</span>
          </Link>
          {/* User avatar */}
          <span className="hidden sm:flex size-7 items-center justify-center rounded-full bg-orange/20 text-xs font-bold text-orange">
            {userName.charAt(0).toUpperCase()}
          </span>
          <span className="hidden sm:block text-sm text-muted">{userName}</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          {allLinks.map((link) => (
            <NavLink key={link.href} href={link.href} label={link.label} />
          ))}
          <div className="ml-2">
            <Button onClick={logout} variant="secondary">
              Log out
            </Button>
          </div>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="flex items-center justify-center rounded-ui p-2 text-muted hover:bg-white/5 hover:text-ivory lg:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          type="button"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="border-t border-white/10 bg-ink/95 px-5 py-4 lg:hidden animate-fade-in">
          <nav className="flex flex-col gap-1">
            {allLinks.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                onClick={() => setMobileOpen(false)}
              />
            ))}
          </nav>
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="mb-3 text-xs text-dim">Signed in as {userName}</p>
            <Button onClick={logout} variant="secondary" className="w-full">
              Log out
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
