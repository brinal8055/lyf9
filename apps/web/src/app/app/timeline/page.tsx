import type { Metadata } from "next";

import { HealthTimeline } from "@/components/reports/health-timeline";

export const metadata: Metadata = {
  title: "Health timeline | Lyf9 AI"
};

export default function TimelinePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-orange">Health timeline</p>
        <h1 className="mt-2 text-[36px] font-semibold">Your reports over time</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Track repeated biomarkers, report history, reminders, and source-linked explanations.
        </p>
      </div>
      <HealthTimeline />
    </div>
  );
}
