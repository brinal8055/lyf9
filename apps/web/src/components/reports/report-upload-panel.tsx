"use client";

import { useState } from "react";

import { ReportList } from "./report-list";
import { ReportUploadForm } from "./report-upload-form";

export function ReportUploadPanel() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <ReportUploadForm onUploaded={() => setRefreshKey((value) => value + 1)} />
      <ReportList refreshKey={refreshKey} />
    </div>
  );
}
