import type { Metadata } from "next";

import { ReportList } from "@/components/reports/report-list";

export const metadata: Metadata = {
  title: "Reports | Lyf9 AI"
};

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-orange">Report history</p>
        <h1 className="mt-2 text-[36px] font-semibold">Your uploaded reports</h1>
      </div>
      <ReportList />
    </div>
  );
}
