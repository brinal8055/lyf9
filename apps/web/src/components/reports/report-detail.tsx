"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, MessageSquareText, Stethoscope } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MarkerCardModel, MarkerGroupKey } from "@/lib/reports/presentation";
import type {
  BiomarkerResultRecord,
  FeedbackEventRecord,
  HealthInsightRecord,
  HealthRiskFlagRecord,
  LabReportRecord,
  ProcessingJobRecord,
  ReminderRecord,
  ReportFileRecord
} from "@/lib/reports/types";

type ReportDetailPayload = {
  biomarkerResults: BiomarkerResultRecord[];
  feedbackEvents: FeedbackEventRecord[];
  healthInsight: HealthInsightRecord | null;
  job: ProcessingJobRecord | null;
  labReport: LabReportRecord | null;
  markerCards: MarkerCardModel[];
  reminders: ReminderRecord[];
  reportFile: ReportFileRecord;
  riskFlags: HealthRiskFlagRecord[];
  unsupportedSections: string[];
};

const groupLabels: Record<MarkerGroupKey, string> = {
  critical: "Critical",
  monitor: "Monitor",
  needs_attention: "Needs Attention",
  normal: "Normal"
};

export function ReportDetail({ reportFileId }: { reportFileId: string }) {
  const [report, setReport] = useState<ReportDetailPayload | null>(null);
  const [error, setError] = useState("");
  const [reminderStatus, setReminderStatus] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/reports/${reportFileId}`)
      .then((response) => response.json())
      .then((body: { error?: string; report?: ReportDetailPayload }) => {
        if (!isMounted) {
          return;
        }
        if (body.error || !body.report) {
          setError(body.error ?? "Report could not be loaded.");
          return;
        }
        setReport(body.report);
      });
    return () => {
      isMounted = false;
    };
  }, [reportFileId]);

  const groupedMarkers = useMemo(() => groupMarkers(report?.markerCards ?? []), [report]);

  async function createReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!report) return;

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/reminders", {
      body: JSON.stringify({
        canonicalBiomarkerKey: form.get("canonicalBiomarkerKey") || null,
        note: form.get("note") || null,
        reminderDate: form.get("reminderDate"),
        reportFileId: report.reportFile.id,
        title: form.get("title") || "Retest reminder"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    setReminderStatus(response.ok ? "Reminder scheduled." : "Reminder could not be scheduled.");
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!report) return;

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/feedback", {
      body: JSON.stringify({
        confusingText: form.get("confusingText") || null,
        doctorReviewId: form.get("doctorReviewId") || null,
        feedbackSurface: form.get("feedbackSurface") || "report_result",
        freeText: form.get("freeText") || null,
        helpful: form.get("helpful"),
        reportFileId: report.reportFile.id,
        wouldTrustDoctorReview: form.get("wouldTrustDoctorReview")
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    setFeedbackStatus(response.ok ? "Thanks. Feedback saved." : "Feedback could not be saved.");
  }

  if (error) {
    return <Alert className="border-danger/30 bg-danger/10">{error}</Alert>;
  }

  if (!report) {
    return <Alert>Loading report explanation.</Alert>;
  }

  const reviewLabel = reviewLabelForStatus(report.healthInsight?.status);

  return (
    <div className="space-y-6">
      <section className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2">
              <Badge>{reviewLabel}</Badge>
              <Badge>{safeDetailStatus(report)}</Badge>
              {report.labReport?.reportType ? (
                <Badge>{report.labReport.reportType.replaceAll("_", " ")}</Badge>
              ) : null}
            </div>
            <CardTitle className="mt-4">{report.reportFile.originalFilename}</CardTitle>
            <CardContent>
              {report.healthInsight?.summary ??
                report.reportFile.unsupportedReason ??
                "Lyf9 AI is still processing this report."}
            </CardContent>
          </CardHeader>
          {report.healthInsight ? (
            <Alert>{report.healthInsight.disclaimer}</Alert>
          ) : (
            <Alert>
              This is an AI-assisted explanation, not a diagnosis or prescription. Please discuss important findings with a qualified doctor.
            </Alert>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review state</CardTitle>
            <CardContent>
              {report.riskFlags.length > 0
                ? "Some values need review before relying on an AI-only explanation."
                : "No review flags were created by the current safety checks."}
            </CardContent>
          </CardHeader>
          <div className="space-y-3">
            {report.riskFlags.map((flag) => (
              <div className="rounded-ui border border-white/10 bg-white/[0.04] p-3" key={flag.id}>
                <p className="flex items-center gap-2 text-sm font-medium text-ivory">
                  <AlertTriangle className="size-4 text-yellow" aria-hidden />
                  {flag.flagType.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-sm text-muted">{flag.reason}</p>
              </div>
            ))}
            <Button variant="secondary">
              <Stethoscope className="mr-2 size-4" aria-hidden />
              Request doctor review
            </Button>
          </div>
        </Card>
      </section>

      {report.unsupportedSections.length > 0 || report.reportFile.unsupportedReason ? (
        <Alert className="border-yellow/30 bg-yellow/10">
          Unsupported sections: {report.unsupportedSections.join(", ") || report.reportFile.unsupportedReason}
        </Alert>
      ) : null}

      <section className="grid gap-6">
        {(Object.keys(groupLabels) as MarkerGroupKey[]).map((group) => (
          <MarkerGroup
            group={group}
            key={group}
            markers={groupedMarkers[group]}
          />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Set a retest reminder</CardTitle>
            <CardContent>
              Suggested reminders are planning aids. They are not diagnosis or treatment advice.
            </CardContent>
          </CardHeader>
          <form className="grid gap-3" onSubmit={createReminder}>
            <Input name="title" placeholder="Retest discussion reminder" required />
            <Input name="reminderDate" required type="date" />
            <Select name="canonicalBiomarkerKey">
              <option value="">General report reminder</option>
              {report.markerCards.map((card) => (
                <option
                  key={card.biomarker.id}
                  value={card.biomarker.canonicalBiomarkerKey ?? ""}
                >
                  {card.biomarker.canonicalName ?? card.biomarker.rawName}
                </option>
              ))}
            </Select>
            <Textarea name="note" placeholder="Optional note for yourself" />
            <Button type="submit">
              <CalendarPlus className="mr-2 size-4" aria-hidden />
              Save reminder
            </Button>
            {reminderStatus ? <p className="text-sm text-muted">{reminderStatus}</p> : null}
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feedback</CardTitle>
            <CardContent>Help us improve clarity and decide where doctor review matters most.</CardContent>
          </CardHeader>
          <form className="grid gap-3" onSubmit={submitFeedback}>
            <input name="feedbackSurface" type="hidden" value="report_result" />
            <label className="grid gap-2 text-sm text-muted">
              Was this explanation helpful?
              <Select name="helpful" required>
                <option value="yes">Yes</option>
                <option value="unsure">Unsure</option>
                <option value="no">No</option>
              </Select>
            </label>
            <label className="grid gap-2 text-sm text-muted">
              Would you trust doctor review?
              <Select name="wouldTrustDoctorReview" required>
                <option value="yes">Yes</option>
                <option value="unsure">Unsure</option>
                <option value="no">No</option>
              </Select>
            </label>
            <Textarea name="confusingText" placeholder="What was confusing?" />
            <Textarea name="freeText" placeholder="Optional feedback" />
            <Button type="submit">
              <MessageSquareText className="mr-2 size-4" aria-hidden />
              Submit feedback
            </Button>
            {feedbackStatus ? <p className="text-sm text-muted">{feedbackStatus}</p> : null}
          </form>
        </Card>

        {report.healthInsight?.status === "doctor_reviewed" ? (
          <Card>
            <CardHeader>
              <CardTitle>Doctor review feedback</CardTitle>
              <CardContent>Tell us whether the reviewed output felt clear and useful.</CardContent>
            </CardHeader>
            <form className="grid gap-3" onSubmit={submitFeedback}>
              <input name="doctorReviewId" type="hidden" value={report.healthInsight.doctorReviewId ?? ""} />
              <input name="feedbackSurface" type="hidden" value="doctor_review" />
              <label className="grid gap-2 text-sm text-muted">
                Was the reviewed explanation helpful?
                <Select name="helpful" required>
                  <option value="yes">Yes</option>
                  <option value="unsure">Unsure</option>
                  <option value="no">No</option>
                </Select>
              </label>
              <label className="grid gap-2 text-sm text-muted">
                Would you trust doctor review?
                <Select name="wouldTrustDoctorReview" required>
                  <option value="yes">Yes</option>
                  <option value="unsure">Unsure</option>
                  <option value="no">No</option>
                </Select>
              </label>
              <Textarea name="confusingText" placeholder="What was confusing?" />
              <Textarea name="freeText" placeholder="Optional feedback" />
              <Button type="submit">
                <MessageSquareText className="mr-2 size-4" aria-hidden />
                Submit review feedback
              </Button>
            </form>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

function MarkerGroup({
  group,
  markers
}: {
  group: MarkerGroupKey;
  markers: MarkerCardModel[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{groupLabels[group]}</CardTitle>
        <CardContent>{markers.length} source-linked marker{markers.length === 1 ? "" : "s"}</CardContent>
      </CardHeader>
      <div className="grid gap-3 md:grid-cols-2">
        {markers.map((marker) => (
          <MarkerCard marker={marker} key={marker.biomarker.id} />
        ))}
        {markers.length === 0 ? <p className="text-sm text-muted">No markers in this group.</p> : null}
      </div>
    </Card>
  );
}

function MarkerCard({ marker }: { marker: MarkerCardModel }) {
  const biomarker = marker.biomarker;

  function trackMarkerOpen() {
    void fetch("/api/analytics", {
      body: JSON.stringify({
        eventName: "marker_card_opened",
        labReportId: biomarker.labReportId,
        metadata: {
          biomarkerResultId: biomarker.id,
          canonicalBiomarkerKey: biomarker.canonicalBiomarkerKey
        }
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
  }

  return (
    <article className="rounded-ui border border-white/10 bg-white/[0.04] p-4" onClick={trackMarkerOpen}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="font-medium text-ivory">{biomarker.canonicalName ?? biomarker.rawName}</h4>
          <p className="mt-1 text-sm text-muted">{biomarker.rawName}</p>
        </div>
        <Badge className={flagClassName(biomarker.systemFlag)}>{biomarker.systemFlag}</Badge>
      </div>
      <div className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2">
        <p>
          Source value:{" "}
          <span className="text-ivory">
            {biomarker.valueNumeric ?? biomarker.valueText ?? "unknown"} {biomarker.unit ?? ""}
          </span>
        </p>
        <p>Lab range: {biomarker.referenceRangeText ?? "Not provided"}</p>
        <p>Confidence: {Math.round(biomarker.confidenceScore * 100)}%</p>
        <p>Review: {biomarker.reviewRouting.replaceAll("_", " ")}</p>
        <p>
          Previous:{" "}
          {marker.previousValue
            ? `${marker.previousValue.value} ${marker.previousValue.unit ?? ""}`
            : "No previous value"}
        </p>
        <p>Page: {biomarker.pageNumber ?? "Unknown"}</p>
      </div>
      {biomarker.isManuallyCorrected ? (
        <div className="mt-3 rounded-ui border border-yellow/20 bg-yellow/10 p-3 text-xs leading-5 text-muted">
          Admin correction overlay:{" "}
          <span className="text-ivory">
            {biomarker.correctedValueNumeric ?? biomarker.correctedValueText ?? "value unchanged"}{" "}
            {biomarker.correctedUnit ?? biomarker.unit ?? ""}
          </span>
          {biomarker.correctionReason ? ` · ${biomarker.correctionReason}` : ""}
        </div>
      ) : null}
      {marker.explanation ? <p className="mt-3 text-sm text-muted">{marker.explanation}</p> : null}
      <div className="mt-3 rounded-ui border border-white/10 bg-black/20 p-3 text-xs leading-5 text-muted">
        Source trace: {biomarker.sourceText}
      </div>
    </article>
  );
}

function reviewLabelForStatus(status: HealthInsightRecord["status"] | undefined) {
  if (status === "doctor_reviewed") return "Doctor-reviewed";
  if (status === "doctor_review_required") return "Doctor review recommended";
  if (status === "rejected") return "Doctor review not published";
  return "AI-only explanation";
}

function safeDetailStatus(report: ReportDetailPayload) {
  if (report.reportFile.status === "deleted" || report.reportFile.deletedAt) return "Deleted";
  if (report.reportFile.status === "upload_pending") return "Upload pending";
  if (report.reportFile.status === "rejected_file_type") return "Rejected file type";
  if (report.reportFile.status === "rejected_file_size") return "Rejected file size";
  if (report.reportFile.status === "unsupported") return "Report type unsupported";
  if (report.reportFile.scanStatus === "scan_pending") return "Security scan pending";
  if (report.reportFile.scanStatus === "scan_failed") return "Security scan failed";
  if (report.reportFile.scanStatus === "scan_configuration_required") return "Processing not configured yet";
  if (report.job?.currentStep === "extract_document" && report.job.status === "running") return "Extracting report text";
  if (report.job?.currentStep === "ocr_fallback") return "OCR extraction pending";
  if (report.job?.currentStep === "classify_report") return "Document extracted";
  if (report.job?.currentStep === "extract_biomarkers" && report.job.status === "blocked") {
    return "Biomarker extraction not configured yet";
  }
  if (report.job?.errorCode === "report_classification_unknown") return "Manual review required";
  if (report.reportFile.scanStatus === "scan_passed" && report.job?.status === "blocked") return "Processing paused";
  if (report.job?.status === "queued") return "Processing queued";
  if (report.job?.status === "retry_scheduled") return "Processing queued for retry";
  if (report.job?.status === "waiting" || report.job?.status === "blocked") return "Processing paused";
  if (report.job?.status === "failed") return "Processing failed";
  if (report.healthInsight) return "Result ready";
  return "Upload complete";
}

function groupMarkers(markers: MarkerCardModel[]) {
  return markers.reduce<Record<MarkerGroupKey, MarkerCardModel[]>>(
    (acc, marker) => {
      acc[marker.group].push(marker);
      return acc;
    },
    { critical: [], monitor: [], needs_attention: [], normal: [] }
  );
}

function flagClassName(flag: string) {
  if (flag === "critical") return "border-danger/30 bg-danger/10 text-ivory";
  if (flag === "high" || flag === "low") return "border-yellow/30 bg-yellow/10 text-ivory";
  if (flag === "normal") return "border-green/30 bg-green/10 text-ivory";
  return "";
}
