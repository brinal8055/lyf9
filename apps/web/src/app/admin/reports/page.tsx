import type { Metadata } from "next";

import { AdminReports } from "@/components/admin/admin-reports";

export const metadata: Metadata = {
  title: "Admin reports | Lyf9 AI"
};

export default function AdminReportsPage() {
  return (
    <div className="grid gap-7 sm:gap-8">
      <header className="border-b border-white/10 pb-6">
        <p className="text-sm font-medium text-orange">Admin workspace</p>
        <h1 className="mt-2 text-3xl font-semibold text-ivory sm:text-4xl">Reports and jobs</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted sm:text-base">
          Monitor report processing, safety queues, manual corrections, doctor assignments, and
          audit activity.
        </p>
      </header>
      <AdminReports />
    </div>
  );
}
