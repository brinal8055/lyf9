"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
        {!reports ? (
          <div className="space-y-3">
            <Skeleton className="h-[120px] w-full rounded-ui" />
            <Skeleton className="h-[120px] w-full rounded-ui" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-ui border border-dashed border-white/10 bg-white/[0.02] py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-white/5">
              <span className="text-xl">📄</span>
            </div>
            <p className="mt-4 font-medium text-ivory">No reports yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Upload your first lab report to get AI-assisted explanations and track your health trends.
            </p>
            <Link href="/app/reports/new" className="mt-5 inline-flex items-center rounded-full bg-orange px-4 py-2 text-sm font-medium text-ink transition-all hover:scale-105 active:scale-95">
              Upload report
            </Link>
          </div>
        ) : (
          <>
            {downloadError ? <Alert variant="error">{downloadError}</Alert> : null}
            {reports.map((item) => (
              <div
                className="rounded-ui border border-white/10 bg-white/[0.04] p-4 transition-all hover:border-white/20 hover:bg-white/[0.06]"
                key={item.reportFile.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-ivory">{item.reportFile.originalFilename}</p>
                    <p className="mt-1 text-sm text-muted">
                      {item.reportFile.mimeType} · {Math.round(item.reportFile.fileSizeBytes / 1024)} KB
                    </p>
                  </div>
                  <Badge className="bg-white/10 text-muted">
                    {safeReportStatus(item)}
                  </Badge>
                </div>
                {item.labReport?.reportType ? (
                  <p className="mt-3 text-sm text-muted">
                    Classified as <span className="text-ivory font-medium">{item.labReport.reportType.replaceAll("_", " ")}</span>
                  </p>
                ) : null}
                {item.reportFile.unsupportedReason ? (
                  <Alert variant="warning" className="mt-3">
                    {item.reportFile.unsupportedReason}
                  </Alert>
                ) : null}
                {item.healthInsight ? (
                  <div className="mt-3 rounded-ui border border-white/10 bg-black/20 p-3 text-sm text-muted">
                    <p className="font-medium text-ivory flex items-center gap-2">
                      <span className={`size-2 rounded-full ${item.healthInsight.status.includes('attention') ? 'bg-danger' : 'bg-green'}`} />
                      Insight status: {item.healthInsight.status.replaceAll("_", " ")}
                    </p>
                    <p className="mt-2 leading-6">{item.healthInsight.summary}</p>
                    <p className="mt-2 text-xs italic opacity-70">{item.healthInsight.disclaimer}</p>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
                  <Link className="text-orange transition-colors hover:text-amber-400" href={`/app/reports/${item.reportFile.id}`}>
                    View explanation
                  </Link>
                  <button
                    className="text-orange transition-colors hover:text-amber-400"
                    onClick={() => void downloadPrivateFile(item.reportFile.id)}
                    type="button"
                  >
                    Download PDF
                  </button>
                  <span className="ml-auto text-xs font-normal text-dim">Job: {item.job?.status ?? "missing"}</span>
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
