import type { Metadata } from "next";

import { ReportDetail } from "@/components/reports/report-detail";

export const metadata: Metadata = {
  title: "Report explanation | Lyf9 AI"
};

export default async function ReportDetailPage({
  params
}: {
  params: Promise<{ reportFileId: string }>;
}) {
  const { reportFileId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-orange">Report explanation</p>
        <h1 className="mt-2 text-[36px] font-semibold">Source-linked results</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Review extracted markers, source traces, safety routing, reminders, and feedback.
        </p>
      </div>
      <ReportDetail reportFileId={reportFileId} />
    </div>
  );
}
