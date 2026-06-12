"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  HealthInsightRecord,
  LabReportRecord,
  ProcessingJobRecord,
  ReportFileRecord
} from "@/lib/reports/types";

type ReportListItem = {
  healthInsight: HealthInsightRecord | null;
  job: ProcessingJobRecord | null;
  labReport: LabReportRecord | null;
  reportFile: ReportFileRecord;
};

export function ReportList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    let isMounted = true;
    fetch("/api/reports")
      .then((response) => response.json())
      .then((body: { reports: ReportListItem[] }) => {
        if (isMounted) {
          setReports(body.reports ?? []);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  async function downloadPrivateFile(reportFileId: string) {
    setDownloadError("");
    const response = await fetch(`/api/reports/${reportFileId}/download-url`, { method: "POST" });

    if (!response.ok) {
      setDownloadError("Private file download is not available for this report.");
      return;
    }

    const body = (await response.json()) as { downloadUrl: string };
    window.location.href = body.downloadUrl;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report history</CardTitle>
        <CardContent>
          Files stay private. Signed download links are short-lived and audited.
        </CardContent>
      </CardHeader>
      <div className="grid gap-3">
        {reports.length === 0 ? (
          <p className="text-sm text-muted">No uploaded reports yet.</p>
        ) : (
          <>
            {downloadError ? <p className="text-sm text-danger">{downloadError}</p> : null}
            {reports.map((item) => (
              <div
                className="rounded-ui border border-white/10 bg-white/[0.04] p-4"
                key={item.reportFile.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-ivory">{item.reportFile.originalFilename}</p>
                    <p className="mt-1 text-sm text-muted">
                      {item.reportFile.mimeType} · {Math.round(item.reportFile.fileSizeBytes / 1024)} KB
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted">
                    {safeReportStatus(item)}
                  </span>
                </div>
                {item.labReport?.reportType ? (
                  <p className="mt-3 text-sm text-muted">
                    Classified as {item.labReport.reportType.replaceAll("_", " ")}
                  </p>
                ) : null}
                {item.reportFile.unsupportedReason ? (
                  <p className="mt-3 text-sm text-yellow">{item.reportFile.unsupportedReason}</p>
                ) : null}
                {item.healthInsight ? (
                  <div className="mt-3 rounded-ui border border-white/10 bg-black/20 p-3 text-sm text-muted">
                    <p className="font-medium text-ivory">
                      Insight status: {item.healthInsight.status.replaceAll("_", " ")}
                    </p>
                    <p className="mt-2">{item.healthInsight.summary}</p>
                    <p className="mt-2 text-xs">{item.healthInsight.disclaimer}</p>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Link className="text-orange hover:underline" href={`/app/reports/${item.reportFile.id}`}>
                    View explanation
                  </Link>
                  <button
                    className="text-left text-orange hover:underline"
                    onClick={() => void downloadPrivateFile(item.reportFile.id)}
                    type="button"
                  >
                    Download private file
                  </button>
                  <span className="text-muted">Job: {item.job?.status ?? "missing"}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}

function safeReportStatus(item: ReportListItem) {
  if (item.reportFile.status === "deleted" || item.reportFile.deletedAt) return "Deleted";
  if (item.reportFile.status === "upload_pending") return "Upload pending";
  if (item.reportFile.status === "rejected_file_type") return "Rejected file type";
  if (item.reportFile.status === "rejected_file_size") return "Rejected file size";
  if (item.reportFile.status === "unsupported") return "Report type unsupported";
  if (item.reportFile.scanStatus === "scan_pending") return "Security scan pending";
  if (item.reportFile.scanStatus === "scan_failed") return "Security scan failed";
  if (item.reportFile.scanStatus === "scan_configuration_required") return "Processing not configured yet";
  if (item.job?.currentStep === "extract_document" && item.job.status === "running") return "Extracting report text";
  if (item.job?.currentStep === "ocr_fallback") return "OCR extraction pending";
  if (item.job?.currentStep === "classify_report") return "Document extracted";
  if (item.job?.currentStep === "extract_biomarkers" && item.job.status === "blocked") {
    return "Biomarker extraction not configured yet";
  }
  if (item.job?.errorCode === "report_classification_unknown") return "Manual review required";
  if (item.reportFile.scanStatus === "scan_passed" && item.job?.status === "blocked") return "Processing paused";
  if (item.job?.status === "queued") return "Processing queued";
  if (item.job?.status === "retry_scheduled") return "Processing queued for retry";
  if (item.job?.status === "waiting" || item.job?.status === "blocked") return "Processing paused";
  if (item.job?.status === "failed") return "Processing failed";
  if (item.healthInsight) return "Result ready";
  return "Upload complete";
}
