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
    <main className="min-h-screen bg-ink px-5 py-10 text-ivory sm:px-8">
      <div className="mx-auto max-w-shell space-y-6">
        <div>
          <p className="text-sm text-orange">Doctor review</p>
          <h1 className="mt-2 text-[36px] font-semibold">Review report</h1>
          <p className="mt-3 max-w-2xl text-muted">
            Approve, edit and approve, reject, request more information, or mark urgent.
            Doctor-reviewed output appears to the user only after approval.
          </p>
        </div>
        <DoctorReviewDetail reviewId={reviewId} />
      </div>
    </main>
  );
}
