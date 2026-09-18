import type { Metadata } from "next";

import { DoctorReviewQueue } from "@/components/doctor/doctor-reviews";

export const metadata: Metadata = {
  title: "Doctor reviews | Lyf9 AI"
};

export default function DoctorReviewsPage() {
  return (
    <div className="grid gap-7 sm:gap-8">
      <header className="border-b border-white/10 pb-6">
        <p className="text-sm font-medium text-green">Doctor workspace</p>
        <h1 className="mt-2 text-3xl font-semibold text-ivory sm:text-4xl">Assigned reports</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted sm:text-base">
          Review assigned reports with source values, risk flags, and AI-assisted drafts available
          for each decision.
        </p>
      </header>
      <DoctorReviewQueue />
    </div>
  );
}
