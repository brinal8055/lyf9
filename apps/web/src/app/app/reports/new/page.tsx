import type { Metadata } from "next";

import { ReportUploadPanel } from "@/components/reports/report-upload-panel";

export const metadata: Metadata = {
  title: "Upload report | Lyf9 AI"
};

export default function NewReportPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-orange">Phase 2</p>
        <h1 className="mt-2 text-[36px] font-semibold">Upload lab report</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Required consent is complete. Files are stored through a local private
          storage equivalent and processing jobs are simulated without AI
          interpretation.
        </p>
      </div>
      <ReportUploadPanel />
    </div>
  );
}
