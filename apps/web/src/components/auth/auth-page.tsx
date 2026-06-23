import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, ShieldCheck, Stethoscope } from "lucide-react";

import { PRODUCT_DOMAIN, PRODUCT_NAME } from "@lyf9/shared";

import { AuthForm } from "@/components/auth/auth-form";

const trustPoints = [
  { icon: ShieldCheck, text: "Privacy-first. Your reports stay private." },
  { icon: CheckCircle2, text: "Source-linked biomarker explanations." },
  { icon: Stethoscope, text: "Doctor review available on every report." }
];

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  return (
    <div className="min-h-screen bg-ink text-ivory lg:grid lg:grid-cols-2">
      {/* Left panel — brand & value prop */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-charcoal p-12 lg:flex">
        {/* Background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_60%,rgba(255,106,61,0.12),transparent_60%)]" />

        {/* Logo */}
        <Link href="/" className="relative flex flex-col">
          <span className="text-lg font-semibold text-ivory">{PRODUCT_NAME}</span>
          <span className="text-sm text-muted">{PRODUCT_DOMAIN}</span>
        </Link>

        {/* Value prop */}
        <div className="relative">
          <h2 className="text-[40px] font-semibold leading-[1.1] text-ivory">
            Your health data,{" "}
            <span className="bg-gradient-to-r from-orange to-amber-400 bg-clip-text text-transparent">
              finally explained.
            </span>
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted">
            Upload a blood report. Get plain-language biomarker explanations with optional doctor review.
          </p>
          <div className="mt-8 grid gap-4">
            {trustPoints.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-muted">
                <Icon className="size-4 text-green flex-shrink-0" aria-hidden />
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="relative text-xs text-dim">
          Private beta · Medical decisions require qualified doctors.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo only */}
        <Link href="/" className="mb-8 flex flex-col items-center lg:hidden">
          <span className="text-lg font-semibold text-ivory">{PRODUCT_NAME}</span>
          <span className="text-sm text-muted">{PRODUCT_DOMAIN}</span>
        </Link>
        <Suspense>
          <AuthForm mode={mode} />
        </Suspense>
      </div>
    </div>
  );
}
