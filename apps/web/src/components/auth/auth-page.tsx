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
    <div className="min-h-screen bg-sand text-forest font-hanken lg:grid lg:grid-cols-2">
      {/* Left panel — brand & value prop */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-forest-deep p-12 lg:flex">
        {/* Background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_60%,rgba(31,132,114,0.15),transparent_60%)]" />

        {/* Logo */}
        <Link href="/" className="relative flex flex-col">
          <span className="text-lg font-extrabold text-sand tracking-tight">{PRODUCT_NAME}</span>
          <span className="text-sm font-medium text-fog">{PRODUCT_DOMAIN}</span>
        </Link>

        {/* Value prop */}
        <div className="relative">
          <h2 className="text-[40px] font-extrabold leading-[1.05] tracking-tight text-sand">
            Your health data,<br />
            <span className="font-newsreader font-medium italic text-terracotta">
              finally explained.
            </span>
          </h2>
          <p className="mt-5 text-lg font-medium leading-[1.6] text-fog">
            Upload a blood report. Get plain-language biomarker explanations with optional doctor review.
          </p>
          <div className="mt-8 grid gap-4">
            {trustPoints.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-[15px] font-medium text-[#CFE3DA]">
                <Icon className="size-5 text-forest-glow flex-shrink-0" aria-hidden />
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="relative text-[13px] font-medium text-[#7E8C84]">
          Private beta · Medical decisions require qualified doctors.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 relative z-10">
        {/* Mobile logo only */}
        <Link href="/" className="mb-8 flex flex-col items-center lg:hidden">
          <span className="text-xl font-extrabold text-forest tracking-tight">{PRODUCT_NAME}</span>
          <span className="text-sm font-semibold text-sage">{PRODUCT_DOMAIN}</span>
        </Link>
        <Suspense>
          <AuthForm mode={mode} />
        </Suspense>
      </div>
    </div>
  );
}
