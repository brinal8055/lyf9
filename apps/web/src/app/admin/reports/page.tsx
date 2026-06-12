import type { Metadata } from "next";

import { AdminReports } from "@/components/admin/admin-reports";

export const metadata: Metadata = {
  title: "Admin reports | Lyf9 AI"
};

export default function AdminReportsPage() {
  return (
    <main className="min-h-screen bg-ink px-5 py-10 text-ivory sm:px-8">
      <div className="mx-auto max-w-shell space-y-6">
        <div>
          <p className="text-sm text-orange">Admin review</p>
          <h1 className="mt-2 text-[36px] font-semibold">Reports and jobs</h1>
          <p className="mt-3 max-w-2xl text-muted">
            Operational view for uploaded report metadata, parser output,
            processing jobs, manual corrections, doctor assignments, and audit logs.
          </p>
        </div>
        <AdminReports />
      </div>
    </main>
  );
}
