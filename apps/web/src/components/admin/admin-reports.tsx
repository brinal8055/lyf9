"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  AuditLogRecord,
  AnalyticsEventRecord,
  BetaInviteRecord,
  BiomarkerResultRecord,
  DataRightsRequestRecord,
  DoctorReviewRecord,
  ExtractedDocumentRecord,
  FeedbackEventRecord,
  HealthInsightRecord,
  HealthRiskFlagRecord,
  LabReportRecord,
  ModelRunRecord,
  NotificationRecord,
  PaymentRecord,
  ProcessingJobRecord,
  ReportFileRecord
} from "@/lib/reports/types";

type AdminData = {
  auditLogs: AuditLogRecord[];
  biomarkerResults: BiomarkerResultRecord[];
  extractedDocuments: ExtractedDocumentRecord[];
  healthInsights: HealthInsightRecord[];
  healthRiskFlags: HealthRiskFlagRecord[];
  jobs: ProcessingJobRecord[];
  labReports: LabReportRecord[];
  modelRuns: ModelRunRecord[];
  reportFiles: ReportFileRecord[];
  doctorReviews: DoctorReviewRecord[];
  feedbackEvents: FeedbackEventRecord[];
  payments: PaymentRecord[];
  analyticsEvents: AnalyticsEventRecord[];
  notifications: NotificationRecord[];
  dataRightsRequests: DataRightsRequestRecord[];
  betaInvites: BetaInviteRecord[];
  queues: {
    blockedJobs: ProcessingJobRecord[];
    criticalFlaggedReports: HealthRiskFlagRecord[];
    failedJobs: ProcessingJobRecord[];
    failedExtraction: ProcessingJobRecord[];
    lowConfidenceExtraction: BiomarkerResultRecord[];
    manualCorrectionNeeded: BiomarkerResultRecord[];
    ocrRequiredReports: ExtractedDocumentRecord[];
    unknownClassification: ProcessingJobRecord[];
    unsupportedReports: ReportFileRecord[];
  };
};

export function AdminReports() {
  const [data, setData] = useState<AdminData>({
    auditLogs: [],
    biomarkerResults: [],
    extractedDocuments: [],
    healthInsights: [],
    healthRiskFlags: [],
    jobs: [],
    labReports: [],
    modelRuns: [],
    reportFiles: [],
    doctorReviews: [],
    feedbackEvents: [],
    payments: [],
    analyticsEvents: [],
    notifications: [],
    dataRightsRequests: [],
    betaInvites: [],
    queues: {
      blockedJobs: [],
      criticalFlaggedReports: [],
      failedJobs: [],
      failedExtraction: [],
      lowConfidenceExtraction: [],
      manualCorrectionNeeded: [],
      ocrRequiredReports: [],
      unknownClassification: [],
      unsupportedReports: []
    }
  });
  const [status, setStatus] = useState("");

  function refresh() {
    fetch("/api/admin/reports")
      .then((response) => response.json())
      .then((body: AdminData) => setData(body));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function saveCorrection(event: FormEvent<HTMLFormElement>, marker: BiomarkerResultRecord) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/corrections", {
      body: JSON.stringify({
        biomarkerResultId: marker.id,
        canonicalName: form.get("canonicalName"),
        confidenceScore: form.get("confidenceScore"),
        rawName: form.get("rawName"),
        reason: form.get("reason"),
        referenceHigh: form.get("referenceHigh"),
        referenceLow: form.get("referenceLow"),
        referenceRangeText: form.get("referenceRangeText"),
        reviewRouting: form.get("reviewRouting"),
        sourceText: form.get("sourceText"),
        systemFlag: form.get("systemFlag"),
        unit: form.get("unit"),
        valueNumeric: form.get("valueNumeric"),
        valueText: form.get("valueText")
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    setStatus(response.ok ? "Correction saved and audited." : "Correction could not be saved.");
    if (response.ok) refresh();
  }

  async function assignReview(event: FormEvent<HTMLFormElement>, insight: HealthInsightRecord) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/doctor-reviews", {
      body: JSON.stringify({
        assignedDoctorEmail: form.get("assignedDoctorEmail"),
        healthInsightId: insight.id,
        priority: form.get("priority")
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    setStatus(response.ok ? "Doctor review assigned and audited." : "Doctor review could not be assigned.");
    if (response.ok) refresh();
  }

  async function runDataRights(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/data-rights", {
      body: JSON.stringify({
        action: form.get("action"),
        targetUserId: form.get("targetUserId")
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    setStatus(response.ok ? "Data rights action completed and audited." : "Data rights action failed.");
    if (response.ok) refresh();
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/invites", {
      body: JSON.stringify({
        email: form.get("email"),
        role: form.get("role")
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    setStatus(response.ok ? "Private beta invite created." : "Invite could not be created.");
    if (response.ok) refresh();
  }

  return (
    <div className="grid gap-6">
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Private beta summary</CardTitle>
          <CardContent>Operational snapshot for invite, upload, review, payment, and feedback activity.</CardContent>
        </CardHeader>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <QueueStat label="Invites" value={data.betaInvites.length} />
          <QueueStat label="Reports" value={data.reportFiles.length} />
          <QueueStat label="Doctor reviews" value={data.doctorReviews.length} />
          <QueueStat label="Payments" value={data.payments.length} />
          <QueueStat label="Feedback" value={data.feedbackEvents.length} />
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Safety queues</CardTitle>
          <CardContent>Operational queues for manual correction and doctor review.</CardContent>
        </CardHeader>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <QueueStat label="Failed extraction" value={data.queues.failedExtraction.length} />
          <QueueStat label="Blocked jobs" value={data.queues.blockedJobs.length} />
          <QueueStat label="OCR required" value={data.queues.ocrRequiredReports.length} />
          <QueueStat label="Unknown classification" value={data.queues.unknownClassification.length} />
          <QueueStat label="Low confidence" value={data.queues.lowConfidenceExtraction.length} />
          <QueueStat label="Unsupported" value={data.queues.unsupportedReports.length} />
          <QueueStat label="Critical flags" value={data.queues.criticalFlaggedReports.length} />
          <QueueStat label="Correction needed" value={data.queues.manualCorrectionNeeded.length} />
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Private beta invites</CardTitle>
          <CardContent>Create invite codes for the first 30-50 early users.</CardContent>
        </CardHeader>
        <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]" onSubmit={createInvite}>
          <Input name="email" placeholder="early-user@example.com" required type="email" />
          <Select defaultValue="user" name="role">
            <option value="user">user</option>
            <option value="doctor">doctor</option>
            <option value="admin">admin</option>
          </Select>
          <Button type="submit" variant="secondary">Create invite</Button>
        </form>
        <div className="mt-4 grid gap-3">
          {data.betaInvites.slice(0, 10).map((invite) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={invite.id}>
              <p className="font-medium text-ivory">{invite.email}</p>
              <p className="text-sm text-muted">
                {invite.inviteCode} · {invite.role} · {invite.status}
              </p>
            </div>
          ))}
          {data.betaInvites.length === 0 ? <p className="text-sm text-muted">No invites created yet.</p> : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Uploaded reports</CardTitle>
          <CardContent>Admin Phase 3B view for report metadata.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.reportFiles.map((report) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={report.id}>
              <p className="font-medium text-ivory">{report.originalFilename}</p>
              <p className="text-sm text-muted">
                {report.mimeType} · {report.status} · {report.userId}
              </p>
              {report.unsupportedReason ? (
                <p className="mt-2 text-sm text-yellow">{report.unsupportedReason}</p>
              ) : null}
            </div>
          ))}
          {data.reportFiles.length === 0 ? <p className="text-sm text-muted">No reports yet.</p> : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Biomarkers and insight drafts</CardTitle>
          <CardContent>
            Schema-validated extraction with source values, confidence, routing, and safety status.
          </CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.biomarkerResults.map((marker) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={marker.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-ivory">{marker.canonicalName ?? marker.rawName}</p>
                  <p className="text-sm text-muted">
                    {marker.valueNumeric ?? marker.valueText} {marker.unit ?? ""} · {marker.systemFlag} · confidence{" "}
                    {marker.confidenceScore}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted">
                  {marker.reviewRouting}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">{marker.sourceText}</p>
              <form className="mt-4 grid gap-3 border-t border-white/10 pt-4" onSubmit={(event) => saveCorrection(event, marker)}>
                <p className="text-sm font-medium text-ivory">Correction overlay</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <Input defaultValue={marker.rawName} name="rawName" placeholder="Raw name" />
                  <Input defaultValue={marker.canonicalName ?? ""} name="canonicalName" placeholder="Canonical name" />
                  <Input defaultValue={marker.valueNumeric ?? ""} name="valueNumeric" placeholder="Numeric value" />
                  <Input defaultValue={marker.valueText ?? ""} name="valueText" placeholder="Text value" />
                  <Input defaultValue={marker.unit ?? ""} name="unit" placeholder="Unit" />
                  <Input defaultValue={marker.referenceRangeText ?? ""} name="referenceRangeText" placeholder="Reference range" />
                  <Input defaultValue={marker.referenceLow ?? ""} name="referenceLow" placeholder="Reference low" />
                  <Input defaultValue={marker.referenceHigh ?? ""} name="referenceHigh" placeholder="Reference high" />
                  <Input defaultValue={marker.confidenceScore} name="confidenceScore" placeholder="Confidence" />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Select defaultValue={marker.systemFlag} name="systemFlag">
                    <option value="normal">normal</option>
                    <option value="low">low</option>
                    <option value="high">high</option>
                    <option value="borderline">borderline</option>
                    <option value="critical">critical</option>
                    <option value="unknown">unknown</option>
                  </Select>
                  <Select defaultValue={marker.reviewRouting} name="reviewRouting">
                    <option value="auto_accept">auto_accept</option>
                    <option value="soft_review">soft_review</option>
                    <option value="manual_review_required">manual_review_required</option>
                    <option value="critical_review_required">critical_review_required</option>
                  </Select>
                </div>
                <Textarea defaultValue={marker.sourceText} name="sourceText" placeholder="Source text" />
                <Textarea name="reason" placeholder="Correction reason" required />
                <Button type="submit" variant="secondary">Save correction</Button>
                {marker.isManuallyCorrected ? (
                  <p className="text-xs text-muted">Corrected overlay saved by {marker.correctedBy}.</p>
                ) : null}
              </form>
            </div>
          ))}
          {data.biomarkerResults.length === 0 ? (
            <p className="text-sm text-muted">No biomarkers extracted yet.</p>
          ) : null}
        </div>
        <div className="mt-5 grid gap-3">
          {data.healthInsights.map((insight) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={insight.id}>
              <p className="font-medium text-ivory">{insight.status}</p>
              <p className="mt-2 text-sm text-muted">{insight.summary}</p>
              <p className="mt-2 text-xs text-muted">{insight.disclaimer}</p>
              {insight.status === "doctor_review_required" ? (
                <form className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-[1fr_auto_auto]" onSubmit={(event) => assignReview(event, insight)}>
                  <Input defaultValue="doctor@lyf9.ai" name="assignedDoctorEmail" placeholder="Doctor email" />
                  <Select defaultValue="standard" name="priority">
                    <option value="standard">standard</option>
                    <option value="urgent">urgent</option>
                  </Select>
                  <Button type="submit" variant="secondary">Assign doctor</Button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Doctor reviews</CardTitle>
          <CardContent>Assigned reviews and approval status.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.doctorReviews.map((review) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={review.id}>
              <p className="font-medium text-ivory">{review.status}</p>
              <p className="text-sm text-muted">
                {review.assignedDoctorEmail} · {review.priority} · {review.healthInsightId}
              </p>
            </div>
          ))}
          {data.doctorReviews.length === 0 ? <p className="text-sm text-muted">No doctor reviews assigned yet.</p> : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Feedback</CardTitle>
          <CardContent>Private-beta feedback by surface and triage status.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.feedbackEvents.map((event) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={event.id}>
              <p className="font-medium text-ivory">
                {event.feedbackSurface} · {event.helpful}
              </p>
              <p className="text-sm text-muted">
                {event.userId} · trust doctor review: {event.wouldTrustDoctorReview} · {event.status}
              </p>
              {event.confusingText ? <p className="mt-2 text-sm text-yellow">{event.confusingText}</p> : null}
              {event.freeText ? <p className="mt-2 text-sm text-muted">{event.freeText}</p> : null}
            </div>
          ))}
          {data.feedbackEvents.length === 0 ? <p className="text-sm text-muted">No feedback yet.</p> : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardContent>Razorpay sandbox placeholders only. Public paid launch remains disabled.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.payments.map((payment) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={payment.id}>
              <p className="font-medium text-ivory">
                {payment.productType} · {payment.status}
              </p>
              <p className="text-sm text-muted">
                ₹{payment.amountMinorUnits / 100} · {payment.provider} · legal review required:{" "}
                {String(payment.legalReviewRequired)}
              </p>
            </div>
          ))}
          {data.payments.length === 0 ? <p className="text-sm text-muted">No payments yet.</p> : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Analytics events</CardTitle>
          <CardContent>Basic private-beta funnel events stored locally.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.analyticsEvents.slice(0, 20).map((event) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={event.id}>
              <p className="font-medium text-ivory">{event.eventName}</p>
              <p className="text-sm text-muted">
                {event.userId ?? "anonymous"} · {event.createdAt}
              </p>
            </div>
          ))}
          {data.analyticsEvents.length === 0 ? <p className="text-sm text-muted">No analytics events yet.</p> : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Email placeholders</CardTitle>
          <CardContent>Provider-replaceable notification records. No external email is sent.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.notifications.map((notification) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={notification.id}>
              <p className="font-medium text-ivory">{notification.subject}</p>
              <p className="text-sm text-muted">
                {notification.recipientEmail} · {notification.eventType} · {notification.status}
              </p>
            </div>
          ))}
          {data.notifications.length === 0 ? <p className="text-sm text-muted">No notification placeholders yet.</p> : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Internal data rights</CardTitle>
          <CardContent>Export or delete local scaffold records for a user. Actions are audited.</CardContent>
        </CardHeader>
        <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]" onSubmit={runDataRights}>
          <Input name="targetUserId" placeholder="user@example.com" required type="email" />
          <Select defaultValue="export" name="action">
            <option value="export">export</option>
            <option value="delete">delete</option>
          </Select>
          <Button type="submit" variant="secondary">Run action</Button>
        </form>
        <div className="mt-4 grid gap-3">
          {data.dataRightsRequests.slice(0, 5).map((request) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={request.id}>
              <p className="font-medium text-ivory">
                {request.requestType} · {request.userId}
              </p>
              <p className="text-sm text-muted">
                {request.status} · {request.actorUserId} · {request.createdAt}
              </p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Safety routing</CardTitle>
          <CardContent>Critical, low-confidence, and unsafe-language flags.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.healthRiskFlags.map((flag) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={flag.id}>
              <p className="font-medium text-ivory">
                {flag.flagType} · {flag.severity}
              </p>
              <p className="mt-2 text-sm text-muted">{flag.reason}</p>
            </div>
          ))}
          {data.healthRiskFlags.length === 0 ? (
            <p className="text-sm text-muted">No risk flags yet.</p>
          ) : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Model runs</CardTitle>
          <CardContent>Prompt, schema, hash, and safety-filter metadata.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.modelRuns.map((run) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={run.id}>
              <p className="font-medium text-ivory">{run.taskType}</p>
              <p className="text-sm text-muted">
                {run.modelName} · {run.promptVersion} · {run.schemaVersion} · {run.safetyFilterStatus}
              </p>
            </div>
          ))}
          {data.modelRuns.length === 0 ? <p className="text-sm text-muted">No model runs yet.</p> : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Parser output</CardTitle>
          <CardContent>Raw extracted text is PHI. Inspect only for operations and corrections.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.extractedDocuments.map((document) => {
            const labReport = data.labReports.find((report) => report.id === document.reportId);
            return (
              <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={document.id}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-ivory">
                      {document.parserName} · {document.status}
                    </p>
                    <p className="text-sm text-muted">
                      {document.parserVersion} · pages {document.pageCount ?? "unknown"} ·{" "}
                      {labReport?.reportType ?? "unclassified"}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted">
                    tables {document.extractedTablesJson?.length ?? 0}
                  </span>
                </div>
                {document.error ? <p className="mt-3 text-sm text-yellow">{document.error}</p> : null}
                {document.extractedText ? (
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-ui bg-black/30 p-3 text-xs text-muted">
                    {document.extractedText}
                  </pre>
                ) : null}
              </div>
            );
          })}
          {data.extractedDocuments.length === 0 ? (
            <p className="text-sm text-muted">No parser output yet.</p>
          ) : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Processing jobs</CardTitle>
          <CardContent>Every upload should have one job.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.jobs.map((job) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={job.id}>
              <p className="font-medium text-ivory">{job.currentState}</p>
              <p className="text-sm text-muted">
                {job.status} · attempts {job.attemptCount} · {job.idempotencyKey}
              </p>
            </div>
          ))}
          {data.jobs.length === 0 ? <p className="text-sm text-muted">No jobs yet.</p> : null}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Audit logs</CardTitle>
          <CardContent>Safe operational metadata only.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.auditLogs.slice(0, 10).map((log) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={log.id}>
              <p className="font-medium text-ivory">{log.action}</p>
              <p className="text-sm text-muted">
                {log.entityType} · {log.createdAt}
              </p>
            </div>
          ))}
          {data.auditLogs.length === 0 ? <p className="text-sm text-muted">No audit logs yet.</p> : null}
        </div>
      </Card>
    </div>
  );
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4">
      <p className="text-2xl font-semibold text-ivory">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}
