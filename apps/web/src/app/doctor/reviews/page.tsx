import type { Metadata } from "next";

import { DoctorReviewQueue } from "@/components/doctor/doctor-reviews";

export const metadata: Metadata = {
  title: "Doctor reviews | Lyf9 AI"
};

export default function DoctorReviewsPage() {
  return (
    <main className="min-h-screen bg-ink px-5 py-10 text-ivory sm:px-8">
      <div className="mx-auto max-w-shell space-y-6">
        <div>
          <p className="text-sm text-orange">Doctor review</p>
          <h1 className="mt-2 text-[36px] font-semibold">Assigned reports</h1>
          <p className="mt-3 max-w-2xl text-muted">
            Review only reports assigned to this doctor account. Source values,
            risk flags, and AI drafts are shown for approval decisions.
          </p>
        </div>
        <DoctorReviewQueue />
      </div>
    </main>
  );
}
