"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  PencilLine,
  ShieldAlert,
  XCircle
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type {
  BiomarkerResultRecord,
  DoctorReviewAction,
  DoctorReviewRecord,
  HealthInsightRecord,
  HealthRiskFlagRecord,
  LabReportRecord,
  ReportFileRecord
} from "@/lib/reports/types";

type DoctorReviewDetailPayload = {
  biomarkers: BiomarkerResultRecord[];
  healthInsight: HealthInsightRecord;
  labReport: LabReportRecord;
  patient: { displayName: string; userId: string };
  questionnaireSummary: { goals: string; symptoms: string };
  reportFile: ReportFileRecord;
  review: DoctorReviewRecord;
  riskFlags: HealthRiskFlagRecord[];
};

export function DoctorReviewQueue() {
  const [reviews, setReviews] = useState<DoctorReviewDetailPayload[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/doctor/reviews")
      .then((response) => response.json())
      .then((body: { error?: string; reviews?: DoctorReviewDetailPayload[] }) => {
        if (body.error) setError(body.error);
        setReviews(body.reviews ?? []);
      })
      .catch(() => setError("The review queue could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return <Alert className="border-danger/30 bg-danger/10">{error}</Alert>;
  }

  if (loading) {
    return <Alert>Loading assigned reports.</Alert>;
  }

  const urgentCount = reviews.filter((item) => item.review.priority === "urgent").length;
  const flaggedCount = reviews.filter((item) => item.riskFlags.length > 0).length;

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Review queue summary">
        <QueueStat icon={<ClipboardList className="size-4" aria-hidden />} label="Assigned" value={reviews.length} />
        <QueueStat icon={<ShieldAlert className="size-4" aria-hidden />} label="With flags" tone="yellow" value={flaggedCount} />
        <QueueStat icon={<AlertTriangle className="size-4" aria-hidden />} label="Urgent" tone="danger" value={urgentCount} />
      </section>

      <section className="grid gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ivory">Review queue</h2>
          <p className="mt-1 text-sm text-muted">Open a report to inspect source evidence and record a decision.</p>
        </div>

        {reviews.map((item) => (
          <Card className="overflow-hidden p-0 shadow-[0_18px_55px_rgba(0,0,0,0.22)]" key={item.review.id}>
            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <Badge>{item.review.status.replaceAll("_", " ")}</Badge>
                  <Badge className={item.review.priority === "urgent" ? "border-danger/30 bg-danger/10 text-danger" : undefined}>
                    {item.review.priority}
                  </Badge>
                  <Badge>{item.labReport.reportType ?? "unclassified"}</Badge>
                </div>
                <div className="mt-4 flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-ui border border-white/10 bg-white/5 text-muted">
                    <FileText className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-lg">{item.reportFile.originalFilename}</CardTitle>
                    <CardContent className="mt-1 text-sm leading-6">
                      {item.patient.displayName} · {item.biomarkers.length} biomarkers ·{" "}
                      {item.riskFlags.length} review flags
                    </CardContent>
                  </div>
                </div>
              </div>
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-orange px-4 text-sm font-medium text-ink transition hover:scale-[1.02]"
                href={`/doctor/reviews/${item.review.id}`}
              >
                Open review
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </Card>
        ))}

        {reviews.length === 0 ? (
          <div className="rounded-ui border border-dashed border-white/15 px-5 py-10 text-center text-sm text-muted">
            No reports are assigned to this doctor account.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function QueueStat({
  icon,
  label,
  tone = "muted",
  value
}: {
  icon: ReactNode;
  label: string;
  tone?: "danger" | "muted" | "yellow";
  value: number;
}) {
  return (
    <div className="flex items-center gap-4 rounded-ui border border-white/10 bg-white/[0.035] px-4 py-4">
      <span
        className={
          tone === "danger"
            ? "flex size-9 shrink-0 items-center justify-center rounded-ui border border-danger/20 bg-danger/10 text-danger"
            : tone === "yellow"
              ? "flex size-9 shrink-0 items-center justify-center rounded-ui border border-yellow/20 bg-yellow/10 text-yellow"
              : "flex size-9 shrink-0 items-center justify-center rounded-ui border border-white/10 bg-white/5 text-muted"
        }
      >
        {icon}
      </span>
      <div>
        <p className="text-xl font-semibold leading-none text-ivory">{value}</p>
        <p className="mt-1.5 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

export function DoctorReviewDetail({ reviewId }: { reviewId: string }) {
  const [detail, setDetail] = useState<DoctorReviewDetailPayload | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function refresh() {
    fetch(`/api/doctor/reviews/${reviewId}`)
      .then((response) => response.json())
      .then((body: { error?: string; review?: DoctorReviewDetailPayload }) => {
        if (body.error) setError(body.error);
        setDetail(body.review ?? null);
      });
  }

  useEffect(() => {
    refresh();
  }, [reviewId]);

  async function submitAction(event: FormEvent<HTMLFormElement>, action: DoctorReviewAction) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/doctor/reviews/${reviewId}/action`, {
      body: JSON.stringify({
        action,
        editedSummary: form.get("editedSummary"),
        notes: form.get("notes"),
        reason: form.get("reason")
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    setStatus(response.ok ? "Review action saved." : "Review action could not be saved.");
    if (response.ok) refresh();
  }

  if (error) {
    return <Alert className="border-danger/30 bg-danger/10">{error}</Alert>;
  }

  if (!detail) {
    return <Alert>Loading doctor review.</Alert>;
  }

  return (
    <div className="grid gap-6">
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Badge>{detail.review.status.replaceAll("_", " ")}</Badge>
            <Badge>{detail.review.priority}</Badge>
            <Badge>{detail.labReport.reportType ?? "unclassified"}</Badge>
          </div>
          <CardTitle className="mt-4">{detail.reportFile.originalFilename}</CardTitle>
          <CardContent>
            Patient: {detail.patient.displayName}. Symptoms and goals are shown from the intake scaffold when available.
          </CardContent>
        </CardHeader>
        <div className="grid gap-3 text-sm text-muted md:grid-cols-2">
          <p>Symptoms: {detail.questionnaireSummary.symptoms}</p>
          <p>Goals: {detail.questionnaireSummary.goals}</p>
        </div>
        <Link
          className="mt-4 inline-flex rounded-full border border-white/10 px-4 py-2 text-sm text-ivory hover:bg-white/5"
          href={`/api/doctor/reviews/${detail.review.id}/download`}
        >
          Open original report
        </Link>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI draft</CardTitle>
          <CardContent>{detail.healthInsight.disclaimer}</CardContent>
        </CardHeader>
        <p className="text-sm text-muted">{detail.healthInsight.summary}</p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk flags</CardTitle>
          <CardContent>Critical and low-confidence values need human review.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {detail.riskFlags.map((flag) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-3" key={flag.id}>
              <p className="flex items-center gap-2 text-sm font-medium text-ivory">
                <AlertTriangle className="size-4 text-yellow" aria-hidden />
                {flag.flagType.replaceAll("_", " ")}
              </p>
              <p className="text-sm text-muted">{flag.reason}</p>
            </div>
          ))}
          {detail.riskFlags.length === 0 ? <p className="text-sm text-muted">No risk flags.</p> : null}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extracted biomarkers</CardTitle>
          <CardContent>Original source values and admin correction overlays are shown separately.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {detail.biomarkers.map((marker) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={marker.id}>
              <p className="font-medium text-ivory">{marker.canonicalName ?? marker.rawName}</p>
              <p className="text-sm text-muted">
                Original: {marker.valueNumeric ?? marker.valueText} {marker.unit ?? ""} · {marker.systemFlag} · confidence {marker.confidenceScore}
              </p>
              {marker.isManuallyCorrected ? (
                <p className="mt-1 text-sm text-yellow">
                  Corrected: {marker.correctedValueNumeric ?? marker.correctedValueText ?? "value unchanged"} {marker.correctedUnit ?? marker.unit ?? ""}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted">Source: {marker.sourceText}</p>
            </div>
          ))}
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <ActionCard
          action="approve"
          icon={<CheckCircle2 className="mr-2 size-4" aria-hidden />}
          onSubmit={submitAction}
          title="Approve"
        />
        <ActionCard
          action="edit_and_approve"
          includeEdit
          icon={<PencilLine className="mr-2 size-4" aria-hidden />}
          onSubmit={submitAction}
          title="Edit and approve"
        />
        <ActionCard
          action="request_more_info"
          includeReason
          onSubmit={submitAction}
          title="Request more information"
        />
        <ActionCard
          action="reject"
          includeReason
          icon={<XCircle className="mr-2 size-4" aria-hidden />}
          onSubmit={submitAction}
          title="Reject"
        />
        <ActionCard action="mark_urgent" includeReason onSubmit={submitAction} title="Mark urgent" />
      </section>
    </div>
  );
}

function ActionCard({
  action,
  icon,
  includeEdit = false,
  includeReason = false,
  onSubmit,
  title
}: {
  action: DoctorReviewAction;
  icon?: ReactNode;
  includeEdit?: boolean;
  includeReason?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, action: DoctorReviewAction) => Promise<void>;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <form className="grid gap-3" onSubmit={(event) => onSubmit(event, action)}>
        {includeEdit ? <Textarea name="editedSummary" placeholder="Doctor-reviewed summary" required /> : null}
        {includeReason ? <Textarea name="reason" placeholder="Reason or request" required /> : null}
        <Textarea name="notes" placeholder="Internal notes" />
        <Button type="submit" variant="secondary">
          {icon}
          {title}
        </Button>
      </form>
    </Card>
  );
}
