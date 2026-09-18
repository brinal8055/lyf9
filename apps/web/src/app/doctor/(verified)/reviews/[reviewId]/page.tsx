import type { Metadata } from "next";

import { DoctorReviewDetail } from "@/components/doctor/doctor-reviews";

export const metadata: Metadata = {
  title: "Doctor review detail | Lyf9 AI"
};

export default async function DoctorReviewDetailPage({
  params
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;

  return (
    <div className="grid gap-7 sm:gap-8">
      <header className="border-b border-white/10 pb-6">
        <p className="text-sm font-medium text-green">Doctor workspace</p>
        <h1 className="mt-2 text-3xl font-semibold text-ivory sm:text-4xl">Review report</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted sm:text-base">
          Compare the report source, extracted biomarkers, safety flags, and AI-assisted draft
          before recording a decision.
        </p>
      </header>
      <DoctorReviewDetail reviewId={reviewId} />
    </div>
  );
}
