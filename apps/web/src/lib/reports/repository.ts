import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";

import { BIOMARKER_ALIASES_V1, BIOMARKER_CATALOG_V1 } from "./catalog";
import { classifyReport } from "./classification";
import {
  extractBiomarkersFromDocument,
  toBiomarkerResult,
  validateBiomarkerExtractionOutput
} from "./biomarkers";
import { localDocumentParser } from "./parser";
import {
  buildMarkerCards,
  buildTrendSeries,
  reportFilesByLabReportId
} from "./presentation";
import { getMalwareScannerProvider, toReportScanStatus } from "./providers/malware";
import { getStorageProvider } from "./providers/storage";
import { createSignedToken, getReportSigningSecret } from "./signed-url";
import {
  classifyExtractedReport,
  getDocumentParserProvider,
  getOcrProvider,
  type ExtractedDocumentResult
} from "../document-extraction";
import {
  BIOMARKER_EXTRACTION_SCHEMA_VERSION,
  PATIENT_EXPLANATION_SCHEMA_VERSION,
  biomarkerExtractionPromptVersion,
  createModelRunRecord,
  getAiProvider,
  patientExplanationPromptVersion,
  requiredDisclaimer,
  validateBiomarkerExtractionSchema,
  validatePatientExplanationSchema,
  type BiomarkerExtractionOutput,
  type PatientExplanationOutput
} from "../ai";
import {
  normalizeBiomarkerItems,
  validateNormalizedBiomarkers,
  type NormalizedBiomarker
} from "../biomarkers";
import { runMedicalSafetyRules } from "../safety";
import { createDatabaseWorkflowProvider, getBackoffNextRunAt, PIPELINE_STEPS } from "../workflow";
import { shouldUseSupabaseAuth, writeSupabaseAuditLog } from "../auth/supabase-auth";
import {
  addSupabaseSignedUrlAudit,
  completeSupabaseUpload,
  createSupabaseFeedbackEvent,
  createSupabaseSignedDownloadUrl,
  createSupabaseUploadInit,
  deleteSupabaseReportFile,
  getSupabaseReportDetails,
  listSupabaseAdminReports,
  listSupabaseUserReports,
  readAssignedSupabaseDoctorPrivateReport,
  readSupabasePrivateReport,
  trackSupabaseAnalyticsEvent
} from "./supabase-repository";
import {
  generateSafeExplanation,
  runUnsafeLanguageFilter,
  validateExplanationOutput
} from "./safety";
import { PROCESSING_VERSION, makeIdempotencyKey } from "./validation";
import type {
  AnalyticsEventName,
  AuditLogRecord,
  BetaInviteRecord,
  BiomarkerFlag,
  BiomarkerResultRecord,
  DataRightsRequestRecord,
  DoctorReviewAction,
  DoctorReviewRecord,
  FeedbackEventRecord,
  ExtractedDocumentRecord,
  HealthInsightRecord,
  LabReportRecord,
  ModelRunRecord,
  NotificationEventType,
  PaymentProductType,
  ProcessingJobRecord,
  ProcessingJobState,
  ProcessingJobStepRecord,
  ProcessingStepName,
  ReminderRecord,
  ReportType,
  ReportFileRecord,
  UserRole,
  ReviewRouting,
  ReportStore
} from "./types";

const STORE_DIR = process.env.LYF9_REPORT_STORE_DIR
  ? path.resolve(process.env.LYF9_REPORT_STORE_DIR)
  : path.join(process.cwd(), "..", "..", ".local", "reports");
const STORAGE_DIR = path.join(STORE_DIR, "private");
const STORE_PATH = path.join(STORE_DIR, "store.json");

const emptyStore: ReportStore = {
  auditLogs: [],
  biomarkerAliases: BIOMARKER_ALIASES_V1,
  biomarkerCatalog: BIOMARKER_CATALOG_V1,
  biomarkerResults: [],
  extractedDocuments: [],
  healthInsights: [],
  doctorReviews: [],
  healthRiskFlags: [],
  labReports: [],
  modelRuns: [],
  processingJobs: [],
  processingJobSteps: [],
  reportFiles: [],
  reminders: [],
  feedbackEvents: [],
  payments: [],
  analyticsEvents: [],
  notifications: [],
  dataRightsRequests: [],
  betaInvites: []
};

export const PRIVATE_BETA_PRODUCTS: Record<
  PaymentProductType,
  { amountMinorUnits: number; currency: "INR"; label: string }
> = {
  ai_report_explanation: {
    amountMinorUnits: 4900,
    currency: "INR",
    label: "AI report explanation"
  },
  doctor_reviewed_report: {
    amountMinorUnits: 29900,
    currency: "INR",
    label: "Doctor-reviewed report"
  }
};

export async function getStore() {
  await ensureStore();
  const raw = await readFile(STORE_PATH, "utf8");
  return normalizeStore(JSON.parse(raw) as Partial<ReportStore>);
}

export async function getStoreHealth() {
  try {
    await ensureStore();
    const store = await getStore();
    return {
      auditLogCount: store.auditLogs.length,
      ok: true,
      storageMode: "local-private",
      storeMode: "local-json"
    };
  } catch (caught) {
    return {
      error: caught instanceof Error ? caught.message : "unknown",
      ok: false,
      storageMode: "local-private",
      storeMode: "local-json"
    };
  }
}

export async function createBetaInvite(input: {
  actorUserId: string;
  email: string;
  role?: BetaInviteRecord["role"];
}) {
  const store = await getStore();
  const now = new Date().toISOString();
  const invite: BetaInviteRecord = {
    createdAt: now,
    email: input.email.trim().toLowerCase(),
    id: randomUUID(),
    inviteCode: makeInviteCode(),
    invitedBy: input.actorUserId,
    redeemedAt: null,
    redeemedBy: null,
    role: input.role ?? "user",
    status: "created",
    updatedAt: now
  };

  store.betaInvites.push(invite);
  addAuditLogSync(store, {
    action: "beta_invite_created",
    actorRole: "admin",
    actorUserId: input.actorUserId,
    entityId: invite.id,
    entityType: "beta_invite",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      email: invite.email,
      role: invite.role
    },
    userAgent: null
  });
  await saveStore(store);
  return invite;
}

export async function validateAndRedeemBetaInvite(input: {
  email: string;
  inviteCode: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const mode = betaAccessMode();

  if (mode === "open") {
    return { ok: true, reason: null };
  }

  if (allowlistEmails().includes(email)) {
    return { ok: true, reason: null };
  }

  if (mode === "allowlist") {
    return { ok: false, reason: "This email is not on the private beta allowlist." };
  }

  const configuredCode = process.env.LYF9_BETA_INVITE_CODE?.trim();
  if (configuredCode && input.inviteCode === configuredCode) {
    return { ok: true, reason: null };
  }

  const store = await getStore();
  const invite = store.betaInvites.find(
    (candidate) =>
      candidate.email === email &&
      candidate.inviteCode === input.inviteCode &&
      candidate.status === "created"
  );

  if (!invite) {
    return { ok: false, reason: "A valid private beta invite code is required." };
  }

  const now = new Date().toISOString();
  invite.status = "redeemed";
  invite.redeemedAt = now;
  invite.redeemedBy = email;
  invite.updatedAt = now;
  addAuditLogSync(store, {
    action: "beta_invite_redeemed",
    actorRole: "user",
    actorUserId: email,
    entityId: invite.id,
    entityType: "beta_invite",
    ipAddress: null,
    requestId: null,
    safeMetadata: { email },
    userAgent: null
  });
  await saveStore(store);
  return { ok: true, reason: null };
}

export async function createUploadInit(input: {
  checksumSha256: string;
  fileSizeBytes: number;
  ipAddress: string | null;
  mimeType: string;
  originalFilename: string;
  requestId: string | null;
  userAgent: string | null;
  userId: string;
}) {
  if (shouldUseSupabaseAuth()) {
    return createSupabaseUploadInit(input);
  }

  const store = await getStore();
  const existingReportFile = store.reportFiles.find(
    (report) =>
      report.userId === input.userId &&
      report.checksumSha256 === input.checksumSha256 &&
      report.status !== "deleted"
  );

  if (existingReportFile) {
    const storageProvider = getStorageProvider();
    const uploadTarget = await storageProvider.createUploadUrl({
      filename: existingReportFile.originalFilename,
      mimeType: existingReportFile.mimeType,
      reportFileId: existingReportFile.id,
      sizeBytes: existingReportFile.fileSizeBytes,
      checksum: existingReportFile.checksumSha256,
      userId: input.userId
    });
    await addAuditLog(store, {
      action: "signed_upload_url_generated",
      actorRole: "user",
      actorUserId: input.userId,
      entityId: existingReportFile.id,
      entityType: "report_file",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      safeMetadata: {
        expiresAt: uploadTarget.expiresAt,
        reused: true,
        storageProvider: storageProvider.name,
        urlType: "upload"
      },
      userAgent: input.userAgent
    });
    await saveStore(store);
    return {
      job: null,
      labReport: null,
      reportFile: existingReportFile,
      reused: true,
      storageProvider: storageProvider.name,
      uploadTarget
    };
  }

  const now = new Date().toISOString();
  const reportFileId = randomUUID();
  const storageProvider = getStorageProvider();
  const allowedType = storageProvider.validateFileType(input.mimeType);
  const allowedSize = storageProvider.validateFileSize(input.fileSizeBytes);

  if (!allowedType || !allowedSize) {
    const action = allowedType ? "report_upload_rejected_file_size" : "report_upload_rejected_file_type";
    await addAuditLog(store, {
      action,
      actorRole: "user",
      actorUserId: input.userId,
      entityId: null,
      entityType: "report_upload",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      safeMetadata: {
        mimeType: input.mimeType,
        size: input.fileSizeBytes
      },
      userAgent: input.userAgent
    });
    await saveStore(store);
    throw new Error(allowedType ? "rejected_file_size" : "rejected_file_type");
  }

  const uploadTarget = await storageProvider.createUploadUrl({
    checksum: input.checksumSha256,
    filename: input.originalFilename,
    mimeType: input.mimeType,
    reportFileId,
    sizeBytes: input.fileSizeBytes,
    userId: input.userId
  });
  const reportFile: ReportFileRecord = {
    checksumSha256: input.checksumSha256,
    createdAt: now,
    fileSizeBytes: input.fileSizeBytes,
    id: reportFileId,
    mimeType: input.mimeType,
    originalFilename: input.originalFilename,
    scanCompletedAt: null,
    scanStatus: "scan_pending",
    deletedAt: null,
    status: "upload_pending",
    storageBucket: storageProvider.name,
    storageKey: uploadTarget.storageKey,
    unsupportedReason: null,
    updatedAt: now,
    uploadedAt: now,
    userId: input.userId
  };
  store.reportFiles.push(reportFile);
  await addAuditLog(store, {
    action: "report_upload_init",
    actorRole: "user",
    actorUserId: input.userId,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: {
      checksumSha256: input.checksumSha256,
      mimeType: input.mimeType,
      size: input.fileSizeBytes
    },
    userAgent: input.userAgent
  });
  await addAuditLog(store, {
    action: "signed_upload_url_generated",
    actorRole: "user",
    actorUserId: input.userId,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: {
      expiresAt: uploadTarget.expiresAt,
      storageProvider: storageProvider.name,
      urlType: "upload"
    },
    userAgent: input.userAgent
  });
  await saveStore(store);

  return { job: null, labReport: null, reportFile, reused: false, storageProvider: storageProvider.name, uploadTarget };
}

export async function auditReportUploadBlocked(input: {
  actorRole: UserRole;
  ipAddress: string | null;
  reason: "missing_required_consent";
  requestId: string | null;
  userAgent: string | null;
  userId: string;
}) {
  const metadata = { reason: input.reason };

  if (shouldUseSupabaseAuth()) {
    await writeSupabaseAuditLog({
      action: "report_upload_blocked",
      actorRole: input.actorRole,
      actorUserId: input.userId,
      metadata,
      resourceId: null,
      resourceType: "report_upload"
    });
    return;
  }

  const store = await getStore();
  await addAuditLog(store, {
    action: "report_upload_blocked",
    actorRole: input.actorRole,
    actorUserId: input.userId,
    entityId: null,
    entityType: "report_upload",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: metadata,
    userAgent: input.userAgent
  });
  await saveStore(store);
}

export async function auditReportUploadRejected(input: {
  actorRole: UserRole;
  ipAddress: string | null;
  mimeType: string | null;
  reason: "rejected_file_type" | "rejected_file_size";
  requestId: string | null;
  sizeBytes: number | null;
  userAgent: string | null;
  userId: string;
}) {
  const action =
    input.reason === "rejected_file_type"
      ? "report_upload_rejected_file_type"
      : "report_upload_rejected_file_size";

  if (shouldUseSupabaseAuth()) {
    await writeSupabaseAuditLog({
      action,
      actorRole: input.actorRole,
      actorUserId: input.userId,
      metadata: { mimeType: input.mimeType, size: input.sizeBytes },
      resourceId: null,
      resourceType: "report_upload"
    });
    return;
  }

  const store = await getStore();
  await addAuditLog(store, {
    action,
    actorRole: input.actorRole,
    actorUserId: input.userId,
    entityId: null,
    entityType: "report_upload",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: { mimeType: input.mimeType, size: input.sizeBytes },
    userAgent: input.userAgent
  });
  await saveStore(store);
}

export async function completeUpload(input: {
  bytes?: Buffer;
  ipAddress: string | null;
  reportFileId: string;
  requestId: string | null;
  userAgent: string | null;
  userId: string;
}) {
  if (shouldUseSupabaseAuth()) {
    return completeSupabaseUpload(input);
  }

  const store = await getStore();
  const reportFile = mustFindReportFile(store, input.reportFileId);

  if (reportFile.userId !== input.userId || reportFile.status === "deleted") {
    throw new Error("report_not_found");
  }

  const storageProvider = getStorageProvider();

  if (input.bytes) {
    await writePrivateFile(reportFile.storageKey, input.bytes);
  } else {
    const metadata = await storageProvider.getMetadata({ storageKey: reportFile.storageKey });
    if (metadata.sizeBytes !== undefined && metadata.sizeBytes > reportFile.fileSizeBytes) {
      throw new Error("uploaded_file_size_mismatch");
    }
    if (metadata.mimeType && metadata.mimeType !== reportFile.mimeType) {
      throw new Error("uploaded_file_type_mismatch");
    }
  }

  const now = new Date().toISOString();
  const labReport = ensureLabReportForReportFile(store, reportFile, now);
  const job = await ensureProcessingJobForReportFile(store, reportFile, labReport);
  reportFile.status = "uploaded";
  reportFile.scanStatus = "scan_pending";
  reportFile.updatedAt = now;
  await addAuditLog(store, {
    action: "report_upload_completed",
    actorRole: "user",
    actorUserId: input.userId,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: { size: input.bytes?.length ?? reportFile.fileSizeBytes },
    userAgent: input.userAgent
  });

  if (input.bytes) {
    await processUploadedReport(store, job.id, input.bytes);
  }

  trackAnalyticsEventSync(store, {
    eventName: "report_uploaded",
    labReportId: job.labReportId,
    metadata: { currentState: job.currentState, mimeType: reportFile.mimeType },
    reportFileId: reportFile.id,
    userId: input.userId
  });
  createNotificationPlaceholderSync(store, {
    eventType: "report_processing_complete",
    relatedDoctorReviewId: null,
    relatedReportFileId: reportFile.id,
    recipientEmail: input.userId,
    userId: input.userId
  });
  await saveStore(store);
  return { job: mustFindJob(store, job.id), reportFile: mustFindReportFile(store, reportFile.id) };
}

export async function processWorkflowOnce(input: {
  leaseSeconds?: number;
  now?: string;
  workerId?: string;
} = {}) {
  if (shouldUseSupabaseAuth()) {
    return {
      job: null,
      processed: false,
      reason: "supabase_worker_process_once_not_configured"
    };
  }

  const store = await getStore();
  const workflow = createDatabaseWorkflowProvider(store);
  const now = input.now ?? new Date().toISOString();
  await workflow.releaseExpiredLocks({ now });
  const job = await workflow.claimNextJob({
    leaseSeconds: input.leaseSeconds ?? workerLeaseSeconds(),
    now,
    workerId: input.workerId ?? workerId()
  });

  if (!job) {
    await saveStore(store);
    return { job: null, processed: false, reason: "no_jobs" };
  }

  const result = await runClaimedWorkflowJob(store, job.id, input.workerId ?? workerId());
  await saveStore(store);
  return result;
}

export async function retryProcessingJob(input: {
  actorUserId: string;
  jobId: string;
  reason: string;
}) {
  const store = await getStore();
  const job = mustFindJob(store, input.jobId);
  const now = new Date().toISOString();

  if (!["failed", "blocked", "retry_scheduled"].includes(job.status)) {
    return { job, retryQueued: false };
  }

  job.status = "queued";
  job.errorCode = null;
  job.errorMessage = null;
  job.failedAt = null;
  job.lockedBy = null;
  job.lockedUntil = null;
  job.nextRunAt = null;
  job.updatedAt = now;
  addAuditLogSync(store, {
    action: "processing_job_retry_scheduled",
    actorRole: "admin",
    actorUserId: input.actorUserId,
    entityId: job.id,
    entityType: "processing_job",
    ipAddress: null,
    requestId: null,
    safeMetadata: { manual: true, reason: input.reason },
    userAgent: "admin"
  });
  await saveStore(store);
  return { job, retryQueued: true };
}

export function getUserFacingReportStatus(input: {
  hasInsight?: boolean;
  job: ProcessingJobRecord | null;
  reportFile: ReportFileRecord;
}) {
  if (input.reportFile.status === "deleted" || input.reportFile.deletedAt) return "Deleted";
  if (input.reportFile.status === "upload_pending") return "Upload pending";
  if (input.reportFile.status === "rejected_file_type") return "Rejected file type";
  if (input.reportFile.status === "rejected_file_size") return "Rejected file size";
  if (input.reportFile.scanStatus === "scan_pending") return "Security scan pending";
  if (input.reportFile.scanStatus === "scan_failed") return "Security scan failed";
  if (input.reportFile.scanStatus === "scan_configuration_required") return "Processing not configured yet";
  if (input.job?.errorCode === "ai_configuration_required") return "AI extraction not configured";
  if (input.job?.currentStep === "extract_biomarkers") return "Extracting biomarkers";
  if (input.job?.currentStep === "normalize_biomarkers") return "Biomarkers extracted";
  if (input.job?.currentStep === "validate_biomarkers") return "Reviewing biomarker confidence";
  if (input.job?.currentStep === "run_safety_rules") return "Safety rules running";
  if (input.job?.currentState === "critical_review_required" || input.job?.currentState === "doctor_review_required") {
    return "Doctor review recommended";
  }
  if (input.job?.currentState === "low_confidence_review_required") return "Admin review required";
  if (input.job?.currentStep === "generate_patient_explanation") return "Generating AI explanation";
  if (input.reportFile.scanStatus === "scan_passed" && input.job?.status === "blocked") {
    return "Report uploaded and security scan completed. Medical extraction is not configured yet.";
  }
  if (input.job?.status === "queued") return "Processing queued";
  if (input.job?.status === "retry_scheduled") return "Processing queued for retry";
  if (input.job?.status === "waiting" || input.job?.status === "blocked") return "Processing paused";
  if (input.job?.status === "failed") return "Processing failed";
  if (input.hasInsight) return "Result ready";
  if (input.reportFile.status === "unsupported") return "Unsupported report";
  return "Upload complete";
}

export async function listUserReports(userId: string) {
  if (shouldUseSupabaseAuth()) {
    return listSupabaseUserReports(userId);
  }

  const store = await getStore();
  return store.reportFiles
    .filter((report) => report.userId === userId && report.status !== "deleted" && !report.deletedAt)
    .map((reportFile) => ({
      healthInsight:
        store.healthInsights.find(
          (insight) =>
            insight.labReportId ===
            store.labReports.find((report) => report.reportFileId === reportFile.id)?.id
        ) ?? null,
      job: store.processingJobs.find((job) => job.reportFileId === reportFile.id) ?? null,
      labReport: store.labReports.find((report) => report.reportFileId === reportFile.id) ?? null,
      reportFile
    }))
    .sort((a, b) => b.reportFile.createdAt.localeCompare(a.reportFile.createdAt));
}

export async function getReportDetails(userId: string, reportFileId: string) {
  if (shouldUseSupabaseAuth()) {
    return getSupabaseReportDetails(userId, reportFileId);
  }

  const store = await getStore();
  const reportFile = store.reportFiles.find(
    (candidate) => candidate.id === reportFileId && candidate.userId === userId
  );

  if (!reportFile) {
    return null;
  }

  const labReport = store.labReports.find((report) => report.reportFileId === reportFile.id) ?? null;
  const job = store.processingJobs.find((candidate) => candidate.reportFileId === reportFile.id) ?? null;
  const biomarkerResults = labReport
    ? store.biomarkerResults.filter((marker) => marker.labReportId === labReport.id)
    : [];
  const healthInsight = labReport
    ? store.healthInsights.find((insight) => insight.labReportId === labReport.id) ?? null
    : null;
  const riskFlags = labReport
    ? store.healthRiskFlags.filter((flag) => flag.labReportId === labReport.id)
    : [];
  const allUserLabReports = store.labReports.filter((report) => report.userId === userId);
  const allUserReportFiles = store.reportFiles.filter((report) => report.userId === userId);
  const filesByLabReportId = reportFilesByLabReportId(allUserLabReports, allUserReportFiles);
  const allUserMarkers = store.biomarkerResults.filter((marker) => marker.userId === userId);
  const markerCards = buildMarkerCards({
    currentMarkers: biomarkerResults,
    insight: healthInsight,
    previousMarkers: allUserMarkers,
    reportFilesByLabReportId: filesByLabReportId
  });

  return {
    biomarkerResults,
    feedbackEvents: labReport
      ? store.feedbackEvents.filter((event) => event.labReportId === labReport.id)
      : [],
    healthInsight,
    job,
    labReport,
    markerCards,
    reminders: labReport
      ? store.reminders.filter((reminder) => reminder.labReportId === labReport.id)
      : [],
    reportFile,
    riskFlags,
    unsupportedSections: labReport?.unsupportedSections ?? []
  };
}

export async function listHealthTimeline(userId: string) {
  const store = await getStore();
  const reportFiles = store.reportFiles
    .filter((report) => report.userId === userId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const labReports = store.labReports.filter((report) => report.userId === userId);
  const filesByLabReportId = reportFilesByLabReportId(labReports, reportFiles);
  const markers = store.biomarkerResults.filter((marker) => marker.userId === userId);

  return {
    reminders: store.reminders
      .filter((reminder) => reminder.userId === userId)
      .sort((a, b) => a.reminderDate.localeCompare(b.reminderDate)),
    timeline: reportFiles.map((reportFile) => {
      const labReport = labReports.find((report) => report.reportFileId === reportFile.id) ?? null;
      const job = store.processingJobs.find((candidate) => candidate.reportFileId === reportFile.id) ?? null;
      const insight = labReport
        ? store.healthInsights.find((candidate) => candidate.labReportId === labReport.id) ?? null
        : null;
      const markerCount = labReport
        ? markers.filter((marker) => marker.labReportId === labReport.id).length
        : 0;
      return { insight, job, labReport, markerCount, reportFile };
    }),
    trendSeries: buildTrendSeries({
      markers,
      reportFilesByLabReportId: filesByLabReportId
    })
  };
}

export async function createRetestReminder(input: {
  canonicalBiomarkerKey: string | null;
  note: string | null;
  reminderDate: string;
  reportFileId: string | null;
  title: string;
  userId: string;
}) {
  const store = await getStore();
  const reportFile = input.reportFileId
    ? store.reportFiles.find(
        (candidate) => candidate.id === input.reportFileId && candidate.userId === input.userId
      ) ?? null
    : null;
  const labReport = reportFile
    ? store.labReports.find((candidate) => candidate.reportFileId === reportFile.id) ?? null
    : null;
  const now = new Date().toISOString();
  const reminder: ReminderRecord = {
    canonicalBiomarkerKey: input.canonicalBiomarkerKey,
    createdAt: now,
    id: randomUUID(),
    labReportId: labReport?.id ?? null,
    note: input.note,
    reminderDate: input.reminderDate,
    reportFileId: reportFile?.id ?? null,
    status: "scheduled",
    title: input.title,
    updatedAt: now,
    userId: input.userId
  };

  store.reminders.push(reminder);
  trackAnalyticsEventSync(store, {
    eventName: "reminder_set",
    labReportId: reminder.labReportId,
    metadata: {
      canonicalBiomarkerKey: reminder.canonicalBiomarkerKey,
      reminderDate: reminder.reminderDate
    },
    reportFileId: reminder.reportFileId,
    userId: input.userId
  });
  createNotificationPlaceholderSync(store, {
    eventType: "retest_reminder",
    relatedDoctorReviewId: null,
    relatedReportFileId: reminder.reportFileId,
    recipientEmail: input.userId,
    userId: input.userId
  });
  addAuditLogSync(store, {
    action: "retest_reminder_created",
    actorRole: "user",
    actorUserId: input.userId,
    entityId: reminder.id,
    entityType: "reminder",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      canonicalBiomarkerKey: reminder.canonicalBiomarkerKey,
      reminderDate: reminder.reminderDate
    },
    userAgent: null
  });
  await saveStore(store);
  return reminder;
}

export async function createFeedbackEvent(input: {
  confusingText: string | null;
  freeText: string | null;
  feedbackSurface: FeedbackEventRecord["feedbackSurface"];
  helpful: FeedbackEventRecord["helpful"];
  doctorReviewId?: string | null;
  reportFileId: string | null;
  userId: string;
  wouldTrustDoctorReview: FeedbackEventRecord["wouldTrustDoctorReview"];
}) {
  if (shouldUseSupabaseAuth()) {
    return createSupabaseFeedbackEvent(input);
  }

  const store = await getStore();
  const reportFile = input.reportFileId
    ? store.reportFiles.find(
        (candidate) => candidate.id === input.reportFileId && candidate.userId === input.userId
      ) ?? null
    : null;
  const labReport = reportFile
    ? store.labReports.find((candidate) => candidate.reportFileId === reportFile.id) ?? null
    : null;
  const feedback: FeedbackEventRecord = {
    confusingText: input.confusingText,
    createdAt: new Date().toISOString(),
    doctorReviewId: input.doctorReviewId ?? null,
    feedbackSurface: input.feedbackSurface,
    freeText: input.freeText,
    helpful: input.helpful,
    id: randomUUID(),
    labReportId: labReport?.id ?? null,
    reportFileId: reportFile?.id ?? null,
    status: "new",
    userId: input.userId,
    wouldTrustDoctorReview: input.wouldTrustDoctorReview
  };

  store.feedbackEvents.push(feedback);
  trackAnalyticsEventSync(store, {
    eventName: "feedback_submitted",
    labReportId: feedback.labReportId,
    metadata: {
      feedbackSurface: feedback.feedbackSurface,
      helpful: feedback.helpful,
      wouldTrustDoctorReview: feedback.wouldTrustDoctorReview
    },
    reportFileId: feedback.reportFileId,
    userId: input.userId
  });
  addAuditLogSync(store, {
    action: "feedback_submitted",
    actorRole: "user",
    actorUserId: input.userId,
    entityId: feedback.id,
    entityType: "feedback_event",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      helpful: feedback.helpful,
      wouldTrustDoctorReview: feedback.wouldTrustDoctorReview
    },
    userAgent: null
  });
  await saveStore(store);
  return feedback;
}

export async function trackAnalyticsEvent(input: {
  eventName: AnalyticsEventName;
  labReportId?: string | null;
  metadata?: Record<string, unknown>;
  reportFileId?: string | null;
  userId: string | null;
}) {
  if (shouldUseSupabaseAuth()) {
    return trackSupabaseAnalyticsEvent(input);
  }

  const store = await getStore();
  const event = trackAnalyticsEventSync(store, {
    eventName: input.eventName,
    labReportId: input.labReportId ?? null,
    metadata: input.metadata ?? {},
    reportFileId: input.reportFileId ?? null,
    userId: input.userId
  });
  await saveStore(store);
  return event;
}

export async function startPayment(input: {
  productType: PaymentProductType;
  reportFileId: string | null;
  userId: string;
}) {
  const store = await getStore();
  const product = PRIVATE_BETA_PRODUCTS[input.productType];
  const reportFile = input.reportFileId
    ? store.reportFiles.find(
        (candidate) => candidate.id === input.reportFileId && candidate.userId === input.userId
      ) ?? null
    : null;

  if (!product) {
    throw new Error("unsupported_product");
  }

  if (input.reportFileId && !reportFile) {
    throw new Error("report_not_found");
  }

  const now = new Date().toISOString();
  const payment = {
    amountMinorUnits: product.amountMinorUnits,
    createdAt: now,
    currency: product.currency,
    id: randomUUID(),
    legalReviewRequired: true,
    provider: "razorpay_sandbox_placeholder" as const,
    providerOrderId: `order_${randomUUID()}`,
    providerPaymentId: null,
    publicLaunchEnabled: false as const,
    productType: input.productType,
    reportId: reportFile?.id ?? null,
    status: "started" as const,
    updatedAt: now,
    userId: input.userId
  };

  store.payments.push(payment);
  trackAnalyticsEventSync(store, {
    eventName: "payment_started",
    labReportId: null,
    metadata: {
      amountMinorUnits: payment.amountMinorUnits,
      productType: payment.productType,
      provider: payment.provider
    },
    reportFileId: payment.reportId,
    userId: input.userId
  });
  addAuditLogSync(store, {
    action: "payment_started",
    actorRole: "user",
    actorUserId: input.userId,
    entityId: payment.id,
    entityType: "payment",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      amountMinorUnits: payment.amountMinorUnits,
      productType: payment.productType,
      provider: payment.provider,
      publicLaunchEnabled: payment.publicLaunchEnabled
    },
    userAgent: null
  });
  await saveStore(store);
  return payment;
}

export async function completePayment(input: {
  paymentId: string;
  providerPaymentId?: string | null;
  userId: string;
}) {
  const store = await getStore();
  const payment = store.payments.find(
    (candidate) => candidate.id === input.paymentId && candidate.userId === input.userId
  );

  if (!payment) {
    throw new Error("payment_not_found");
  }

  payment.status = "completed";
  payment.providerPaymentId = input.providerPaymentId ?? `pay_${randomUUID()}`;
  payment.updatedAt = new Date().toISOString();
  trackAnalyticsEventSync(store, {
    eventName: "payment_completed",
    labReportId: null,
    metadata: {
      amountMinorUnits: payment.amountMinorUnits,
      productType: payment.productType,
      provider: payment.provider
    },
    reportFileId: payment.reportId,
    userId: input.userId
  });
  addAuditLogSync(store, {
    action: "payment_completed",
    actorRole: "user",
    actorUserId: input.userId,
    entityId: payment.id,
    entityType: "payment",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      productType: payment.productType,
      provider: payment.provider,
      status: payment.status
    },
    userAgent: null
  });
  await saveStore(store);
  return payment;
}

export async function createDataExport(input: {
  actorRole: "admin" | "superadmin";
  actorUserId: string;
  targetUserId: string;
}) {
  const store = await getStore();
  const exportJson = userScopedExport(store, input.targetUserId);
  const request = createDataRightsRequestRecord({
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    deletedRecordCounts: null,
    exportJson,
    requestType: "export",
    userId: input.targetUserId
  });

  store.dataRightsRequests.push(request);
  addAuditLogSync(store, {
    action: "data_export_completed",
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    entityId: request.id,
    entityType: "data_rights_request",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      targetUserId: input.targetUserId
    },
    userAgent: null
  });
  await saveStore(store);
  return request;
}

export async function createDataDeletion(input: {
  actorRole: "admin" | "superadmin";
  actorUserId: string;
  targetUserId: string;
}) {
  const store = await getStore();
  const deletedRecordCounts = deleteUserScopedRecords(store, input.targetUserId);
  const request = createDataRightsRequestRecord({
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    deletedRecordCounts,
    exportJson: null,
    requestType: "delete",
    userId: input.targetUserId
  });

  store.dataRightsRequests.push(request);
  addAuditLogSync(store, {
    action: "data_delete_completed",
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    entityId: request.id,
    entityType: "data_rights_request",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      deletedRecordCounts,
      targetUserId: input.targetUserId
    },
    userAgent: null
  });
  await saveStore(store);
  return request;
}

export async function listAdminReports() {
  if (shouldUseSupabaseAuth()) {
    return listSupabaseAdminReports();
  }

  const store = await getStore();
  return {
    auditLogs: store.auditLogs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    biomarkerAliases: store.biomarkerAliases,
    biomarkerCatalog: store.biomarkerCatalog,
    biomarkerResults: store.biomarkerResults.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    extractedDocuments: store.extractedDocuments.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    healthInsights: store.healthInsights.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    healthRiskFlags: store.healthRiskFlags.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    jobs: store.processingJobs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    labReports: store.labReports,
    modelRuns: store.modelRuns.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    reportFiles: store.reportFiles.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    reminders: store.reminders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    feedbackEvents: store.feedbackEvents.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    doctorReviews: store.doctorReviews.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    payments: store.payments.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    analyticsEvents: store.analyticsEvents.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    notifications: store.notifications.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    dataRightsRequests: store.dataRightsRequests.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    betaInvites: store.betaInvites.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    queues: buildAdminQueues(store),
    steps: store.processingJobSteps.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export async function correctBiomarker(input: {
  actorUserId: string;
  confidenceScore: number | null;
  ipAddress: string | null;
  biomarkerResultId: string;
  canonicalName: string | null;
  rawName: string | null;
  reason: string | null;
  referenceHigh: number | null;
  referenceLow: number | null;
  referenceRangeText: string | null;
  requestId: string | null;
  reviewRouting: ReviewRouting | null;
  sourceText: string | null;
  systemFlag: BiomarkerFlag | null;
  unit: string | null;
  userAgent: string | null;
  valueNumeric: number | null;
  valueText: string | null;
}) {
  const store = await getStore();
  const marker = mustFindBiomarkerResult(store, input.biomarkerResultId);
  const now = new Date().toISOString();

  marker.isManuallyCorrected = true;
  marker.correctedAt = now;
  marker.correctedBy = input.actorUserId;
  marker.correctedConfidenceScore = input.confidenceScore;
  marker.correctedCanonicalName = input.canonicalName;
  marker.correctedRawName = input.rawName;
  marker.correctedReferenceHigh = input.referenceHigh;
  marker.correctedReferenceLow = input.referenceLow;
  marker.correctedReferenceRangeText = input.referenceRangeText;
  marker.correctedReviewRouting = input.reviewRouting;
  marker.correctedSourceText = input.sourceText;
  marker.correctedSystemFlag = input.systemFlag;
  marker.correctedUnit = input.unit;
  marker.correctedValueNumeric = input.valueNumeric;
  marker.correctedValueText = input.valueText;
  marker.correctionReason = input.reason;
  marker.updatedAt = now;

  addAuditLogSync(store, {
    action: "admin_biomarker_corrected",
    actorRole: "admin",
    actorUserId: input.actorUserId,
    entityId: marker.id,
    entityType: "biomarker_result",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: {
      correctedFields: correctedFieldNames(marker),
      labReportId: marker.labReportId,
      originalCanonicalName: marker.canonicalName,
      originalRawName: marker.rawName,
      reason: input.reason
    },
    userAgent: input.userAgent
  });
  await saveStore(store);
  return marker;
}

export async function assignDoctorReview(input: {
  actorUserId: string;
  assignedDoctorEmail: string;
  healthInsightId: string;
  ipAddress: string | null;
  priority?: "standard" | "urgent";
  requestId: string | null;
  userAgent: string | null;
}) {
  const store = await getStore();
  const insight = mustFindHealthInsight(store, input.healthInsightId);
  const labReport = mustFindLabReport(store, insight.labReportId);
  const reportFile = mustFindReportFile(store, labReport.reportFileId);
  const now = new Date().toISOString();
  const normalizedDoctorEmail = input.assignedDoctorEmail.trim().toLowerCase();
  const existing = store.doctorReviews.find(
    (review) => review.healthInsightId === insight.id && review.status !== "rejected"
  );
  const review: DoctorReviewRecord =
    existing ??
    {
      aiDraftSnapshot: {
        disclaimer: insight.disclaimer,
        possibleRelevance: insight.possibleRelevance,
        questionsToAskDoctor: insight.questionsToAskDoctor,
        retestSuggestion: insight.retestSuggestion,
        summary: insight.summary
      },
      assignedAt: now,
      assignedBy: input.actorUserId,
      assignedDoctorEmail: normalizedDoctorEmail,
      assignedDoctorId: normalizedDoctorEmail,
      completedAt: null,
      createdAt: now,
      doctorEditedSummary: null,
      doctorNotes: null,
      healthInsightId: insight.id,
      id: randomUUID(),
      labReportId: labReport.id,
      priority: input.priority ?? "standard",
      rejectionReason: null,
      reportFileId: reportFile.id,
      requestMoreInfoMessage: null,
      status: "assigned",
      updatedAt: now,
      userId: insight.userId
    };

  review.assignedDoctorEmail = normalizedDoctorEmail;
  review.assignedDoctorId = normalizedDoctorEmail;
  review.priority = input.priority ?? review.priority;
  review.status = review.status === "more_info_requested" ? "assigned" : review.status;
  review.updatedAt = now;

  if (!existing) {
    store.doctorReviews.push(review);
  }

  insight.doctorReviewId = review.id;
  insight.status = "doctor_review_required";
  insight.updatedAt = now;

  trackAnalyticsEventSync(store, {
    eventName: "doctor_review_requested",
    labReportId: labReport.id,
    metadata: {
      assignedDoctorEmail: normalizedDoctorEmail,
      priority: review.priority
    },
    reportFileId: reportFile.id,
    userId: insight.userId
  });
  addAuditLogSync(store, {
    action: "doctor_review_assigned",
    actorRole: "admin",
    actorUserId: input.actorUserId,
    entityId: review.id,
    entityType: "doctor_review",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: {
      assignedDoctorEmail: normalizedDoctorEmail,
      healthInsightId: insight.id,
      priority: review.priority
    },
    userAgent: input.userAgent
  });
  await saveStore(store);
  return review;
}

export async function listDoctorReviews(doctorEmail: string) {
  const store = await getStore();
  const normalizedDoctorEmail = doctorEmail.trim().toLowerCase();
  return store.doctorReviews
    .filter((review) => review.assignedDoctorEmail === normalizedDoctorEmail)
    .map((review) => buildDoctorReviewDetail(store, review))
    .sort((a, b) => b.review.createdAt.localeCompare(a.review.createdAt));
}

export async function getDoctorReviewDetail(doctorEmail: string, reviewId: string) {
  const store = await getStore();
  const normalizedDoctorEmail = doctorEmail.trim().toLowerCase();
  const review = store.doctorReviews.find(
    (candidate) =>
      candidate.id === reviewId && candidate.assignedDoctorEmail === normalizedDoctorEmail
  );

  return review ? buildDoctorReviewDetail(store, review) : null;
}

export async function applyDoctorReviewAction(input: {
  action: DoctorReviewAction;
  doctorEmail: string;
  editedSummary: string | null;
  ipAddress: string | null;
  notes: string | null;
  reason: string | null;
  requestId: string | null;
  reviewId: string;
  userAgent: string | null;
}) {
  const store = await getStore();
  const normalizedDoctorEmail = input.doctorEmail.trim().toLowerCase();
  const review = store.doctorReviews.find(
    (candidate) =>
      candidate.id === input.reviewId && candidate.assignedDoctorEmail === normalizedDoctorEmail
  );

  if (!review) {
    throw new Error("doctor_review_not_found");
  }

  const insight = mustFindHealthInsight(store, review.healthInsightId);
  const now = new Date().toISOString();

  if (input.action === "mark_urgent") {
    review.priority = "urgent";
    review.status = review.status === "assigned" ? "in_review" : review.status;
  } else if (input.action === "approve") {
    review.status = "approved";
    review.completedAt = now;
    insight.status = "doctor_reviewed";
    insight.doctorReviewedAt = now;
    insight.doctorReviewedBy = normalizedDoctorEmail;
    createNotificationPlaceholderSync(store, {
      eventType: "doctor_review_complete",
      relatedDoctorReviewId: review.id,
      relatedReportFileId: review.reportFileId,
      recipientEmail: review.userId,
      userId: review.userId
    });
  } else if (input.action === "edit_and_approve") {
    review.status = "edited_approved";
    review.completedAt = now;
    review.doctorEditedSummary = input.editedSummary;
    insight.status = "doctor_reviewed";
    insight.doctorReviewedAt = now;
    insight.doctorReviewedBy = normalizedDoctorEmail;
    insight.doctorEditedSummary = input.editedSummary;
    if (input.editedSummary) {
      insight.summary = input.editedSummary;
    }
    createNotificationPlaceholderSync(store, {
      eventType: "doctor_review_complete",
      relatedDoctorReviewId: review.id,
      relatedReportFileId: review.reportFileId,
      recipientEmail: review.userId,
      userId: review.userId
    });
  } else if (input.action === "reject") {
    review.status = "rejected";
    review.completedAt = now;
    review.rejectionReason = input.reason;
    insight.status = "rejected";
  } else if (input.action === "request_more_info") {
    review.status = "more_info_requested";
    review.requestMoreInfoMessage = input.reason;
    insight.status = "doctor_review_required";
  }

  review.doctorNotes = input.notes ?? review.doctorNotes;
  review.updatedAt = now;
  insight.updatedAt = now;

  addAuditLogSync(store, {
    action: "doctor_review_action",
    actorRole: "doctor",
    actorUserId: normalizedDoctorEmail,
    entityId: review.id,
    entityType: "doctor_review",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: {
      action: input.action,
      healthInsightStatus: insight.status,
      priority: review.priority
    },
    userAgent: input.userAgent
  });
  await saveStore(store);
  return buildDoctorReviewDetail(store, review);
}

export async function readPrivateReport(input: {
  ipAddress: string | null;
  reportFileId: string;
  requestId: string | null;
  userAgent: string | null;
  userId: string;
}) {
  if (shouldUseSupabaseAuth()) {
    return readSupabasePrivateReport(input);
  }

  const store = await getStore();
  const reportFile = mustFindReportFile(store, input.reportFileId);

  if (reportFile.userId !== input.userId || reportFile.status === "deleted" || reportFile.deletedAt) {
    throw new Error("report_not_found");
  }

  await addAuditLog(store, {
    action: "raw_report_access",
    actorRole: "user",
    actorUserId: input.userId,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: { storageBucket: reportFile.storageBucket },
    userAgent: input.userAgent
  });
  await saveStore(store);
  return {
    bytes: await readFile(path.join(STORAGE_DIR, reportFile.storageKey)),
    reportFile
  };
}

export async function createSignedDownloadUrl(input: {
  actorRole: UserRole;
  ipAddress: string | null;
  purpose: string;
  reportFileId: string;
  requestId: string | null;
  userAgent: string | null;
  userId: string;
}) {
  if (shouldUseSupabaseAuth()) {
    return createSupabaseSignedDownloadUrl(input);
  }

  const store = await getStore();
  const reportFile = store.reportFiles.find((candidate) => candidate.id === input.reportFileId);
  const authorized =
    reportFile &&
    !reportFile.deletedAt &&
    reportFile.status !== "deleted" &&
    (reportFile.userId === input.userId ||
      roleCanAccessStorage(input.actorRole) ||
      isDoctorAssignedToReport(store, input.userId, reportFile.id));

  if (!reportFile || !authorized) {
    await addAuditLog(store, {
      action: "raw_report_access_denied",
      actorRole: input.actorRole,
      actorUserId: input.userId,
      entityId: input.reportFileId,
      entityType: "report_file",
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      safeMetadata: { purpose: input.purpose },
      userAgent: input.userAgent
    });
    await saveStore(store);
    throw new Error("report_not_found");
  }

  await addAuditLog(store, {
    action: "raw_report_access_requested",
    actorRole: input.actorRole,
    actorUserId: input.userId,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: { purpose: input.purpose, storageBucket: reportFile.storageBucket },
    userAgent: input.userAgent
  });
  const storageProvider = getStorageProvider();
  const downloadTarget = await storageProvider.createDownloadUrl({
    purpose: input.purpose,
    reportFileId: reportFile.id,
    requesterUserId: input.userId,
    storageKey: reportFile.storageKey
  });
  const localDownloadToken = createSignedToken(
    {
      action: "download",
      expiresAt: new Date(downloadTarget.expiresAt).getTime(),
      reportFileId: reportFile.id,
      storageKey: reportFile.storageKey,
      userId: input.userId
    },
    getReportSigningSecret()
  );
  const downloadUrl =
    storageProvider.name === "mock-private"
      ? `/api/reports/${reportFile.id}/download?token=${localDownloadToken}`
      : downloadTarget.downloadUrl;
  await addAuditLog(store, {
    action: "signed_download_url_generated",
    actorRole: input.actorRole,
    actorUserId: input.userId,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: {
      expiresAt: downloadTarget.expiresAt,
      purpose: input.purpose,
      storageProvider: storageProvider.name
    },
    userAgent: input.userAgent
  });
  await saveStore(store);
  return { ...downloadTarget, downloadUrl, reportFile };
}

export async function deleteReportFile(input: {
  actorRole: UserRole;
  ipAddress: string | null;
  reportFileId: string;
  requestId: string | null;
  userAgent: string | null;
  userId: string;
}) {
  if (shouldUseSupabaseAuth()) {
    return deleteSupabaseReportFile(input);
  }

  const store = await getStore();
  const reportFile = store.reportFiles.find((candidate) => candidate.id === input.reportFileId);

  if (
    !reportFile ||
    (reportFile.userId !== input.userId && !roleCanAccessStorage(input.actorRole))
  ) {
    throw new Error("report_not_found");
  }

  const now = new Date().toISOString();
  reportFile.deletedAt = now;
  reportFile.status = "deleted";
  reportFile.updatedAt = now;
  await getStorageProvider().deleteFile({ storageKey: reportFile.storageKey });
  await addAuditLog(store, {
    action: "report_deleted",
    actorRole: input.actorRole,
    actorUserId: input.userId,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: { storageBucket: reportFile.storageBucket },
    userAgent: input.userAgent
  });
  await saveStore(store);
  return { reportFile };
}

export async function readAssignedDoctorPrivateReport(input: {
  doctorEmail: string;
  ipAddress: string | null;
  requestId: string | null;
  reviewId: string;
  userAgent: string | null;
}) {
  if (shouldUseSupabaseAuth()) {
    return readAssignedSupabaseDoctorPrivateReport({
      doctorUserId: input.doctorEmail,
      ipAddress: input.ipAddress,
      requestId: input.requestId,
      reviewId: input.reviewId,
      userAgent: input.userAgent
    });
  }

  const store = await getStore();
  const normalizedDoctorEmail = input.doctorEmail.trim().toLowerCase();
  const review = store.doctorReviews.find(
    (candidate) =>
      candidate.id === input.reviewId && candidate.assignedDoctorEmail === normalizedDoctorEmail
  );

  if (!review) {
    throw new Error("doctor_review_not_found");
  }

  const reportFile = mustFindReportFile(store, review.reportFileId);
  addAuditLogSync(store, {
    action: "raw_report_access",
    actorRole: "doctor",
    actorUserId: normalizedDoctorEmail,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: {
      doctorReviewId: review.id,
      storageBucket: reportFile.storageBucket
    },
    userAgent: input.userAgent
  });
  await saveStore(store);
  return {
    bytes: await readFile(path.join(STORAGE_DIR, reportFile.storageKey)),
    reportFile
  };
}

export async function addSignedUrlAudit(input: {
  actorRole: "user" | "admin";
  ipAddress: string | null;
  reportFileId: string;
  requestId: string | null;
  urlType: "upload" | "download";
  userAgent: string | null;
  userId: string;
}) {
  if (shouldUseSupabaseAuth()) {
    return addSupabaseSignedUrlAudit(input);
  }

  const store = await getStore();
  await addAuditLog(store, {
    action: "signed_url_generation",
    actorRole: input.actorRole,
    actorUserId: input.userId,
    entityId: input.reportFileId,
    entityType: "report_file",
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    safeMetadata: { urlType: input.urlType },
    userAgent: input.userAgent
  });
  await saveStore(store);
}

function ensureLabReportForReportFile(store: ReportStore, reportFile: ReportFileRecord, now: string) {
  const existing = store.labReports.find((report) => report.reportFileId === reportFile.id);

  if (existing) {
    return existing;
  }

  const labReport: LabReportRecord = {
    classificationConfidence: null,
    createdAt: now,
    extractionVersion: 1,
    id: randomUUID(),
    parserVersion: "phase2_stub",
    rawExtractedTables: null,
    rawExtractedText: null,
    reportFileId: reportFile.id,
    reportType: null,
    status: "draft",
    supportedPanels: [],
    unsupportedSections: [],
    updatedAt: now,
    userId: reportFile.userId
  };

  store.labReports.push(labReport);
  return labReport;
}

async function ensureProcessingJobForReportFile(
  store: ReportStore,
  reportFile: ReportFileRecord,
  labReport: LabReportRecord
) {
  return createDatabaseWorkflowProvider(store).enqueueReportProcessing({
    idempotencyKey: makeIdempotencyKey(reportFile.userId, reportFile.checksumSha256),
    jobType: "report_processing",
    labReportId: labReport.id,
    processingVersion: PROCESSING_VERSION,
    reportFileId: reportFile.id,
    userId: reportFile.userId
  });
}

async function runClaimedWorkflowJob(store: ReportStore, jobId: string, workerIdValue: string) {
  const workflow = createDatabaseWorkflowProvider(store);
  const job = mustFindJob(store, jobId);
  const reportFile = mustFindReportFile(store, job.reportFileId);
  const stepName = job.currentStep ?? "malware_scan";

  if (!PIPELINE_STEPS.includes(stepName)) {
    await workflow.markJobBlocked({
      errorCode: "unknown_step",
      jobId: job.id,
      reason: "Unknown processing step.",
      stepName: "malware_scan"
    });
    return { job, processed: true, reason: "unknown_step" };
  }

  if (stepName === "extract_document") {
    return runExtractDocumentStep(store, job.id, workerIdValue);
  }

  if (stepName === "ocr_fallback") {
    return runOcrFallbackStep(store, job.id, workerIdValue);
  }

  if (stepName === "classify_report") {
    return runClassifyReportStep(store, job.id, workerIdValue);
  }

  if (stepName === "extract_biomarkers") {
    return runExtractBiomarkersStep(store, job.id, workerIdValue);
  }

  if (stepName === "normalize_biomarkers") {
    return runNormalizeBiomarkersStep(store, job.id, workerIdValue);
  }

  if (stepName === "validate_biomarkers") {
    return runValidateBiomarkersStep(store, job.id, workerIdValue);
  }

  if (stepName === "run_safety_rules") {
    return runSafetyRulesStep(store, job.id, workerIdValue);
  }

  if (stepName === "generate_patient_explanation") {
    return runGeneratePatientExplanationStep(store, job.id, workerIdValue);
  }

  if (stepName === "route_review") {
    return runRouteReviewStep(store, job.id, workerIdValue);
  }

  if (stepName !== "malware_scan") {
    await workflow.markJobBlocked({
      errorCode: "future_step_not_implemented",
      jobId: job.id,
      reason: `${stepName} is not configured yet.`,
      stepName
    });
    return { job, processed: true, reason: "future_step_not_implemented" };
  }

  const existingStep = store.processingJobSteps.find(
    (step) => step.processingJobId === job.id && step.stepName === "malware_scan"
  );

  if (existingStep?.status === "completed" && reportFile.scanStatus === "scan_passed") {
    advanceJobToStep(job, "extract_document", "text_extraction_pending");
    return { job, processed: true, reason: "malware_scan_already_completed" };
  }

  await workflow.runJobStep({
    inputSnapshot: {
      mimeType: reportFile.mimeType,
      reportFileId: reportFile.id,
      scanStatus: reportFile.scanStatus
    },
    jobId: job.id,
    stepName: "malware_scan",
    workerId: workerIdValue
  });

  if (reportFile.status === "deleted" || reportFile.deletedAt) {
    await failAndBlockWorkflowJob(store, job.id, "malware_scan", "deleted_report", "Deleted report cannot be processed.");
    return { job, processed: true, reason: "deleted_report" };
  }

  if (reportFile.status === "rejected_file_type" || reportFile.status === "rejected_file_size") {
    await failAndBlockWorkflowJob(store, job.id, "malware_scan", "rejected_report", "Rejected report cannot be processed.");
    return { job, processed: true, reason: "rejected_report" };
  }

  if (reportFile.status !== "uploaded" && reportFile.scanStatus !== "scan_pending") {
    await failAndBlockWorkflowJob(store, job.id, "malware_scan", "upload_not_complete", "Report upload is not complete.");
    return { job, processed: true, reason: "upload_not_complete" };
  }

  addAuditLogSync(store, {
    action: "malware_scan_started",
    actorRole: "admin",
    actorUserId: workerIdValue,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: null,
    requestId: null,
    safeMetadata: { provider: "configured" },
    userAgent: workerIdValue
  });

  try {
    const malwareScan = await getMalwareScannerProvider().scanFile({
      reportFileId: reportFile.id,
      mimeType: reportFile.mimeType,
      storageKey: reportFile.storageKey
    });
    const scanStatus = toReportScanStatus(malwareScan.status);
    const now = malwareScan.scannedAt;
    reportFile.scanStatus = scanStatus;
    reportFile.scanCompletedAt = now;
    reportFile.updatedAt = now;

    if (scanStatus === "scan_passed" || (scanStatus === "scan_skipped_dev_only" && isLocalLikeWorkflowEnv())) {
      reportFile.status = scanStatus === "scan_passed" ? "scan_passed" : "scan_skipped_dev_only";
      job.currentState = "scan_passed";
      await workflow.markStepSucceeded({
        jobId: job.id,
        outputSnapshot: {
          provider: malwareScan.provider,
          scanStatus,
          signatureVersion: malwareScan.signatureVersion
        },
        stepName: "malware_scan"
      });
      addAuditLogSync(store, {
        action: "malware_scan_passed",
        actorRole: "admin",
        actorUserId: workerIdValue,
        entityId: reportFile.id,
        entityType: "report_file",
        ipAddress: null,
        requestId: null,
        safeMetadata: {
          provider: malwareScan.provider,
          scanStatus,
          signatureVersion: malwareScan.signatureVersion
        },
        userAgent: workerIdValue
      });
      advanceJobToStep(job, "extract_document", "text_extraction_pending");
      return { job, processed: true, reason: "malware_scan_passed" };
    }

    if (scanStatus === "scan_configuration_required") {
      reportFile.status = "scan_configuration_required";
      await failAndBlockWorkflowJob(
        store,
        job.id,
        "malware_scan",
        "malware_scan_configuration_required",
        "Malware scanner is not configured."
      );
      addAuditLogSync(store, {
        action: "malware_scan_configuration_required",
        actorRole: "admin",
        actorUserId: workerIdValue,
        entityId: reportFile.id,
        entityType: "report_file",
        ipAddress: null,
        requestId: null,
        safeMetadata: { provider: malwareScan.provider },
        userAgent: workerIdValue
      });
      return { job, processed: true, reason: "malware_scan_configuration_required" };
    }

    reportFile.status = scanStatus;
    await failAndBlockWorkflowJob(store, job.id, "malware_scan", "malware_scan_failed", "Malware scan failed.");
    addAuditLogSync(store, {
      action: "malware_scan_failed",
      actorRole: "admin",
      actorUserId: workerIdValue,
      entityId: reportFile.id,
      entityType: "report_file",
      ipAddress: null,
      requestId: null,
      safeMetadata: { provider: malwareScan.provider, scanStatus },
      userAgent: workerIdValue
    });
    return { job, processed: true, reason: "malware_scan_failed" };
  } catch (caught) {
    const step = store.processingJobSteps.find(
      (candidate) => candidate.processingJobId === job.id && candidate.stepName === "malware_scan"
    );
    const attemptCount = step?.attemptCount ?? 1;
    await workflow.markStepFailed({
      errorCode: "scanner_unavailable",
      errorMessage: caught instanceof Error ? caught.message : "Scanner unavailable.",
      jobId: job.id,
      retryable: true,
      stepName: "malware_scan"
    });

    if (attemptCount < job.maxAttempts) {
      await workflow.scheduleRetry({
        jobId: job.id,
        nextRunAt: getBackoffNextRunAt(attemptCount + 1),
        reason: "scanner_unavailable",
        stepName: "malware_scan"
      });
      return { job, processed: true, reason: "retry_scheduled" };
    }

    await workflow.markJobBlocked({
      errorCode: "scanner_unavailable",
      jobId: job.id,
      reason: "Malware scanner failed too many times.",
      stepName: "malware_scan"
    });
    return { job, processed: true, reason: "max_attempts_exceeded" };
  }
}

async function runExtractDocumentStep(store: ReportStore, jobId: string, workerIdValue: string) {
  const workflow = createDatabaseWorkflowProvider(store);
  const job = mustFindJob(store, jobId);
  const reportFile = mustFindReportFile(store, job.reportFileId);
  const labReport = mustFindLabReport(store, job.labReportId);

  await workflow.runJobStep({
    inputSnapshot: {
      mimeType: reportFile.mimeType,
      reportFileId: reportFile.id,
      scanStatus: reportFile.scanStatus
    },
    jobId: job.id,
    stepName: "extract_document",
    workerId: workerIdValue
  });

  if (reportFile.status === "deleted" || reportFile.deletedAt) {
    await failAndBlockWorkflowJob(store, job.id, "extract_document", "deleted_report", "Deleted report cannot be processed.");
    return { job, processed: true, reason: "deleted_report" };
  }

  if (reportFile.status !== "uploaded" && reportFile.status !== "scan_passed") {
    await failAndBlockWorkflowJob(store, job.id, "extract_document", "upload_not_complete", "Report upload is not complete.");
    return { job, processed: true, reason: "upload_not_complete" };
  }

  if (reportFile.scanStatus !== "scan_passed") {
    await failAndBlockWorkflowJob(store, job.id, "extract_document", "scan_not_passed", "Document extraction requires a passed security scan.");
    return { job, processed: true, reason: "scan_not_passed" };
  }

  addAuditLogSync(store, {
    action: "document_extraction_started",
    actorRole: "admin",
    actorUserId: workerIdValue,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: null,
    requestId: null,
    safeMetadata: { mimeType: reportFile.mimeType, provider: process.env.DOCUMENT_PARSER_PROVIDER ?? "mock" },
    userAgent: workerIdValue
  });

  const result = await getDocumentParserProvider().parseDocument({
    filename: reportFile.originalFilename,
    labReportId: labReport.id,
    mimeType: reportFile.mimeType,
    reportFileId: reportFile.id,
    storageKey: reportFile.storageKey
  });

  const extractedDocument = createExtractedDocumentFromResult(store, labReport, result);

  if (result.status === "success" && result.extractedText) {
    labReport.parserVersion = result.parserVersion;
    labReport.rawExtractedText = result.extractedText;
    labReport.rawExtractedTables = normalizeTables(result.extractedTablesJson);
    labReport.status = "text_extracted";
    labReport.updatedAt = new Date().toISOString();
    await workflow.markStepSucceeded({
      jobId: job.id,
      outputSnapshot: extractionOutputSnapshot(result, extractedDocument.id),
      stepName: "extract_document"
    });
    addDocumentAudit(store, "document_extraction_completed", workerIdValue, reportFile, result, extractedDocument.id);
    advanceJobToStep(job, "classify_report", "classified");
    return { job, processed: true, reason: "document_extracted" };
  }

  if (result.status === "ocr_required" || result.status === "low_text_confidence") {
    labReport.status = "ocr_required";
    labReport.updatedAt = new Date().toISOString();
    await workflow.markStepSucceeded({
      jobId: job.id,
      outputSnapshot: extractionOutputSnapshot(result, extractedDocument.id),
      stepName: "extract_document"
    });
    addDocumentAudit(store, "document_extraction_ocr_required", workerIdValue, reportFile, result, extractedDocument.id);
    advanceJobToStep(job, "ocr_fallback", "ocr_required");
    return { job, processed: true, reason: "ocr_required" };
  }

  addDocumentAudit(store, "document_extraction_failed", workerIdValue, reportFile, result, extractedDocument.id);
  await failAndBlockWorkflowJob(
    store,
    job.id,
    "extract_document",
    result.errorCode ?? "document_extraction_failed",
    result.errorMessage ?? "Document extraction failed."
  );
  return { job, processed: true, reason: result.errorCode ?? "document_extraction_failed" };
}

async function runOcrFallbackStep(store: ReportStore, jobId: string, workerIdValue: string) {
  const workflow = createDatabaseWorkflowProvider(store);
  const job = mustFindJob(store, jobId);
  const reportFile = mustFindReportFile(store, job.reportFileId);
  const labReport = mustFindLabReport(store, job.labReportId);

  await workflow.runJobStep({
    inputSnapshot: {
      mimeType: reportFile.mimeType,
      reportFileId: reportFile.id
    },
    jobId: job.id,
    stepName: "ocr_fallback",
    workerId: workerIdValue
  });

  addAuditLogSync(store, {
    action: "ocr_extraction_started",
    actorRole: "admin",
    actorUserId: workerIdValue,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: null,
    requestId: null,
    safeMetadata: { provider: process.env.OCR_PROVIDER ?? "mock" },
    userAgent: workerIdValue
  });

  const result = await getOcrProvider().extractText({
    filename: reportFile.originalFilename,
    labReportId: labReport.id,
    mimeType: reportFile.mimeType,
    reportFileId: reportFile.id,
    storageKey: reportFile.storageKey
  });
  const extractedDocument = createExtractedDocumentFromResult(store, labReport, result, process.env.OCR_PROVIDER ?? result.provider);

  if (result.status === "success" && result.extractedText) {
    labReport.parserVersion = result.parserVersion;
    labReport.rawExtractedText = result.extractedText;
    labReport.rawExtractedTables = normalizeTables(result.extractedTablesJson);
    labReport.status = "text_extracted";
    labReport.updatedAt = new Date().toISOString();
    await workflow.markStepSucceeded({
      jobId: job.id,
      outputSnapshot: extractionOutputSnapshot(result, extractedDocument.id),
      stepName: "ocr_fallback"
    });
    addDocumentAudit(store, "ocr_extraction_completed", workerIdValue, reportFile, result, extractedDocument.id);
    advanceJobToStep(job, "classify_report", "classified");
    return { job, processed: true, reason: "ocr_extracted" };
  }

  addDocumentAudit(
    store,
    result.errorCode === "ocr_configuration_required" ? "ocr_configuration_required" : "ocr_extraction_failed",
    workerIdValue,
    reportFile,
    result,
    extractedDocument.id
  );
  await failAndBlockWorkflowJob(
    store,
    job.id,
    "ocr_fallback",
    result.errorCode ?? "ocr_extraction_failed",
    result.errorMessage ?? "OCR extraction failed."
  );
  return { job, processed: true, reason: result.errorCode ?? "ocr_extraction_failed" };
}

async function runClassifyReportStep(store: ReportStore, jobId: string, workerIdValue: string) {
  const workflow = createDatabaseWorkflowProvider(store);
  const job = mustFindJob(store, jobId);
  const reportFile = mustFindReportFile(store, job.reportFileId);
  const labReport = mustFindLabReport(store, job.labReportId);
  const extractedDocument = latestExtractedText(store, labReport.id);

  await workflow.runJobStep({
    inputSnapshot: {
      labReportId: labReport.id,
      reportFileId: reportFile.id
    },
    jobId: job.id,
    stepName: "classify_report",
    workerId: workerIdValue
  });

  addAuditLogSync(store, {
    action: "report_classification_started",
    actorRole: "admin",
    actorUserId: workerIdValue,
    entityId: labReport.id,
    entityType: "lab_report",
    ipAddress: null,
    requestId: null,
    safeMetadata: { extractedDocumentId: extractedDocument?.id ?? null },
    userAgent: workerIdValue
  });

  if (!extractedDocument?.extractedText) {
    await failAndBlockWorkflowJob(
      store,
      job.id,
      "classify_report",
      "classification_requires_extracted_text",
      "Report classification requires extracted document text."
    );
    return { job, processed: true, reason: "classification_requires_extracted_text" };
  }

  const classification = await classifyExtractedReport({
    extractedTablesJson: extractedDocument.extractedTablesJson,
    extractedText: extractedDocument.extractedText,
    filename: reportFile.originalFilename,
    mimeType: reportFile.mimeType
  });
  const now = new Date().toISOString();
  labReport.classificationConfidence = classification.confidenceScore;
  labReport.reportType = classification.reportType ?? "unknown";
  labReport.supportedPanels = classification.supportedPanels ?? [];
  labReport.unsupportedSections = classification.status === "supported" || classification.status === "limited_beta" ? [] : [classification.status];
  labReport.updatedAt = now;

  if (classification.status === "unsupported" || classification.status === "unknown") {
    const reason = classification.unsupportedReason ?? "Report type is unknown or outside the private beta supported panels.";
    labReport.status = "unsupported";
    reportFile.status = "unsupported";
    reportFile.unsupportedReason = unsupportedReportCopy(reason);
    reportFile.updatedAt = now;
    await workflow.markStepSucceeded({
      jobId: job.id,
      outputSnapshot: {
        confidenceScore: classification.confidenceScore,
        reportType: classification.reportType,
        status: classification.status
      },
      stepName: "classify_report"
    });
    addAuditLogSync(store, {
      action: classification.status === "unknown" ? "report_classification_unknown" : "report_classification_unsupported",
      actorRole: "admin",
      actorUserId: workerIdValue,
      entityId: labReport.id,
      entityType: "lab_report",
      ipAddress: null,
      requestId: null,
      safeMetadata: {
        confidenceScore: classification.confidenceScore,
        reportType: classification.reportType,
        status: classification.status
      },
      userAgent: workerIdValue
    });
    await workflow.markJobBlocked({
      errorCode: classification.status === "unknown" ? "report_classification_unknown" : "unsupported_report_type",
      jobId: job.id,
      reason,
      stepName: "classify_report"
    });
    return { job, processed: true, reason: classification.status };
  }

  labReport.status = "text_extracted";
  reportFile.status = "processing";
  reportFile.updatedAt = now;
  await workflow.markStepSucceeded({
    jobId: job.id,
    outputSnapshot: {
      confidenceScore: classification.confidenceScore,
      reportType: classification.reportType,
      status: classification.status,
      supportedPanels: classification.supportedPanels ?? []
    },
    stepName: "classify_report"
  });
  addAuditLogSync(store, {
    action: "report_classification_completed",
    actorRole: "admin",
    actorUserId: workerIdValue,
    entityId: labReport.id,
    entityType: "lab_report",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      confidenceScore: classification.confidenceScore,
      reportType: classification.reportType,
      status: classification.status,
      supportedPanels: classification.supportedPanels ?? []
    },
    userAgent: workerIdValue
  });
  advanceJobToStep(job, "extract_biomarkers", "biomarker_extraction_pending");
  return { job, processed: true, reason: "report_classified" };
}

async function runExtractBiomarkersStep(store: ReportStore, jobId: string, workerIdValue: string) {
  const workflow = createDatabaseWorkflowProvider(store);
  const job = mustFindJob(store, jobId);
  const labReport = mustFindLabReport(store, job.labReportId);
  const reportFile = mustFindReportFile(store, job.reportFileId);
  const extractedDocument = latestExtractedText(store, labReport.id);

  await workflow.runJobStep({
    inputSnapshot: {
      labReportId: labReport.id,
      reportFileId: reportFile.id
    },
    jobId: job.id,
    stepName: "extract_biomarkers",
    workerId: workerIdValue
  });

  addAiAudit(store, "biomarker_extraction_started", workerIdValue, "lab_report", labReport.id, {
    extractedDocumentId: extractedDocument?.id ?? null
  });

  if (labReport.status === "unsupported" || labReport.reportType === "unsupported" || labReport.reportType === "unknown") {
    await failAndBlockWorkflowJob(store, job.id, "extract_biomarkers", "unsupported_report_type", "Unsupported reports cannot receive AI-only interpretation.");
    return { job, processed: true, reason: "unsupported_report_type" };
  }

  if (!extractedDocument?.extractedText) {
    await failAndBlockWorkflowJob(store, job.id, "extract_biomarkers", "missing_extracted_document", "Biomarker extraction requires extracted text.");
    return { job, processed: true, reason: "missing_extracted_document" };
  }

  let output: BiomarkerExtractionOutput;
  let providerName = "unconfigured";
  try {
    const provider = getAiProvider();
    providerName = provider.name;
    output = await provider.extractBiomarkers({
      extractedDocumentId: extractedDocument.id,
      extractedTablesJson: extractedDocument.extractedTablesJson,
      extractedText: extractedDocument.extractedText,
      labReportId: labReport.id,
      reportFileId: reportFile.id,
      userId: labReport.userId
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "AI provider is not configured.";
    const errorCode = message.includes("configuration") || message.includes("Mock AI provider is disabled")
      ? "ai_configuration_required"
      : "ai_provider_failed";
    recordAiModelRun(store, {
      errorCode,
      errorMessage: message,
      extractedDocumentId: extractedDocument.id,
      input: aiInputSummary(job, extractedDocument),
      job,
      modelName: process.env.OPENAI_MODEL_EXTRACTION || providerName,
      output: null,
      promptVersion: biomarkerExtractionPromptVersion(),
      provider: providerName,
      safetyFilterStatus: "not_applicable",
      schemaVersion: BIOMARKER_EXTRACTION_SCHEMA_VERSION,
      status: "failed",
      taskType: "extract_biomarkers",
      workerId: workerIdValue
    });
    addAiAudit(store, errorCode === "ai_configuration_required" ? "ai_configuration_required" : "biomarker_extraction_failed", workerIdValue, "lab_report", labReport.id, {
      errorCode
    });
    await failAndBlockWorkflowJob(store, job.id, "extract_biomarkers", errorCode, "AI biomarker extraction is not configured.");
    return { job, processed: true, reason: errorCode };
  }

  const validation = validateBiomarkerExtractionSchema(output);
  if (!validation.ok) {
    recordAiModelRun(store, {
      errorCode: "ai_schema_validation_failed",
      errorMessage: validation.errors.join("; "),
      extractedDocumentId: extractedDocument.id,
      input: aiInputSummary(job, extractedDocument),
      job,
      modelName: process.env.OPENAI_MODEL_EXTRACTION || providerName,
      output,
      promptVersion: biomarkerExtractionPromptVersion(),
      provider: providerName,
      safetyFilterStatus: "not_applicable",
      schemaVersion: BIOMARKER_EXTRACTION_SCHEMA_VERSION,
      status: "failed",
      taskType: "extract_biomarkers",
      workerId: workerIdValue
    });
    addAiAudit(store, "ai_schema_validation_failed", workerIdValue, "lab_report", labReport.id, {
      errorCount: validation.errors.length
    });
    await failAndBlockWorkflowJob(store, job.id, "extract_biomarkers", "ai_schema_validation_failed", "AI biomarker output did not match the required schema.");
    return { job, processed: true, reason: "ai_schema_validation_failed" };
  }

  const modelRun = recordAiModelRun(store, {
    extractedDocumentId: extractedDocument.id,
    input: aiInputSummary(job, extractedDocument),
    job,
    modelName: process.env.OPENAI_MODEL_EXTRACTION || providerName,
    output,
    promptVersion: biomarkerExtractionPromptVersion(),
    provider: providerName,
    safetyFilterStatus: "not_applicable",
    schemaVersion: BIOMARKER_EXTRACTION_SCHEMA_VERSION,
    status: "succeeded",
    taskType: "extract_biomarkers",
    workerId: workerIdValue
  });
  job.metadata = {
    ...job.metadata,
    biomarkerExtractionModelRunId: modelRun.id,
    extractedDocumentId: extractedDocument.id
  };
  await workflow.markStepSucceeded({
    jobId: job.id,
    outputSnapshot: {
      biomarkerCount: output.biomarkers.length,
      modelRunId: modelRun.id,
      provider: providerName
    },
    stepName: "extract_biomarkers"
  });
  addAiAudit(store, "biomarker_extraction_completed", workerIdValue, "lab_report", labReport.id, {
    biomarkerCount: output.biomarkers.length,
    modelRunId: modelRun.id
  });
  advanceJobToStep(job, "normalize_biomarkers", "biomarker_extracted");
  return { job, processed: true, reason: "biomarkers_extracted" };
}

async function runNormalizeBiomarkersStep(store: ReportStore, jobId: string, workerIdValue: string) {
  const workflow = createDatabaseWorkflowProvider(store);
  const job = mustFindJob(store, jobId);
  const labReport = mustFindLabReport(store, job.labReportId);
  const extractedDocument = latestExtractedText(store, labReport.id);
  const extractionRun = latestModelRun(store, job.id, "extract_biomarkers");

  await workflow.runJobStep({
    inputSnapshot: {
      extractionRunId: extractionRun?.id ?? null,
      labReportId: labReport.id
    },
    jobId: job.id,
    stepName: "normalize_biomarkers",
    workerId: workerIdValue
  });
  addAiAudit(store, "biomarker_normalization_started", workerIdValue, "lab_report", labReport.id, {
    extractionRunId: extractionRun?.id ?? null
  });

  if (!extractionRun?.outputJson || !extractedDocument) {
    await failAndBlockWorkflowJob(store, job.id, "normalize_biomarkers", "missing_biomarker_extraction", "Normalization requires a successful biomarker extraction run.");
    return { job, processed: true, reason: "missing_biomarker_extraction" };
  }

  const output = extractionRun.outputJson as BiomarkerExtractionOutput;
  const existing = store.biomarkerResults.filter((marker) => marker.labReportId === labReport.id);
  const normalized = existing.length
    ? (existing as NormalizedBiomarker[])
    : normalizeBiomarkerItems({
        aiModelRunId: extractionRun.id,
        extractedDocumentId: extractedDocument.id,
        items: output.biomarkers,
        labName: output.report_metadata.lab_name ?? null,
        labReportId: labReport.id,
        now: new Date().toISOString(),
        reportDate: output.report_metadata.report_date ?? null,
        reportFileId: job.reportFileId,
        reportType: labReport.reportType as ReportType,
        userId: labReport.userId
      });

  if (!existing.length) {
    store.biomarkerResults.push(...normalized);
  }

  const reviewRequired = normalized.some((marker) => marker.reviewRouting !== "auto_accept");
  if (reviewRequired) {
    addAiAudit(store, "biomarker_normalization_review_required", workerIdValue, "lab_report", labReport.id, {
      reviewCount: normalized.filter((marker) => marker.reviewRouting !== "auto_accept").length
    });
  }

  labReport.status = "biomarker_extracted";
  labReport.updatedAt = new Date().toISOString();
  await workflow.markStepSucceeded({
    jobId: job.id,
    outputSnapshot: {
      biomarkerCount: normalized.length,
      mappedCount: normalized.filter((marker) => marker.normalizationStatus === "mapped").length
    },
    stepName: "normalize_biomarkers"
  });
  addAiAudit(store, "biomarker_normalization_completed", workerIdValue, "lab_report", labReport.id, {
    biomarkerCount: normalized.length
  });
  advanceJobToStep(job, "validate_biomarkers", "normalized");
  return { job, processed: true, reason: "biomarkers_normalized" };
}

async function runValidateBiomarkersStep(store: ReportStore, jobId: string, workerIdValue: string) {
  const workflow = createDatabaseWorkflowProvider(store);
  const job = mustFindJob(store, jobId);
  const labReport = mustFindLabReport(store, job.labReportId);
  const biomarkers = store.biomarkerResults.filter((marker) => marker.labReportId === labReport.id) as NormalizedBiomarker[];

  await workflow.runJobStep({
    inputSnapshot: { biomarkerCount: biomarkers.length, labReportId: labReport.id },
    jobId: job.id,
    stepName: "validate_biomarkers",
    workerId: workerIdValue
  });
  addAiAudit(store, "biomarker_validation_started", workerIdValue, "lab_report", labReport.id, {
    biomarkerCount: biomarkers.length
  });

  const validation = validateNormalizedBiomarkers(biomarkers);
  biomarkers.forEach((marker) => {
    marker.validationStatus = validation.errors.length ? "invalid" : "valid";
    marker.updatedAt = new Date().toISOString();
  });

  if (!validation.ok) {
    addAiAudit(store, "biomarker_validation_failed", workerIdValue, "lab_report", labReport.id, {
      errorCount: validation.errors.length
    });
    await failAndBlockWorkflowJob(store, job.id, "validate_biomarkers", "biomarker_validation_failed", "Biomarker validation failed.");
    return { job, processed: true, reason: "biomarker_validation_failed" };
  }

  if (validation.reviewRequired) {
    addAiAudit(store, "low_confidence_review_required", workerIdValue, "lab_report", labReport.id, {
      lowConfidenceCount: validation.lowConfidence.length,
      unmappedCount: validation.unmapped.length
    });
  }

  labReport.status = "biomarker_validated";
  labReport.updatedAt = new Date().toISOString();
  await workflow.markStepSucceeded({
    jobId: job.id,
    outputSnapshot: {
      lowConfidenceCount: validation.lowConfidence.length,
      unmappedCount: validation.unmapped.length
    },
    stepName: "validate_biomarkers"
  });
  addAiAudit(store, "biomarker_validation_completed", workerIdValue, "lab_report", labReport.id, {
    biomarkerCount: biomarkers.length
  });
  advanceJobToStep(job, "run_safety_rules", validation.reviewRequired ? "low_confidence_review_required" : "validated");
  return { job, processed: true, reason: "biomarkers_validated" };
}

async function runSafetyRulesStep(store: ReportStore, jobId: string, workerIdValue: string) {
  const workflow = createDatabaseWorkflowProvider(store);
  const job = mustFindJob(store, jobId);
  const labReport = mustFindLabReport(store, job.labReportId);
  const biomarkers = store.biomarkerResults.filter((marker) => marker.labReportId === labReport.id) as NormalizedBiomarker[];

  await workflow.runJobStep({
    inputSnapshot: { biomarkerCount: biomarkers.length, labReportId: labReport.id },
    jobId: job.id,
    stepName: "run_safety_rules",
    workerId: workerIdValue
  });
  addAiAudit(store, "safety_rules_started", workerIdValue, "lab_report", labReport.id, {
    biomarkerCount: biomarkers.length
  });

  const safety = runMedicalSafetyRules({ biomarkers, labReport });
  createRiskFlags(store, labReport, safetyCriticalMarkers(biomarkers), safetyLowConfidenceMarkers(biomarkers), new Date().toISOString());
  job.metadata = {
    ...job.metadata,
    adminReviewRequired: safety.adminReviewRequired,
    doctorReviewRequired: safety.doctorReviewRequired,
    safetyReasons: safety.reasons
  };

  if (safety.criticalCount > 0) {
    addAiAudit(store, "critical_review_required", workerIdValue, "lab_report", labReport.id, {
      criticalCount: safety.criticalCount
    });
  }

  await workflow.markStepSucceeded({
    jobId: job.id,
    outputSnapshot: safety,
    stepName: "run_safety_rules"
  });
  addAiAudit(store, "safety_rules_completed", workerIdValue, "lab_report", labReport.id, safety);
  advanceJobToStep(job, "generate_patient_explanation", "insight_generation_pending");
  return { job, processed: true, reason: "safety_rules_completed" };
}

async function runGeneratePatientExplanationStep(store: ReportStore, jobId: string, workerIdValue: string) {
  const workflow = createDatabaseWorkflowProvider(store);
  const job = mustFindJob(store, jobId);
  const labReport = mustFindLabReport(store, job.labReportId);
  const biomarkers = store.biomarkerResults.filter((marker) => marker.labReportId === labReport.id) as NormalizedBiomarker[];

  await workflow.runJobStep({
    inputSnapshot: { biomarkerCount: biomarkers.length, labReportId: labReport.id },
    jobId: job.id,
    stepName: "generate_patient_explanation",
    workerId: workerIdValue
  });
  addAiAudit(store, "patient_explanation_started", workerIdValue, "lab_report", labReport.id, {
    biomarkerCount: biomarkers.length
  });

  let explanation: PatientExplanationOutput;
  let providerName = "unconfigured";
  try {
    const provider = getAiProvider();
    providerName = provider.name;
    explanation = await provider.generatePatientExplanation({
      biomarkers,
      labReportId: labReport.id,
      userId: labReport.userId
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "AI explanation provider is not configured.";
    recordAiModelRun(store, {
      errorCode: "ai_configuration_required",
      errorMessage: message,
      input: { biomarkerIds: biomarkers.map((marker) => marker.id), labReportId: labReport.id },
      job,
      modelName: process.env.OPENAI_MODEL_EXPLANATION || providerName,
      output: null,
      promptVersion: patientExplanationPromptVersion(),
      provider: providerName,
      safetyFilterStatus: "blocked",
      schemaVersion: PATIENT_EXPLANATION_SCHEMA_VERSION,
      status: "failed",
      taskType: "patient_explanation",
      workerId: workerIdValue
    });
    addAiAudit(store, "ai_configuration_required", workerIdValue, "lab_report", labReport.id, {});
    await failAndBlockWorkflowJob(store, job.id, "generate_patient_explanation", "ai_configuration_required", "AI patient explanation is not configured.");
    return { job, processed: true, reason: "ai_configuration_required" };
  }

  if (!explanation.disclaimer) {
    explanation.disclaimer = requiredDisclaimer();
  }

  const schemaValidation = validatePatientExplanationSchema(explanation);
  const safety = runMedicalSafetyRules({ biomarkers, explanation, labReport });
  const safetyFilterStatus = safety.unsafeLanguageBlocked || !schemaValidation.ok ? "blocked" : "passed";
  const modelRun = recordAiModelRun(store, {
    errorCode: schemaValidation.ok ? null : "ai_schema_validation_failed",
    errorMessage: schemaValidation.ok ? null : schemaValidation.errors.join("; "),
    input: { biomarkerIds: biomarkers.map((marker) => marker.id), labReportId: labReport.id },
    job,
    modelName: process.env.OPENAI_MODEL_EXPLANATION || providerName,
    output: explanation,
    promptVersion: patientExplanationPromptVersion(),
    provider: providerName,
    safetyFilterStatus,
    schemaVersion: PATIENT_EXPLANATION_SCHEMA_VERSION,
    status: schemaValidation.ok ? "succeeded" : "failed",
    taskType: "patient_explanation",
    workerId: workerIdValue
  });

  const insight = createHealthInsightFromPatientExplanation({
    explanation,
    labReport,
    modelRunId: modelRun.id,
    reportFileId: job.reportFileId,
    requiresDoctorReview: safety.doctorReviewRequired || !schemaValidation.ok || Boolean(job.metadata.doctorReviewRequired),
    requiresAdminReview: safety.adminReviewRequired || Boolean(job.metadata.adminReviewRequired),
    safety,
    timestamp: new Date().toISOString()
  });
  store.healthInsights.push(insight);

  if (!schemaValidation.ok || safety.unsafeLanguageBlocked) {
    addAiAudit(store, "patient_explanation_blocked_by_safety", workerIdValue, "health_insight", insight.id, {
      reasonCount: safety.reasons.length,
      schemaErrorCount: schemaValidation.errors.length
    });
  }

  await workflow.markStepSucceeded({
    jobId: job.id,
    outputSnapshot: {
      insightId: insight.id,
      modelRunId: modelRun.id,
      safetyStatus: insight.safetyStatus,
      status: insight.status
    },
    stepName: "generate_patient_explanation"
  });
  addAiAudit(store, "patient_explanation_completed", workerIdValue, "health_insight", insight.id, {
    modelRunId: modelRun.id,
    status: insight.status
  });
  advanceJobToStep(job, "route_review", insight.status === "doctor_review_required" ? "doctor_review_required" : "insight_generated");
  return { job, processed: true, reason: "patient_explanation_generated" };
}

async function runRouteReviewStep(store: ReportStore, jobId: string, workerIdValue: string) {
  const workflow = createDatabaseWorkflowProvider(store);
  const job = mustFindJob(store, jobId);
  const labReport = mustFindLabReport(store, job.labReportId);
  const reportFile = mustFindReportFile(store, job.reportFileId);
  const insight = latestHealthInsight(store, labReport.id);
  const biomarkers = store.biomarkerResults.filter((marker) => marker.labReportId === labReport.id) as NormalizedBiomarker[];
  const hasCritical = biomarkers.some((marker) => marker.reviewRouting === "critical_review_required");
  const hasLowConfidence = biomarkers.some((marker) => marker.reviewRouting === "manual_review_required" || marker.normalizationStatus === "unmapped");

  await workflow.runJobStep({
    inputSnapshot: {
      hasCritical,
      hasLowConfidence,
      insightId: insight?.id ?? null
    },
    jobId: job.id,
    stepName: "route_review",
    workerId: workerIdValue
  });

  if (!insight) {
    await failAndBlockWorkflowJob(store, job.id, "route_review", "missing_health_insight", "Review routing requires a health insight.");
    return { job, processed: true, reason: "missing_health_insight" };
  }

  if (hasCritical || insight.doctorReviewRequired) {
    finishReviewRoutedJob(job, reportFile, labReport, "doctor_review_required", new Date().toISOString());
  } else if (hasLowConfidence) {
    finishReviewRoutedJob(job, reportFile, labReport, "low_confidence_review_required", new Date().toISOString());
  } else {
    insight.status = "ai_only_ready";
    insight.publishedAt = new Date().toISOString();
    insight.updatedAt = insight.publishedAt;
    labReport.status = "insight_generated";
    labReport.updatedAt = insight.publishedAt;
    await workflow.markJobCompleted({ jobId: job.id });
    job.currentState = "insight_generated";
  }

  await workflow.markStepSucceeded({
    jobId: job.id,
    outputSnapshot: {
      insightStatus: insight.status,
      route: job.currentState
    },
    stepName: "route_review"
  });
  return { job, processed: true, reason: "review_routed" };
}

async function failAndBlockWorkflowJob(
  store: ReportStore,
  jobId: string,
  stepName: ProcessingStepName,
  errorCode: string,
  errorMessage: string
) {
  const workflow = createDatabaseWorkflowProvider(store);
  await workflow.markStepFailed({
    errorCode,
    errorMessage,
    jobId,
    retryable: false,
    stepName
  });
  await workflow.markJobBlocked({
    errorCode,
    jobId,
    reason: errorMessage,
    stepName
  });
}

export async function processUploadedReport(store: ReportStore, jobId: string, bytes: Buffer) {
  const job = mustFindJob(store, jobId);
  const reportFile = mustFindReportFile(store, job.reportFileId);
  const labReport = mustFindLabReport(store, job.labReportId);
  const now = new Date().toISOString();
  const filenameClassification = classifyReport({ filename: reportFile.originalFilename });

  if (reportFile.status === "deleted" || reportFile.status === "scan_failed" || reportFile.scanStatus === "scan_failed") {
    finishFailedJob(job, reportFile, "failed", "Report file is not eligible for processing.", "scan_blocked", now);
    transitionJobState(store, job, "failed", now, { reason: "scan_blocked" }, "failed");
    return;
  }

  job.status = "running";
  job.startedAt = job.startedAt ?? now;
  job.attemptCount += 1;

  transitionJobState(store, job, "malware_scan", now, { scanner: "provider" });
  reportFile.status = "scan_pending";
  reportFile.scanStatus = "scan_pending";
  addAuditLogSync(store, {
    action: "malware_scan_started",
    actorRole: "admin",
    actorUserId: "storage-platform",
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: null,
    requestId: null,
    safeMetadata: { provider: "configured" },
    userAgent: "storage-platform"
  });
  const malwareScan = await getMalwareScannerProvider().scanFile({
    reportFileId: reportFile.id,
    mimeType: reportFile.mimeType,
    storageKey: reportFile.storageKey
  });
  const scanStatus = toReportScanStatus(malwareScan.status);
  reportFile.scanStatus = scanStatus;
  reportFile.scanCompletedAt = malwareScan.scannedAt;
  reportFile.updatedAt = malwareScan.scannedAt;

  if (scanStatus === "scan_configuration_required") {
    addAuditLogSync(store, {
      action: "malware_scan_configuration_required",
      actorRole: "admin",
      actorUserId: "storage-platform",
      entityId: reportFile.id,
      entityType: "report_file",
      ipAddress: null,
      requestId: null,
      safeMetadata: {
        details: malwareScan.details ?? {},
        provider: malwareScan.provider
      },
      userAgent: "storage-platform"
    });
    finishFailedJob(job, reportFile, "failed", "Malware scanner is not configured.", "malware_scan_configuration_required", now);
    reportFile.status = "scan_configuration_required";
    transitionJobState(store, job, "failed", now, { scanner: malwareScan.provider }, "failed");
    return;
  }

  if (scanStatus !== "scan_passed") {
    addAuditLogSync(store, {
      action: "malware_scan_failed",
      actorRole: "admin",
      actorUserId: "storage-platform",
      entityId: reportFile.id,
      entityType: "report_file",
      ipAddress: null,
      requestId: null,
      safeMetadata: {
        details: malwareScan.details ?? {},
        provider: malwareScan.provider
      },
      userAgent: "storage-platform"
    });
    finishFailedJob(job, reportFile, "failed", "Malware scan failed.", "malware_scan_failed", now);
    reportFile.status = scanStatus;
    transitionJobState(store, job, "failed", now, {
      scanner: malwareScan.provider
    }, "failed");
    return;
  }

  reportFile.status = "scan_passed";
  addAuditLogSync(store, {
    action: "malware_scan_passed",
    actorRole: "admin",
    actorUserId: "storage-platform",
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      provider: malwareScan.provider,
      signatureVersion: malwareScan.signatureVersion
    },
    userAgent: "storage-platform"
  });
  transitionJobState(store, job, "scan_passed", now, { scanner: malwareScan.provider });

  if (!filenameClassification.supported && filenameClassification.confidence >= 0.9) {
    transitionJobState(store, job, "classified", now, {
      confidence: filenameClassification.confidence,
      reportType: filenameClassification.reportType
    });
    createExtractedDocument(store, {
      error: filenameClassification.unsupportedReason,
      extractedTablesJson: null,
      extractedText: null,
      labReport,
      pageCount: null,
      parserName: localDocumentParser.parserName,
      parserVersion: localDocumentParser.parserVersion,
      status: "unsupported"
    });
    applyClassification(labReport, reportFile, filenameClassification, now);
    finishUnsupportedJob(job, reportFile, filenameClassification.unsupportedReason, now);
    transitionJobState(store, job, "unsupported", now, {
      reason: filenameClassification.unsupportedReason
    });
    return;
  }

  transitionJobState(store, job, "text_extraction_pending", now, {
    parserName: localDocumentParser.parserName
  });

  try {
    const parsed = await localDocumentParser.parse({
      bytes,
      filename: reportFile.originalFilename,
      mimeType: reportFile.mimeType
    });

    createExtractedDocument(store, {
      ...parsed,
      extractedTablesJson: parsed.extractedTablesJson,
      labReport,
      status: parsed.status
    });

    if (parsed.status === "ocr_required") {
      labReport.parserVersion = parsed.parserVersion;
      labReport.status = "ocr_required";
      labReport.updatedAt = now;
      finishFailedJob(job, reportFile, "ocr_required", parsed.error, "ocr_required", now);
      transitionJobState(store, job, "ocr_required", now, {
        parserName: parsed.parserName,
        reason: parsed.error
      });
      return;
    }

    if (parsed.status !== "text_extracted" || !parsed.extractedText) {
      throw new Error(parsed.error ?? "Document extraction failed.");
    }

    labReport.parserVersion = parsed.parserVersion;
    labReport.rawExtractedText = parsed.extractedText;
    labReport.rawExtractedTables = parsed.extractedTablesJson;
    labReport.status = "text_extracted";
    labReport.updatedAt = now;
    transitionJobState(store, job, "text_extracted", now, {
      pageCount: parsed.pageCount,
      parserName: parsed.parserName,
      tableCount: parsed.extractedTablesJson.length
    });

    const extractedClassification = classifyReport({
      extractedText: parsed.extractedText,
      filename: reportFile.originalFilename
    });
    transitionJobState(store, job, "classified", now, {
      confidence: extractedClassification.confidence,
      reportType: extractedClassification.reportType
    });
    applyClassification(labReport, reportFile, extractedClassification, now);

    if (!extractedClassification.supported) {
      finishUnsupportedJob(job, reportFile, extractedClassification.unsupportedReason, now);
      transitionJobState(store, job, "unsupported", now, {
        reason: extractedClassification.unsupportedReason
      });
      return;
    }

    runBiomarkerAndInsightPipeline(store, job, labReport, reportFile, parsed.extractedText, parsed.extractedTablesJson, now);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Document extraction failed.";
    createExtractedDocument(store, {
      error: message,
      extractedTablesJson: null,
      extractedText: null,
      labReport,
      pageCount: null,
      parserName: localDocumentParser.parserName,
      parserVersion: localDocumentParser.parserVersion,
      status: "extraction_failed"
    });
    labReport.status = "failed";
    labReport.updatedAt = now;
    finishFailedJob(job, reportFile, "extraction_failed", message, "extraction_failed", now);
    transitionJobState(store, job, "extraction_failed", now, { reason: message }, "failed");
  }
}

export function getPrivateStoragePathForTests() {
  return STORAGE_DIR;
}

export async function resetReportStoreForTests() {
  await mkdir(STORAGE_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(emptyStore, null, 2));
}

async function ensureStore() {
  await mkdir(STORAGE_DIR, { recursive: true });

  try {
    await readFile(STORE_PATH, "utf8");
  } catch {
    await writeFile(STORE_PATH, JSON.stringify(emptyStore, null, 2));
  }
}

function normalizeStore(store: Partial<ReportStore>): ReportStore {
  return {
    auditLogs: store.auditLogs ?? [],
    biomarkerAliases: store.biomarkerAliases ?? BIOMARKER_ALIASES_V1,
    biomarkerCatalog: store.biomarkerCatalog ?? BIOMARKER_CATALOG_V1,
    biomarkerResults: store.biomarkerResults ?? [],
    doctorReviews: store.doctorReviews ?? [],
    extractedDocuments: (store.extractedDocuments ?? []).map((document) => ({
      ...document,
      confidenceScore: document.confidenceScore ?? null,
      errorCode: document.errorCode ?? null,
      ocrProvider: document.ocrProvider ?? null,
      pageMetadataJson: document.pageMetadataJson ?? {},
      parserProvider: document.parserProvider ?? document.parserName,
      updatedAt: document.updatedAt ?? document.createdAt
    })),
    healthInsights: store.healthInsights ?? [],
    healthRiskFlags: store.healthRiskFlags ?? [],
    labReports: store.labReports ?? [],
    modelRuns: store.modelRuns ?? [],
    reminders: store.reminders ?? [],
    feedbackEvents: store.feedbackEvents ?? [],
    payments: store.payments ?? [],
    analyticsEvents: store.analyticsEvents ?? [],
    notifications: store.notifications ?? [],
    dataRightsRequests: store.dataRightsRequests ?? [],
    betaInvites: store.betaInvites ?? [],
    processingJobs: (store.processingJobs ?? []).map((job) => ({
      ...job,
      currentStep: job.currentStep ?? "malware_scan",
      lockedBy: job.lockedBy ?? null,
      lockedUntil: job.lockedUntil ?? null,
      nextRunAt: job.nextRunAt ?? null,
      priority: job.priority ?? 0,
      processingVersion: job.processingVersion ?? stringMetadata(job.metadata, "processingVersion") ?? PROCESSING_VERSION
    })),
    processingJobSteps: (store.processingJobSteps ?? []).map((step) => ({
      ...step,
      attemptCount: step.attemptCount ?? step.attemptNumber ?? 0,
      inputSnapshot: step.inputSnapshot ?? null,
      lockedBy: step.lockedBy ?? null,
      lockedUntil: step.lockedUntil ?? null,
      maxAttempts: step.maxAttempts ?? 3,
      outputSnapshot: step.outputSnapshot ?? null,
      stepName: step.stepName ?? inferStepName(step.stepKey)
    })),
    reportFiles: (store.reportFiles ?? []).map((reportFile) => ({
      ...reportFile,
      deletedAt: reportFile.deletedAt ?? null
    }))
  };
}

function runBiomarkerAndInsightPipeline(
  store: ReportStore,
  job: ProcessingJobRecord,
  labReport: LabReportRecord,
  reportFile: ReportFileRecord,
  extractedText: string,
  extractedTablesJson: string[][][],
  timestamp: string
) {
  transitionJobState(store, job, "biomarker_extraction_pending", timestamp, {
    provider: getStructuredExtractionProvider()
  });

  const extractionOutput = extractBiomarkersFromDocument({
    extractedTablesJson,
    extractedText,
    reportId: labReport.id,
    reportType: labReport.reportType as ReportType
  });
  const validation = validateBiomarkerExtractionOutput(extractionOutput);
  const extractionRun = logModelRun(store, {
    input: {
      extractedTextHash: hashJson(extractedText),
      labReportId: labReport.id,
      provider: getStructuredExtractionProvider()
    },
    job,
    labReport,
    modelName: getStructuredExtractionProvider(),
    output: extractionOutput,
    promptVersion: "extract_biomarkers_v1",
    safetyFilterStatus: "not_applicable",
    schemaVersion: "biomarker_extraction_schema_v1",
    taskType: "extract_biomarkers"
  });

  if (!validation.ok) {
    finishFailedJob(
      job,
      reportFile,
      "extraction_failed",
      validation.errors.join("; "),
      "biomarker_schema_validation_failed",
      timestamp
    );
    transitionJobState(store, job, "extraction_failed", timestamp, {
      errors: validation.errors
    }, "failed");
    return;
  }

  const biomarkerResults = extractionOutput.biomarkers.map((item) =>
    toBiomarkerResult({
      item,
      labName: null,
      labReportId: labReport.id,
      now: timestamp,
      reportDate: null,
      userId: labReport.userId
    })
  );
  store.biomarkerResults.push(...biomarkerResults);
  addAuditLogSync(store, {
    action: "biomarker_extraction_completed",
    actorRole: "admin",
    actorUserId: "phase3b-worker",
    entityId: labReport.id,
    entityType: "lab_report",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      count: biomarkerResults.length,
      modelRunId: extractionRun.id,
      schemaValid: true
    },
    userAgent: "phase3b-worker"
  });
  transitionJobState(store, job, "biomarker_extracted", timestamp, {
    count: biomarkerResults.length
  });
  transitionJobState(store, job, "normalized", timestamp, {
    normalizedCount: biomarkerResults.filter((marker) => marker.canonicalBiomarkerKey).length
  });

  const criticalResults = biomarkerResults.filter((marker) => marker.reviewRouting === "critical_review_required");
  const lowConfidenceResults = biomarkerResults.filter((marker) => marker.reviewRouting === "manual_review_required");
  createRiskFlags(store, labReport, criticalResults, lowConfidenceResults, timestamp);
  transitionJobState(store, job, "validated", timestamp, {
    criticalCount: criticalResults.length,
    lowConfidenceCount: lowConfidenceResults.length
  });

  transitionJobState(store, job, "insight_generation_pending", timestamp, {
    promptVersion: "explain_report_ai_only_v1"
  });
  const requiresDoctorReview = criticalResults.length > 0 || lowConfidenceResults.length > 0;
  const explanation = generateSafeExplanation({
    biomarkers: biomarkerResults,
    requiresDoctorReview
  });
  const explanationValidation = validateExplanationOutput(explanation);
  const safetyResult = runUnsafeLanguageFilter(JSON.stringify(explanation));
  const explanationRun = logModelRun(store, {
    input: {
      biomarkerResultIds: biomarkerResults.map((marker) => marker.id),
      labReportId: labReport.id
    },
    job,
    labReport,
    modelName: "local_safe_explanation_v1",
    output: explanation,
    promptVersion: "explain_report_ai_only_v1",
    safetyFilterStatus: safetyResult.blocked || !explanationValidation.ok ? "blocked" : "passed",
    schemaVersion: "ai_explanation_schema_v1",
    taskType: "explain_report_ai_only"
  });

  if (safetyResult.blocked || !explanationValidation.ok) {
    store.healthRiskFlags.push({
      biomarkerResultId: null,
      createdAt: timestamp,
      flagType: "unsafe_language",
      id: randomUUID(),
      labReportId: labReport.id,
      reason: [...safetyResult.matchedPhrases, ...explanationValidation.errors].join("; "),
      severity: "review",
      userId: labReport.userId
    });
  }

  const insight = createHealthInsight({
    biomarkerResults,
    explanation,
    labReport,
    modelRunId: explanationRun.id,
    requiresDoctorReview: requiresDoctorReview || safetyResult.blocked || !explanationValidation.ok,
    safetyFlags: safetyResult.matchedPhrases,
    timestamp
  });
  store.healthInsights.push(insight);
  addAuditLogSync(store, {
    action: "health_insight_generated",
    actorRole: "admin",
    actorUserId: "phase3b-worker",
    entityId: insight.id,
    entityType: "health_insight",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      modelRunId: explanationRun.id,
      status: insight.status
    },
    userAgent: "phase3b-worker"
  });
  transitionJobState(store, job, "insight_generated", timestamp, {
    insightStatus: insight.status
  });

  if (criticalResults.length > 0) {
    finishReviewRoutedJob(job, reportFile, labReport, "critical_review_required", timestamp);
    transitionJobState(store, job, "critical_review_required", timestamp, {
      criticalCount: criticalResults.length
    });
    return;
  }

  if (lowConfidenceResults.length > 0) {
    finishReviewRoutedJob(job, reportFile, labReport, "low_confidence_review_required", timestamp);
    transitionJobState(store, job, "low_confidence_review_required", timestamp, {
      lowConfidenceCount: lowConfidenceResults.length
    });
    return;
  }

  if (insight.status === "doctor_review_required") {
    finishReviewRoutedJob(job, reportFile, labReport, "doctor_review_required", timestamp);
    transitionJobState(store, job, "doctor_review_required", timestamp, {
      reason: "safety_filter_or_schema_review"
    });
    return;
  }

  job.status = "completed";
  job.currentState = "insight_generated";
  job.completedAt = timestamp;
  job.failedAt = null;
  job.errorCode = null;
  job.errorMessage = null;
  job.updatedAt = timestamp;
  labReport.status = "insight_generated";
  labReport.updatedAt = timestamp;
  reportFile.status = "processing";
  reportFile.updatedAt = timestamp;
}

function createRiskFlags(
  store: ReportStore,
  labReport: LabReportRecord,
  criticalResults: BiomarkerResultRecord[],
  lowConfidenceResults: BiomarkerResultRecord[],
  timestamp: string
) {
  for (const marker of criticalResults) {
    store.healthRiskFlags.push({
      biomarkerResultId: marker.id,
      createdAt: timestamp,
      flagType: "critical_value",
      id: randomUUID(),
      labReportId: labReport.id,
      reason: `${marker.canonicalName ?? marker.rawName} matched placeholder critical routing rules.`,
      severity: "critical",
      userId: labReport.userId
    });
  }

  for (const marker of lowConfidenceResults) {
    store.healthRiskFlags.push({
      biomarkerResultId: marker.id,
      createdAt: timestamp,
      flagType: "low_confidence",
      id: randomUUID(),
      labReportId: labReport.id,
      reason: `${marker.canonicalName ?? marker.rawName} confidence ${marker.confidenceScore} requires manual review.`,
      severity: "review",
      userId: labReport.userId
    });
  }
}

function createHealthInsight(input: {
  biomarkerResults: BiomarkerResultRecord[];
  explanation: ReturnType<typeof generateSafeExplanation>;
  labReport: LabReportRecord;
  modelRunId: string;
  requiresDoctorReview: boolean;
  safetyFlags: string[];
  timestamp: string;
}): HealthInsightRecord {
  return {
    createdAt: input.timestamp,
    disclaimer: input.explanation.disclaimer,
    id: randomUUID(),
    labReportId: input.labReport.id,
    markersNeedingAttention: input.explanation.markers_needing_attention.map((marker) => ({
      biomarkerResultId: marker.biomarker_result_id,
      explanation: marker.explanation,
      title: marker.title,
      valueLabel: marker.value_label
    })),
    modelRunId: input.modelRunId,
    normalMarkers: input.explanation.normal_markers.map((marker) => ({
      biomarkerResultId: marker.biomarker_result_id,
      title: marker.title,
      valueLabel: marker.value_label
    })),
    possibleRelevance: input.explanation.possible_relevance,
    questionsToAskDoctor: input.explanation.questions_to_ask_doctor,
    retestSuggestion: input.explanation.retest_suggestion,
    safetyFlags: input.safetyFlags,
    sourceBiomarkerIds: input.explanation.source_biomarker_ids,
    status: input.requiresDoctorReview ? "doctor_review_required" : "ai_only_ready",
    summary: input.explanation.summary,
    doctorEditedSummary: null,
    doctorReviewId: null,
    doctorReviewedAt: null,
    doctorReviewedBy: null,
    updatedAt: input.timestamp,
    userId: input.labReport.userId
  };
}

function createHealthInsightFromPatientExplanation(input: {
  explanation: PatientExplanationOutput;
  labReport: LabReportRecord;
  modelRunId: string;
  reportFileId: string;
  requiresAdminReview: boolean;
  requiresDoctorReview: boolean;
  safety: ReturnType<typeof runMedicalSafetyRules>;
  timestamp: string;
}): HealthInsightRecord {
  const safetyBlocked = input.safety.unsafeLanguageBlocked;
  return {
    createdAt: input.timestamp,
    disclaimer: input.explanation.disclaimer,
    doctorEditedSummary: null,
    doctorReviewId: null,
    doctorReviewReason: input.explanation.doctor_review_reason ?? (input.safety.reasons.join("; ") || null),
    doctorReviewRequired: input.requiresDoctorReview,
    doctorReviewedAt: null,
    doctorReviewedBy: null,
    explanationJson: input.explanation as unknown as Record<string, unknown>,
    id: randomUUID(),
    insightType: "patient_explanation",
    labReportId: input.labReport.id,
    markersNeedingAttention: input.explanation.markers_needing_attention.map((marker) => ({
      biomarkerResultId: marker.biomarker_result_id,
      explanation: marker.explanation,
      title: marker.display_name,
      valueLabel: marker.value_display
    })),
    modelRunId: input.modelRunId,
    normalMarkers: input.explanation.normal_markers.map((marker) => ({
      biomarkerResultId: marker.biomarker_result_id,
      title: marker.display_name,
      valueLabel: marker.value_display
    })),
    possibleRelevance: input.explanation.possible_relevance,
    publishedAt: null,
    questionsToAskDoctor: input.explanation.questions_to_ask_doctor,
    reportFileId: input.reportFileId,
    retestSuggestion: input.explanation.retest_suggestion ?? null,
    safetyFlags: input.safety.reasons,
    safetyStatus: safetyBlocked ? "blocked" : input.requiresAdminReview || input.requiresDoctorReview ? "review_required" : "passed",
    sourceBiomarkerIds: input.explanation.source_biomarker_ids,
    status: input.requiresDoctorReview || input.requiresAdminReview || safetyBlocked ? "doctor_review_required" : "ai_only_ready",
    summary: input.explanation.summary,
    updatedAt: input.timestamp,
    userId: input.labReport.userId
  };
}

function recordAiModelRun(
  store: ReportStore,
  input: Parameters<typeof createModelRunRecord>[0] & { workerId: string }
) {
  const run = createModelRunRecord(input);
  store.modelRuns.push(run);
  addAiAudit(store, input.status === "failed" ? "model_run_failed" : "model_run_created", input.workerId, "model_run", run.id, {
    errorCode: run.errorCode ?? null,
    promptVersion: run.promptVersion,
    provider: run.provider,
    status: run.status,
    taskType: run.taskType
  });
  addAiAudit(store, "model_run_logged", input.workerId, "model_run", run.id, {
    promptVersion: run.promptVersion,
    provider: run.provider,
    status: run.status,
    taskType: run.taskType
  });
  return run;
}

function latestModelRun(store: ReportStore, processingJobId: string, taskType: ModelRunRecord["taskType"]) {
  return store.modelRuns
    .filter((run) => run.processingJobId === processingJobId && run.taskType === taskType && run.status !== "failed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function latestHealthInsight(store: ReportStore, labReportId: string) {
  return store.healthInsights
    .filter((insight) => insight.labReportId === labReportId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function aiInputSummary(job: ProcessingJobRecord, extractedDocument: ExtractedDocumentRecord) {
  return {
    extractedDocumentId: extractedDocument.id,
    extractedTextHash: hashJson(extractedDocument.extractedText ?? ""),
    labReportId: job.labReportId,
    reportFileId: job.reportFileId,
    tableCount: extractedDocument.extractedTablesJson?.length ?? 0
  };
}

function addAiAudit(
  store: ReportStore,
  action: AuditLogRecord["action"],
  actorUserId: string,
  entityType: AuditLogRecord["entityType"],
  entityId: string,
  safeMetadata: Record<string, unknown>
) {
  addAuditLogSync(store, {
    action,
    actorRole: "admin",
    actorUserId,
    entityId,
    entityType,
    ipAddress: null,
    requestId: null,
    safeMetadata,
    userAgent: actorUserId
  });
}

function safetyCriticalMarkers(biomarkers: NormalizedBiomarker[]) {
  return biomarkers.filter((marker) => marker.reviewRouting === "critical_review_required");
}

function safetyLowConfidenceMarkers(biomarkers: NormalizedBiomarker[]) {
  return biomarkers.filter((marker) => marker.reviewRouting === "manual_review_required");
}

function logModelRun(
  store: ReportStore,
  input: {
    input: Record<string, unknown>;
    job: ProcessingJobRecord;
    labReport: LabReportRecord;
    modelName: string;
    output: Record<string, unknown>;
    promptVersion: string;
    safetyFilterStatus: ModelRunRecord["safetyFilterStatus"];
    schemaVersion: string;
    taskType: ModelRunRecord["taskType"];
  }
) {
  const now = new Date().toISOString();
  const run: ModelRunRecord = {
    costEstimate: 0,
    costEstimateMinorUnits: 0,
    createdAt: now,
    errorCode: null,
    errorMessage: null,
    extractedDocumentId: null,
    id: randomUUID(),
    inputHash: hashJson(input.input),
    labReportId: input.labReport.id,
    latencyMs: 0,
    modelName: input.modelName,
    outputHash: hashJson(input.output),
    outputJson: input.output,
    processingJobId: input.job.id,
    promptVersion: input.promptVersion,
    provider: input.modelName,
    reportFileId: input.job.reportFileId,
    safetyFilterStatus: input.safetyFilterStatus,
    schemaVersion: input.schemaVersion,
    status: "succeeded",
    taskType: input.taskType,
    tokenCount: null,
    tokenInputCount: null,
    tokenOutputCount: null,
    userId: input.labReport.userId
  };
  store.modelRuns.push(run);
  addAuditLogSync(store, {
    action: "model_run_logged",
    actorRole: "admin",
    actorUserId: "phase3b-worker",
    entityId: run.id,
    entityType: "model_run",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      modelName: run.modelName,
      promptVersion: run.promptVersion,
      safetyFilterStatus: run.safetyFilterStatus,
      taskType: run.taskType
    },
    userAgent: "phase3b-worker"
  });
  return run;
}

function finishReviewRoutedJob(
  job: ProcessingJobRecord,
  reportFile: ReportFileRecord,
  labReport: LabReportRecord,
  state: "critical_review_required" | "low_confidence_review_required" | "doctor_review_required",
  timestamp: string
) {
  job.status = "completed";
  job.currentState = state;
  job.completedAt = timestamp;
  job.failedAt = null;
  job.errorCode = state;
  job.errorMessage = "Report requires review before relying on an AI-only explanation.";
  job.updatedAt = timestamp;
  labReport.status = "doctor_review_required";
  labReport.updatedAt = timestamp;
  reportFile.status = "processing";
  reportFile.updatedAt = timestamp;
}

function getStructuredExtractionProvider() {
  return process.env.OPENAI_API_KEY ? "openai_structured_outputs_configured" : "local_schema_valid_mock_v1";
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function makeInviteCode() {
  return `LYF9-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function betaAccessMode() {
  const configured = process.env.LYF9_BETA_ACCESS_MODE;
  if (configured === "invite_code" || configured === "allowlist" || configured === "open") {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? "invite_code" : "open";
}

function allowlistEmails() {
  return (process.env.LYF9_BETA_ALLOWLIST_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function saveStore(store: ReportStore) {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

async function writePrivateFile(storageKey: string, bytes: Buffer) {
  const destination = path.join(STORAGE_DIR, storageKey);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

async function addAuditLog(
  store: ReportStore,
  input: Omit<AuditLogRecord, "createdAt" | "id">
) {
  addAuditLogSync(store, input);
}

function addAuditLogSync(
  store: ReportStore,
  input: Omit<AuditLogRecord, "createdAt" | "id">
) {
  store.auditLogs.push({
    ...input,
    createdAt: new Date().toISOString(),
    id: randomUUID()
  });
}

function addJobStep(
  store: ReportStore,
  processingJobId: string,
  stepKey: string,
  state: ProcessingJobState,
  status: "completed" | "failed",
  timestamp: string,
  safeOutputSummary: Record<string, unknown>
) {
  const step: ProcessingJobStepRecord = {
    attemptCount: 1,
    attemptNumber: 1,
    completedAt: status === "completed" ? timestamp : null,
    createdAt: timestamp,
    durationMs: 0,
    errorCode: null,
    errorMessage: null,
    failedAt: status === "failed" ? timestamp : null,
    id: randomUUID(),
    inputSnapshot: null,
    lockedBy: null,
    lockedUntil: null,
    maxAttempts: 3,
    outputSnapshot: safeOutputSummary,
    processingJobId,
    safeInputSummary: {},
    safeOutputSummary,
    startedAt: timestamp,
    state,
    status,
    stepKey,
    stepName: inferStepName(stepKey),
    updatedAt: timestamp
  };
  store.processingJobSteps.push(step);
}

function transitionJobState(
  store: ReportStore,
  job: ProcessingJobRecord,
  state: ProcessingJobState,
  timestamp: string,
  safeOutputSummary: Record<string, unknown>,
  status: "completed" | "failed" = "completed"
) {
  job.currentState = state;
  job.updatedAt = timestamp;
  addJobStep(store, job.id, state, state, status, timestamp, safeOutputSummary);
  addAuditLogSync(store, {
    action: "job_state_change",
    actorRole: "admin",
    actorUserId: "phase3a-worker",
    entityId: job.id,
    entityType: "processing_job",
    ipAddress: null,
    requestId: null,
    safeMetadata: { state },
    userAgent: "phase3a-worker"
  });
}

function createExtractedDocument(
  store: ReportStore,
  input: Partial<Omit<ExtractedDocumentRecord, "createdAt" | "extractionVersion" | "id" | "reportFileId" | "reportId" | "updatedAt">> & {
    labReport: LabReportRecord;
  }
) {
  const now = new Date().toISOString();
  const record: ExtractedDocumentRecord = {
    confidenceScore: input.confidenceScore ?? null,
    createdAt: now,
    error: input.error ?? null,
    errorCode: input.errorCode ?? null,
    extractedTablesJson: input.extractedTablesJson ?? null,
    extractedText: input.extractedText ?? null,
    extractionVersion: 1,
    id: randomUUID(),
    ocrProvider: input.ocrProvider ?? null,
    pageCount: input.pageCount ?? null,
    pageMetadataJson: input.pageMetadataJson ?? {},
    parserName: input.parserName ?? input.parserProvider ?? "unknown_parser",
    parserProvider: input.parserProvider ?? input.parserName ?? "unknown_parser",
    parserVersion: input.parserVersion ?? "unknown",
    reportFileId: input.labReport.reportFileId,
    reportId: input.labReport.id,
    status: input.status ?? "extraction_failed",
    updatedAt: now
  };
  store.extractedDocuments.push(record);
  addAuditLogSync(store, {
    action: "document_extraction_completed",
    actorRole: "admin",
    actorUserId: "phase3a-worker",
    entityId: input.labReport.id,
    entityType: "lab_report",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      pageCount: input.pageCount,
      parserName: input.parserName,
      parserVersion: input.parserVersion,
      status: input.status,
      tableCount: input.extractedTablesJson?.length ?? 0
    },
    userAgent: "phase3a-worker"
  });
  return record;
}

function createExtractedDocumentFromResult(
  store: ReportStore,
  labReport: LabReportRecord,
  result: ExtractedDocumentResult,
  ocrProvider: string | null = null
) {
  return createExtractedDocument(store, {
    confidenceScore: result.confidenceScore ?? null,
    error: result.errorMessage ?? null,
    errorCode: result.errorCode ?? null,
    extractedTablesJson: normalizeTables(result.extractedTablesJson),
    extractedText: result.extractedText ?? null,
    labReport,
    ocrProvider,
    pageCount: result.pageCount ?? null,
    pageMetadataJson: normalizeObject(result.pageMetadataJson),
    parserName: result.provider,
    parserProvider: result.provider,
    parserVersion: result.parserVersion,
    status: resultStatusToRecordStatus(result.status, Boolean(ocrProvider))
  });
}

function resultStatusToRecordStatus(status: ExtractedDocumentResult["status"], fromOcr: boolean): ExtractedDocumentRecord["status"] {
  if (status === "success") return fromOcr ? "ocr_completed" : "text_extracted";
  if (status === "low_text_confidence") return "low_text_confidence";
  if (status === "ocr_required") return "ocr_required";
  if (status === "unsupported") return "unsupported";
  return "extraction_failed";
}

function normalizeTables(value: unknown): string[][][] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value as string[][][];
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function extractionOutputSnapshot(result: ExtractedDocumentResult, extractedDocumentId: string) {
  return {
    confidenceScore: result.confidenceScore ?? null,
    errorCode: result.errorCode ?? null,
    extractedDocumentId,
    pageCount: result.pageCount ?? null,
    provider: result.provider,
    status: result.status,
    tableCount: Array.isArray(result.extractedTablesJson) ? result.extractedTablesJson.length : 0
  };
}

function addDocumentAudit(
  store: ReportStore,
  action: AuditLogRecord["action"],
  actorUserId: string,
  reportFile: ReportFileRecord,
  result: ExtractedDocumentResult,
  extractedDocumentId: string
) {
  addAuditLogSync(store, {
    action,
    actorRole: "admin",
    actorUserId,
    entityId: reportFile.id,
    entityType: "report_file",
    ipAddress: null,
    requestId: null,
    safeMetadata: extractionOutputSnapshot(result, extractedDocumentId),
    userAgent: actorUserId
  });
}

function latestExtractedText(store: ReportStore, labReportId: string) {
  return store.extractedDocuments
    .filter((document) => document.reportId === labReportId && Boolean(document.extractedText))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function advanceJobToStep(job: ProcessingJobRecord, stepName: ProcessingStepName, state: ProcessingJobState) {
  const now = new Date().toISOString();
  job.currentStep = stepName;
  job.currentState = state;
  job.status = "queued";
  job.lockedBy = null;
  job.lockedUntil = null;
  job.nextRunAt = null;
  job.workerId = null;
  job.updatedAt = now;
}

function unsupportedReportCopy(reason: string) {
  return `This report type is not supported for automated interpretation yet. You can still store it in your Lyf9 AI health timeline, but Lyf9 AI will not generate AI-only medical insights for it. Please consult a qualified doctor for interpretation. Reason: ${reason}`;
}

function applyClassification(
  labReport: LabReportRecord,
  reportFile: ReportFileRecord,
  classification: ReturnType<typeof classifyReport>,
  timestamp: string
) {
  labReport.classificationConfidence = classification.confidence;
  labReport.reportType = classification.reportType;
  labReport.supportedPanels = classification.supportedPanels;
  labReport.unsupportedSections = classification.unsupportedSections;
  labReport.status = classification.supported ? labReport.status : "unsupported";
  labReport.updatedAt = timestamp;
  reportFile.unsupportedReason = classification.unsupportedReason;
  reportFile.updatedAt = timestamp;
}

function finishUnsupportedJob(
  job: ProcessingJobRecord,
  reportFile: ReportFileRecord,
  reason: string | null,
  timestamp: string
) {
  job.status = "completed";
  job.currentState = "unsupported";
  job.completedAt = timestamp;
  job.failedAt = null;
  job.errorCode = "unsupported_report_type";
  job.errorMessage = reason ?? "Unsupported report type.";
  job.updatedAt = timestamp;
  reportFile.status = "unsupported";
  reportFile.unsupportedReason = reason;
  reportFile.updatedAt = timestamp;
}

function finishFailedJob(
  job: ProcessingJobRecord,
  reportFile: ReportFileRecord,
  state: "ocr_required" | "extraction_failed" | "failed",
  message: string | null,
  errorCode: string,
  timestamp: string
) {
  job.status = "failed";
  job.currentState = state;
  job.completedAt = null;
  job.failedAt = timestamp;
  job.errorCode = errorCode;
  job.errorMessage = message;
  job.updatedAt = timestamp;
  reportFile.status = state;
  reportFile.updatedAt = timestamp;
}

function mustFindReportFile(store: ReportStore, id: string) {
  const reportFile = store.reportFiles.find((candidate) => candidate.id === id);
  if (!reportFile) {
    throw new Error("report_not_found");
  }
  return reportFile;
}

function roleCanAccessStorage(role: UserRole) {
  return role === "admin" || role === "superadmin";
}

function stringMetadata(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function inferStepName(stepKey: string): ProcessingStepName {
  return PIPELINE_STEPS.includes(stepKey as ProcessingStepName)
    ? (stepKey as ProcessingStepName)
    : "malware_scan";
}

function workerId() {
  return process.env.WORKER_ID ?? "local-worker";
}

function workerLeaseSeconds() {
  const configured = Number(process.env.WORKER_LEASE_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? configured : 300;
}

function isLocalLikeWorkflowEnv() {
  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  return appEnv === "local" || appEnv === "development" || appEnv === "test";
}

function isDoctorAssignedToReport(store: ReportStore, doctorUserId: string, reportFileId: string) {
  return store.doctorReviews.some(
    (review) =>
      review.reportFileId === reportFileId &&
      review.assignedDoctorEmail === doctorUserId.trim().toLowerCase()
  );
}

function mustFindLabReport(store: ReportStore, id: string) {
  const labReport = store.labReports.find((candidate) => candidate.id === id);
  if (!labReport) {
    throw new Error("lab_report_not_found");
  }
  return labReport;
}

function mustFindJob(store: ReportStore, id: string) {
  const job = store.processingJobs.find((candidate) => candidate.id === id);
  if (!job) {
    throw new Error("job_not_found");
  }
  return job;
}

function mustFindBiomarkerResult(store: ReportStore, id: string) {
  const marker = store.biomarkerResults.find((candidate) => candidate.id === id);
  if (!marker) {
    throw new Error("biomarker_result_not_found");
  }
  return marker;
}

function mustFindHealthInsight(store: ReportStore, id: string) {
  const insight = store.healthInsights.find((candidate) => candidate.id === id);
  if (!insight) {
    throw new Error("health_insight_not_found");
  }
  return insight;
}

function buildAdminQueues(store: ReportStore) {
  const lowConfidenceExtraction = store.biomarkerResults.filter(
    (marker) =>
      marker.reviewRouting === "manual_review_required" ||
      marker.reviewRouting === "soft_review" ||
      marker.confidenceScore < 0.95
  );
  return {
    blockedJobs: store.processingJobs.filter((job) => job.status === "blocked"),
    criticalFlaggedReports: store.healthRiskFlags.filter((flag) => flag.flagType === "critical_value"),
    failedJobs: store.processingJobs.filter((job) => job.status === "failed"),
    failedExtraction: store.processingJobs.filter(
      (job) => job.currentState === "extraction_failed" || job.status === "failed" || job.status === "blocked"
    ),
    lowConfidenceExtraction,
    manualCorrectionNeeded: store.biomarkerResults.filter(
      (marker) =>
        !marker.isManuallyCorrected &&
        (marker.reviewRouting === "manual_review_required" ||
          marker.reviewRouting === "critical_review_required")
    ),
    ocrRequiredReports: store.extractedDocuments.filter((document) => document.status === "ocr_required"),
    unknownClassification: store.processingJobs.filter((job) => job.errorCode === "report_classification_unknown"),
    unsupportedReports: store.reportFiles.filter((report) => report.status === "unsupported")
  };
}

function buildDoctorReviewDetail(store: ReportStore, review: DoctorReviewRecord) {
  const labReport = mustFindLabReport(store, review.labReportId);
  const reportFile = mustFindReportFile(store, review.reportFileId);
  const insight = mustFindHealthInsight(store, review.healthInsightId);
  return {
    biomarkers: store.biomarkerResults.filter((marker) => marker.labReportId === review.labReportId),
    healthInsight: insight,
    labReport,
    patient: {
      displayName: reportFile.userId.split("@")[0],
      userId: reportFile.userId
    },
    questionnaireSummary: {
      goals: "Stored in the Phase 1 onboarding scaffold.",
      symptoms: "Stored in the Phase 1 onboarding scaffold."
    },
    reportFile,
    review,
    riskFlags: store.healthRiskFlags.filter((flag) => flag.labReportId === review.labReportId)
  };
}

function correctedFieldNames(marker: BiomarkerResultRecord) {
  const fields: string[] = [];
  if (marker.correctedRawName !== null) fields.push("rawName");
  if (marker.correctedCanonicalName !== null) fields.push("canonicalName");
  if (marker.correctedValueNumeric !== null) fields.push("valueNumeric");
  if (marker.correctedValueText !== null) fields.push("valueText");
  if (marker.correctedUnit !== null) fields.push("unit");
  if (marker.correctedReferenceRangeText !== null) fields.push("referenceRangeText");
  if (marker.correctedReferenceLow !== null) fields.push("referenceLow");
  if (marker.correctedReferenceHigh !== null) fields.push("referenceHigh");
  if (marker.correctedSystemFlag !== null) fields.push("systemFlag");
  if (marker.correctedSourceText !== null) fields.push("sourceText");
  if (marker.correctedConfidenceScore !== null) fields.push("confidenceScore");
  if (marker.correctedReviewRouting !== null) fields.push("reviewRouting");
  return fields;
}

function trackAnalyticsEventSync(
  store: ReportStore,
  input: {
    eventName: AnalyticsEventName;
    labReportId: string | null;
    metadata: Record<string, unknown>;
    reportFileId: string | null;
    userId: string | null;
  }
) {
  const event = {
    createdAt: new Date().toISOString(),
    eventName: input.eventName,
    id: randomUUID(),
    labReportId: input.labReportId,
    metadata: input.metadata,
    reportFileId: input.reportFileId,
    userId: input.userId
  };
  store.analyticsEvents.push(event);
  addAuditLogSync(store, {
    action: "analytics_event_tracked",
    actorRole: input.userId ? "user" : null,
    actorUserId: input.userId,
    entityId: event.id,
    entityType: "analytics_event",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      eventName: event.eventName,
      reportFileId: event.reportFileId
    },
    userAgent: null
  });
  return event;
}

function createNotificationPlaceholderSync(
  store: ReportStore,
  input: {
    eventType: NotificationEventType;
    recipientEmail: string;
    relatedDoctorReviewId: string | null;
    relatedReportFileId: string | null;
    userId: string;
  }
) {
  const copy = notificationCopy(input.eventType);
  const notification = {
    bodyPreview: copy.bodyPreview,
    createdAt: new Date().toISOString(),
    eventType: input.eventType,
    id: randomUUID(),
    provider: "email_placeholder" as const,
    recipientEmail: input.recipientEmail,
    relatedDoctorReviewId: input.relatedDoctorReviewId,
    relatedReportFileId: input.relatedReportFileId,
    status: "sent_placeholder" as const,
    subject: copy.subject,
    userId: input.userId
  };
  store.notifications.push(notification);
  addAuditLogSync(store, {
    action: "notification_placeholder_created",
    actorRole: "admin",
    actorUserId: "notification-placeholder",
    entityId: notification.id,
    entityType: "notification",
    ipAddress: null,
    requestId: null,
    safeMetadata: {
      eventType: notification.eventType,
      provider: notification.provider,
      relatedReportFileId: notification.relatedReportFileId
    },
    userAgent: "notification-placeholder"
  });
  return notification;
}

function notificationCopy(eventType: NotificationEventType) {
  if (eventType === "doctor_review_complete") {
    return {
      bodyPreview: "Your doctor-reviewed Lyf9 AI report output is ready to view.",
      subject: "Your doctor review from Lyf9 AI is ready"
    };
  }

  if (eventType === "retest_reminder") {
    return {
      bodyPreview: "You have a Lyf9 AI retest reminder scheduled.",
      subject: "Lyf9 AI retest reminder"
    };
  }

  return {
    bodyPreview: "Your Lyf9 AI report processing is complete.",
    subject: "Your Lyf9 AI report is ready"
  };
}

function createDataRightsRequestRecord(input: {
  actorRole: "admin" | "superadmin";
  actorUserId: string;
  deletedRecordCounts: Record<string, number> | null;
  exportJson: Record<string, unknown> | null;
  requestType: DataRightsRequestRecord["requestType"];
  userId: string;
}): DataRightsRequestRecord {
  return {
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    createdAt: new Date().toISOString(),
    deletedRecordCounts: input.deletedRecordCounts,
    exportJson: input.exportJson,
    id: randomUUID(),
    requestType: input.requestType,
    status: "completed",
    userId: input.userId
  };
}

function userScopedExport(store: ReportStore, userId: string) {
  const labReportIds = store.labReports
    .filter((report) => report.userId === userId)
    .map((report) => report.id);
  const reportFileIds = store.reportFiles
    .filter((report) => report.userId === userId)
    .map((report) => report.id);
  const doctorReviewIds = store.doctorReviews
    .filter((review) => review.userId === userId)
    .map((review) => review.id);

  return {
    analyticsEvents: store.analyticsEvents.filter((event) => event.userId === userId),
    biomarkerResults: store.biomarkerResults.filter((marker) => marker.userId === userId),
    doctorReviews: store.doctorReviews.filter((review) => review.userId === userId),
    feedbackEvents: store.feedbackEvents.filter((event) => event.userId === userId),
    healthInsights: store.healthInsights.filter((insight) => insight.userId === userId),
    healthRiskFlags: store.healthRiskFlags.filter((flag) => flag.userId === userId),
    labReports: store.labReports.filter((report) => report.userId === userId),
    notifications: store.notifications.filter((notification) => notification.userId === userId),
    payments: store.payments.filter((payment) => payment.userId === userId),
    reminders: store.reminders.filter((reminder) => reminder.userId === userId),
    reportFiles: store.reportFiles.filter((report) => report.userId === userId),
    supportingIds: { doctorReviewIds, labReportIds, reportFileIds }
  };
}

function deleteUserScopedRecords(store: ReportStore, userId: string) {
  const reportFileIds = new Set(
    store.reportFiles.filter((report) => report.userId === userId).map((report) => report.id)
  );
  const labReportIds = new Set(
    store.labReports.filter((report) => report.userId === userId).map((report) => report.id)
  );
  const doctorReviewIds = new Set(
    store.doctorReviews.filter((review) => review.userId === userId).map((review) => review.id)
  );
  const counts: Record<string, number> = {};

  store.reportFiles = removeAndCount(store.reportFiles, (record) => record.userId === userId, counts, "reportFiles");
  store.labReports = removeAndCount(store.labReports, (record) => record.userId === userId, counts, "labReports");
  store.extractedDocuments = removeAndCount(
    store.extractedDocuments,
    (record) => labReportIds.has(record.reportId) || reportFileIds.has(record.reportFileId),
    counts,
    "extractedDocuments"
  );
  store.biomarkerResults = removeAndCount(store.biomarkerResults, (record) => record.userId === userId, counts, "biomarkerResults");
  store.healthInsights = removeAndCount(store.healthInsights, (record) => record.userId === userId, counts, "healthInsights");
  store.healthRiskFlags = removeAndCount(store.healthRiskFlags, (record) => record.userId === userId, counts, "healthRiskFlags");
  store.reminders = removeAndCount(store.reminders, (record) => record.userId === userId, counts, "reminders");
  store.feedbackEvents = removeAndCount(store.feedbackEvents, (record) => record.userId === userId, counts, "feedbackEvents");
  store.doctorReviews = removeAndCount(store.doctorReviews, (record) => record.userId === userId, counts, "doctorReviews");
  store.payments = removeAndCount(store.payments, (record) => record.userId === userId, counts, "payments");
  store.analyticsEvents = removeAndCount(store.analyticsEvents, (record) => record.userId === userId, counts, "analyticsEvents");
  store.notifications = removeAndCount(store.notifications, (record) => record.userId === userId, counts, "notifications");
  store.processingJobs = removeAndCount(store.processingJobs, (record) => record.userId === userId, counts, "processingJobs");
  store.processingJobSteps = removeAndCount(
    store.processingJobSteps,
    (record) => store.processingJobs.every((job) => job.id !== record.processingJobId) && labReportIds.size > 0,
    counts,
    "processingJobSteps"
  );
  store.modelRuns = removeAndCount(
    store.modelRuns,
    (record) =>
      record.userId === userId ||
      (record.labReportId !== null && labReportIds.has(record.labReportId)),
    counts,
    "modelRuns"
  );
  store.dataRightsRequests = store.dataRightsRequests.filter(
    (record) => record.userId !== userId || record.requestType !== "export"
  );

  if (doctorReviewIds.size === 0) {
    counts.doctorReviews = counts.doctorReviews ?? 0;
  }

  return counts;
}

function removeAndCount<T>(
  records: T[],
  predicate: (record: T) => boolean,
  counts: Record<string, number>,
  key: string
) {
  const remaining = records.filter((record) => !predicate(record));
  counts[key] = records.length - remaining.length;
  return remaining;
}
