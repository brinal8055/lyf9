import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { createSupabaseServiceClient } from "../auth/providers/supabase-server";
import { writeSupabaseAuditLog } from "../auth/supabase-auth";
import { buildMarkerCards, reportFilesByLabReportId } from "./presentation";
import { getStorageProvider } from "./providers/storage";
import { PROCESSING_VERSION, makeIdempotencyKey } from "./validation";
import type {
  AnalyticsEventName,
  FeedbackEventRecord,
  BiomarkerResultRecord,
  LabReportRecord,
  ProcessingJobRecord,
  ProcessingStepName,
  ProcessingJobStepRecord,
  ReportFileRecord,
  UserRole
} from "./types";

const STORE_DIR = path.join(process.cwd(), "..", "..", ".local", "reports");
const STORAGE_DIR = path.join(STORE_DIR, "private");
const PROCESSING_STEP_NAMES = new Set<ProcessingStepName>([
  "malware_scan",
  "classify_report",
  "extract_document",
  "ocr_fallback",
  "extract_biomarkers",
  "normalize_biomarkers",
  "validate_biomarkers",
  "run_safety_rules",
  "generate_patient_explanation",
  "route_review",
  "publish_result"
]);

type DbRow = Record<string, unknown>;

export async function createSupabaseUploadInit(input: {
  checksumSha256: string;
  fileSizeBytes: number;
  ipAddress: string | null;
  mimeType: string;
  originalFilename: string;
  requestId: string | null;
  userAgent: string | null;
  userId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const idempotencyKey = makeIdempotencyKey(input.userId, input.checksumSha256);
  const existing = await serviceClient
    .from("processing_jobs")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    const job = toProcessingJob(existing.data);
    const reportFile = await fetchReportFile(job.reportFileId);
    const labReport = await fetchLabReport(job.labReportId);
    const storageProvider = getStorageProvider();
    const uploadTarget = await storageProvider.createUploadUrl({
      filename: reportFile.originalFilename,
      mimeType: reportFile.mimeType,
      reportFileId: reportFile.id,
      sizeBytes: reportFile.fileSizeBytes,
      userId: input.userId
    });
    await insertAuditLog({
      action: "signed_url_generation",
      actorRole: "user",
      actorUserId: input.userId,
      ipAddress: input.ipAddress,
      metadata: {
        expiresAt: uploadTarget.expiresAt,
        reused: true,
        storageProvider: storageProvider.name,
        urlType: "upload"
      },
      requestId: input.requestId,
      resourceId: reportFile.id,
      resourceType: "report_file",
      userAgent: input.userAgent
    });
    return { job, labReport, reportFile, reused: true, storageProvider: storageProvider.name, uploadTarget };
  }

  const now = new Date().toISOString();
  const reportFileId = randomUUID();
  const labReportId = randomUUID();
  const jobId = randomUUID();
  const storageProvider = getStorageProvider();
  const uploadTarget = await storageProvider.createUploadUrl({
    filename: input.originalFilename,
    mimeType: input.mimeType,
    reportFileId,
    sizeBytes: input.fileSizeBytes,
    userId: input.userId
  });

  const reportFileRow = {
    checksum: input.checksumSha256,
    checksum_sha256: input.checksumSha256,
    created_at: now,
    file_size_bytes: input.fileSizeBytes,
    id: reportFileId,
    mime_type: input.mimeType,
    original_filename: input.originalFilename,
    scan_status: "scan_pending",
    size_bytes: input.fileSizeBytes,
    status: "upload_pending",
    storage_bucket: storageProvider.name,
    storage_key: uploadTarget.storageKey,
    storage_provider: storageProvider.name,
    updated_at: now,
    upload_status: "upload_pending",
    uploaded_at: now,
    user_id: input.userId
  };
  const reportResult = await serviceClient
    .from("report_files")
    .insert(reportFileRow)
    .select("*")
    .single();

  if (reportResult.error) {
    throw new Error(reportResult.error.message);
  }

  const labReportRow = {
    created_at: now,
    id: labReportId,
    report_file_id: reportFileId,
    status: "draft",
    updated_at: now,
    user_id: input.userId
  };
  const labResult = await serviceClient
    .from("lab_reports")
    .insert(labReportRow)
    .select("*")
    .single();

  if (labResult.error) {
    throw new Error(labResult.error.message);
  }

  const jobRow = {
    created_at: now,
    current_state: "scan_pending",
    current_step: "malware_scan",
    id: jobId,
    idempotency_key: idempotencyKey,
    job_type: "report_processing",
    lab_report_id: labReportId,
    metadata: { processingVersion: PROCESSING_VERSION },
    processing_version: PROCESSING_VERSION,
    priority: 0,
    queued_at: now,
    report_file_id: reportFileId,
    status: "queued",
    updated_at: now,
    user_id: input.userId
  };
  const jobResult = await serviceClient
    .from("processing_jobs")
    .insert(jobRow)
    .select("*")
    .single();

  if (jobResult.error) {
    throw new Error(jobResult.error.message);
  }

  await insertProcessingStep({
    jobId,
    now,
    state: "malware_scan",
    status: "queued",
    stepName: "malware_scan"
  });
  await insertAuditLog({
    action: "report_upload_initialized",
    actorRole: "user",
    actorUserId: input.userId,
    ipAddress: input.ipAddress,
    metadata: {
      checksumSha256: input.checksumSha256,
      filename: input.originalFilename,
      mimeType: input.mimeType,
      size: input.fileSizeBytes
    },
    requestId: input.requestId,
    resourceId: reportFileId,
    resourceType: "report_file",
    userAgent: input.userAgent
  });
  await insertAuditLog({
    action: "signed_url_generation",
    actorRole: "user",
    actorUserId: input.userId,
    ipAddress: input.ipAddress,
    metadata: {
      expiresAt: uploadTarget.expiresAt,
      storageProvider: storageProvider.name,
      urlType: "upload"
    },
    requestId: input.requestId,
    resourceId: reportFileId,
    resourceType: "report_file",
    userAgent: input.userAgent
  });

  return {
    job: toProcessingJob(jobResult.data),
    labReport: toLabReport(labResult.data),
    reportFile: toReportFile(reportResult.data),
    reused: false,
    storageProvider: storageProvider.name,
    uploadTarget
  };
}

export async function completeSupabaseUpload(input: {
  bytes?: Buffer;
  ipAddress: string | null;
  reportFileId: string;
  requestId: string | null;
  userAgent: string | null;
  userId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const reportFile = await fetchReportFile(input.reportFileId);

  if (reportFile.userId !== input.userId) {
    throw new Error("report_not_found");
  }

  if (input.bytes) {
    const storagePath = path.join(STORAGE_DIR, reportFile.storageKey);
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, input.bytes);
  } else {
    const metadata = await getStorageProvider().getMetadata({ storageKey: reportFile.storageKey });
    if (metadata.sizeBytes !== undefined && metadata.sizeBytes > reportFile.fileSizeBytes) {
      throw new Error("uploaded_file_size_mismatch");
    }
    if (metadata.mimeType && metadata.mimeType !== reportFile.mimeType) {
      throw new Error("uploaded_file_type_mismatch");
    }
  }
  const now = new Date().toISOString();
  const update = await serviceClient
    .from("report_files")
    .update({
      status: "uploaded",
      scan_status: "scan_pending",
      updated_at: now,
      upload_status: "uploaded"
    })
    .eq("id", reportFile.id)
    .eq("user_id", input.userId)
    .select("*")
    .single();

  if (update.error) {
    throw new Error(update.error.message);
  }

  const jobResult = await serviceClient
    .from("processing_jobs")
    .select("*")
    .eq("report_file_id", reportFile.id)
    .eq("user_id", input.userId)
    .single();

  if (jobResult.error) {
    throw new Error(jobResult.error.message);
  }

  await insertAuditLog({
    action: "report_upload_completed",
    actorRole: "user",
    actorUserId: input.userId,
    ipAddress: input.ipAddress,
    metadata: { size: input.bytes?.length ?? reportFile.fileSizeBytes },
    requestId: input.requestId,
    resourceId: reportFile.id,
    resourceType: "report_file",
    userAgent: input.userAgent
  });
  await trackSupabaseAnalyticsEvent({
    eventName: "report_uploaded",
    metadata: { mimeType: reportFile.mimeType },
    reportFileId: reportFile.id,
    userId: input.userId
  });

  return {
    job: toProcessingJob(jobResult.data),
    reportFile: toReportFile(update.data)
  };
}

export async function listSupabaseUserReports(userId: string) {
  const serviceClient = createSupabaseServiceClient();
  const [filesResult, reportsResult, jobsResult, insightsResult] = await Promise.all([
    serviceClient.from("report_files").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    serviceClient.from("lab_reports").select("*").eq("user_id", userId),
    serviceClient.from("processing_jobs").select("*").eq("user_id", userId),
    serviceClient.from("health_insights").select("*").eq("user_id", userId)
  ]);

  throwIfSupabaseError(filesResult.error);
  throwIfSupabaseError(reportsResult.error);
  throwIfSupabaseError(jobsResult.error);
  throwIfSupabaseError(insightsResult.error);

  const labReports = (reportsResult.data ?? []).map(toLabReport);
  const jobs = (jobsResult.data ?? []).map(toProcessingJob);
  const insights = insightsResult.data ?? [];

  return (filesResult.data ?? []).map((row) => {
    const reportFile = toReportFile(row);
    const labReport = labReports.find((report) => report.reportFileId === reportFile.id) ?? null;
    return {
      healthInsight: labReport
        ? insights.find((insight) => stringField(insight, "lab_report_id") === labReport.id) ?? null
        : null,
      job: jobs.find((job) => job.reportFileId === reportFile.id) ?? null,
      labReport,
      reportFile
    };
  });
}

export async function getSupabaseReportDetails(userId: string, reportFileId: string) {
  const serviceClient = createSupabaseServiceClient();
  const reportFile = await fetchReportFile(reportFileId);

  if (reportFile.userId !== userId) {
    return null;
  }

  const [labResult, jobResult, markerResult, insightResult, flagResult, reminderResult, feedbackResult] =
    await Promise.all([
      serviceClient.from("lab_reports").select("*").eq("report_file_id", reportFile.id).maybeSingle(),
      serviceClient.from("processing_jobs").select("*").eq("report_file_id", reportFile.id).maybeSingle(),
      serviceClient.from("biomarker_results").select("*").eq("user_id", userId),
      serviceClient.from("health_insights").select("*").eq("user_id", userId),
      serviceClient.from("health_risk_flags").select("*").eq("user_id", userId),
      serviceClient.from("reminders").select("*").eq("user_id", userId),
      serviceClient.from("feedback_events").select("*").eq("user_id", userId)
    ]);

  throwIfSupabaseError(labResult.error);
  throwIfSupabaseError(jobResult.error);
  throwIfSupabaseError(markerResult.error);
  throwIfSupabaseError(insightResult.error);
  throwIfSupabaseError(flagResult.error);
  throwIfSupabaseError(reminderResult.error);
  throwIfSupabaseError(feedbackResult.error);

  const labReport = labResult.data ? toLabReport(labResult.data) : null;
  const biomarkerResults = labReport
    ? (markerResult.data ?? [])
        .filter((row) => stringField(row, "lab_report_id") === labReport.id)
        .map(toBiomarkerResult)
    : [];
  const healthInsight = labReport
    ? (insightResult.data ?? []).find((row) => stringField(row, "lab_report_id") === labReport.id) ?? null
    : null;
  const labReports = labReport ? [labReport] : [];
  const filesByLabReportId = reportFilesByLabReportId(labReports, [reportFile]);

  return {
    biomarkerResults,
    feedbackEvents: feedbackResult.data ?? [],
    healthInsight,
    job: jobResult.data ? toProcessingJob(jobResult.data) : null,
    labReport,
    markerCards: buildMarkerCards({
      currentMarkers: biomarkerResults,
      insight: null,
      previousMarkers: biomarkerResults,
      reportFilesByLabReportId: filesByLabReportId
    }),
    reminders: reminderResult.data ?? [],
    reportFile,
    riskFlags: flagResult.data ?? [],
    unsupportedSections: labReport?.unsupportedSections ?? []
  };
}

export async function addSupabaseSignedUrlAudit(input: {
  actorRole: "user" | "admin";
  ipAddress: string | null;
  reportFileId: string;
  requestId: string | null;
  urlType: "upload" | "download";
  userAgent: string | null;
  userId: string;
}) {
  await insertAuditLog({
    action: "signed_url_generation",
    actorRole: input.actorRole,
    actorUserId: input.userId,
    ipAddress: input.ipAddress,
    metadata: { urlType: input.urlType },
    requestId: input.requestId,
    resourceId: input.reportFileId,
    resourceType: "report_file",
    userAgent: input.userAgent
  });
}

export async function createSupabaseSignedDownloadUrl(input: {
  actorRole: UserRole;
  ipAddress: string | null;
  purpose: string;
  reportFileId: string;
  requestId: string | null;
  userAgent: string | null;
  userId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const reportFile = await fetchReportFile(input.reportFileId);
  const authorized =
    !reportFile.deletedAt &&
    reportFile.status !== "deleted" &&
    (reportFile.userId === input.userId ||
      input.actorRole === "admin" ||
      input.actorRole === "superadmin" ||
      (input.actorRole === "doctor" &&
        (await supabaseDoctorAssignedToReport(serviceClient, input.userId, reportFile.id))));

  if (!authorized) {
    await insertAuditLog({
      action: "raw_report_access_denied",
      actorRole: input.actorRole,
      actorUserId: input.userId,
      ipAddress: input.ipAddress,
      metadata: { purpose: input.purpose },
      requestId: input.requestId,
      resourceId: reportFile.id,
      resourceType: "report_file",
      userAgent: input.userAgent
    });
    throw new Error("report_not_found");
  }

  await insertAuditLog({
    action: "raw_report_access_requested",
    actorRole: input.actorRole,
    actorUserId: input.userId,
    ipAddress: input.ipAddress,
    metadata: { purpose: input.purpose, storageBucket: reportFile.storageBucket },
    requestId: input.requestId,
    resourceId: reportFile.id,
    resourceType: "report_file",
    userAgent: input.userAgent
  });
  const storageProvider = getStorageProvider();
  const downloadTarget = await storageProvider.createDownloadUrl({
    purpose: input.purpose,
    reportFileId: reportFile.id,
    requesterUserId: input.userId,
    storageKey: reportFile.storageKey
  });
  await insertAuditLog({
    action: "signed_download_url_generated",
    actorRole: input.actorRole,
    actorUserId: input.userId,
    ipAddress: input.ipAddress,
    metadata: {
      expiresAt: downloadTarget.expiresAt,
      purpose: input.purpose,
      storageProvider: storageProvider.name
    },
    requestId: input.requestId,
    resourceId: reportFile.id,
    resourceType: "report_file",
    userAgent: input.userAgent
  });

  return { ...downloadTarget, reportFile };
}

export async function deleteSupabaseReportFile(input: {
  actorRole: UserRole;
  ipAddress: string | null;
  reportFileId: string;
  requestId: string | null;
  userAgent: string | null;
  userId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const reportFile = await fetchReportFile(input.reportFileId);

  if (
    reportFile.userId !== input.userId &&
    input.actorRole !== "admin" &&
    input.actorRole !== "superadmin"
  ) {
    throw new Error("report_not_found");
  }

  const now = new Date().toISOString();
  const { data, error } = await serviceClient
    .from("report_files")
    .update({
      deleted_at: now,
      status: "deleted",
      updated_at: now,
      upload_status: "deleted"
    })
    .eq("id", reportFile.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await getStorageProvider().deleteFile({ storageKey: reportFile.storageKey });
  await insertAuditLog({
    action: "report_deleted",
    actorRole: input.actorRole,
    actorUserId: input.userId,
    ipAddress: input.ipAddress,
    metadata: { storageBucket: reportFile.storageBucket },
    requestId: input.requestId,
    resourceId: reportFile.id,
    resourceType: "report_file",
    userAgent: input.userAgent
  });

  return { reportFile: toReportFile(data) };
}

export async function readSupabasePrivateReport(input: {
  ipAddress: string | null;
  reportFileId: string;
  requestId: string | null;
  userAgent: string | null;
  userId: string;
}) {
  const reportFile = await fetchReportFile(input.reportFileId);

  if (reportFile.userId !== input.userId) {
    throw new Error("report_not_found");
  }

  await insertAuditLog({
    action: "raw_report_access",
    actorRole: "user",
    actorUserId: input.userId,
    ipAddress: input.ipAddress,
    metadata: { storageBucket: reportFile.storageBucket },
    requestId: input.requestId,
    resourceId: reportFile.id,
    resourceType: "report_file",
    userAgent: input.userAgent
  });

  return {
    bytes: await readFile(path.join(STORAGE_DIR, reportFile.storageKey)),
    reportFile
  };
}

export async function readAssignedSupabaseDoctorPrivateReport(input: {
  doctorUserId: string;
  ipAddress: string | null;
  requestId: string | null;
  reviewId: string;
  userAgent: string | null;
}) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("doctor_reviews")
    .select("*")
    .eq("id", input.reviewId)
    .eq("assigned_doctor_id", input.doctorUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("doctor_review_not_found");
  }

  const reportFile = await fetchReportFile(stringField(data, "report_file_id"));
  await insertAuditLog({
    action: "raw_report_access",
    actorRole: "doctor",
    actorUserId: input.doctorUserId,
    ipAddress: input.ipAddress,
    metadata: {
      doctorReviewId: input.reviewId,
      storageBucket: reportFile.storageBucket
    },
    requestId: input.requestId,
    resourceId: reportFile.id,
    resourceType: "report_file",
    userAgent: input.userAgent
  });

  return {
    bytes: await readFile(path.join(STORAGE_DIR, reportFile.storageKey)),
    reportFile
  };
}

export async function trackSupabaseAnalyticsEvent(input: {
  eventName: AnalyticsEventName;
  labReportId?: string | null;
  metadata?: Record<string, unknown>;
  reportFileId?: string | null;
  userId: string | null;
}) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("analytics_events")
    .insert({
      event_name: input.eventName,
      lab_report_id: input.labReportId ?? null,
      metadata: input.metadata ?? {},
      properties: input.metadata ?? {},
      report_file_id: input.reportFileId ?? null,
      user_id: input.userId
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (input.userId) {
    await writeSupabaseAuditLog({
      action: "analytics_event_tracked",
      actorRole: "user",
      actorUserId: input.userId,
      metadata: { eventName: input.eventName },
      resourceId: data.id as string,
      resourceType: "analytics_event"
    });
  }

  return {
    createdAt: stringField(data, "created_at"),
    eventName: input.eventName,
    id: stringField(data, "id"),
    labReportId: nullableString(data, "lab_report_id"),
    metadata: objectField(data, "metadata"),
    reportFileId: nullableString(data, "report_file_id"),
    userId: nullableString(data, "user_id")
  };
}

export async function createSupabaseFeedbackEvent(input: {
  confusingText: string | null;
  freeText: string | null;
  feedbackSurface: FeedbackEventRecord["feedbackSurface"];
  helpful: FeedbackEventRecord["helpful"];
  doctorReviewId?: string | null;
  reportFileId: string | null;
  userId: string;
  wouldTrustDoctorReview: FeedbackEventRecord["wouldTrustDoctorReview"];
}) {
  const serviceClient = createSupabaseServiceClient();
  const reportFile = input.reportFileId ? await fetchReportFile(input.reportFileId) : null;

  if (reportFile && reportFile.userId !== input.userId) {
    throw new Error("report_not_found");
  }

  const labReport = reportFile ? await fetchLabReportByReportFileId(reportFile.id) : null;
  const { data, error } = await serviceClient
    .from("feedback_events")
    .insert({
      confusing_text: input.confusingText,
      doctor_review_id: input.doctorReviewId ?? null,
      event_type: input.feedbackSurface,
      feedback_surface: input.feedbackSurface,
      free_text: input.freeText,
      helpful: input.helpful,
      lab_report_id: labReport?.id ?? null,
      message: input.freeText,
      metadata: {
        confusingText: input.confusingText,
        wouldTrustDoctorReview: input.wouldTrustDoctorReview
      },
      report_file_id: reportFile?.id ?? null,
      report_id: labReport?.id ?? null,
      status: "new",
      user_id: input.userId,
      would_trust_doctor_review: input.wouldTrustDoctorReview
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await insertAuditLog({
    action: "feedback_submitted",
    actorRole: "user",
    actorUserId: input.userId,
    ipAddress: null,
    metadata: {
      feedbackSurface: input.feedbackSurface,
      helpful: input.helpful,
      wouldTrustDoctorReview: input.wouldTrustDoctorReview
    },
    requestId: null,
    resourceId: stringField(data, "id"),
    resourceType: "feedback_event",
    userAgent: null
  });

  return {
    confusingText: input.confusingText,
    createdAt: stringField(data, "created_at"),
    doctorReviewId: input.doctorReviewId ?? null,
    feedbackSurface: input.feedbackSurface,
    freeText: input.freeText,
    helpful: input.helpful,
    id: stringField(data, "id"),
    labReportId: labReport?.id ?? null,
    reportFileId: reportFile?.id ?? null,
    status: "new",
    userId: input.userId,
    wouldTrustDoctorReview: input.wouldTrustDoctorReview
  } satisfies FeedbackEventRecord;
}

export async function listSupabaseAdminReports() {
  const serviceClient = createSupabaseServiceClient();
  const [
    auditLogs,
    feedbackEvents,
    jobs,
    labReports,
    reportFiles,
    steps
  ] = await Promise.all([
    serviceClient.from("audit_logs").select("*").order("created_at", { ascending: false }),
    serviceClient.from("feedback_events").select("*").order("created_at", { ascending: false }),
    serviceClient.from("processing_jobs").select("*").order("created_at", { ascending: false }),
    serviceClient.from("lab_reports").select("*"),
    serviceClient.from("report_files").select("*").order("created_at", { ascending: false }),
    serviceClient.from("processing_job_steps").select("*").order("created_at", { ascending: false })
  ]);

  throwIfSupabaseError(auditLogs.error);
  throwIfSupabaseError(feedbackEvents.error);
  throwIfSupabaseError(jobs.error);
  throwIfSupabaseError(labReports.error);
  throwIfSupabaseError(reportFiles.error);
  throwIfSupabaseError(steps.error);

  return {
    analyticsEvents: [],
    auditLogs: auditLogs.data ?? [],
    betaInvites: [],
    biomarkerAliases: [],
    biomarkerCatalog: [],
    biomarkerResults: [],
    dataRightsRequests: [],
    doctorReviews: [],
    extractedDocuments: [],
    feedbackEvents: feedbackEvents.data ?? [],
    healthInsights: [],
    healthRiskFlags: [],
    jobs: (jobs.data ?? []).map(toProcessingJob),
    labReports: (labReports.data ?? []).map(toLabReport),
    modelRuns: [],
    notifications: [],
    payments: [],
    queues: {
      blockedJobs: (jobs.data ?? []).map(toProcessingJob).filter((job) => job.status === "blocked"),
      criticalFlaggedReports: [],
      failedJobs: (jobs.data ?? []).map(toProcessingJob).filter((job) => job.status === "failed"),
      failedExtraction: [],
      lowConfidenceExtraction: [],
      manualCorrectionNeeded: [],
      unsupportedReports: []
    },
    reminders: [],
    reportFiles: (reportFiles.data ?? []).map(toReportFile),
    steps: (steps.data ?? []).map(toProcessingStep)
  };
}

async function fetchReportFile(id: string) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.from("report_files").select("*").eq("id", id).single();

  if (error) {
    throw new Error(error.message);
  }

  return toReportFile(data);
}

async function supabaseDoctorAssignedToReport(
  serviceClient: ReturnType<typeof createSupabaseServiceClient>,
  doctorUserId: string,
  reportFileId: string
) {
  const { data, error } = await serviceClient
    .from("doctor_reviews")
    .select("id")
    .eq("assigned_doctor_id", doctorUserId)
    .eq("report_file_id", reportFileId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

async function fetchLabReport(id: string) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.from("lab_reports").select("*").eq("id", id).single();

  if (error) {
    throw new Error(error.message);
  }

  return toLabReport(data);
}

async function fetchLabReportByReportFileId(reportFileId: string) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("lab_reports")
    .select("*")
    .eq("report_file_id", reportFileId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toLabReport(data) : null;
}

async function insertProcessingStep(input: {
  jobId: string;
  now: string;
  state: string;
  status: string;
  stepName: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const { error } = await serviceClient.from("processing_job_steps").insert({
    attempt_count: 0,
    completed_at: input.status === "completed" ? input.now : null,
    created_at: input.now,
    job_id: input.jobId,
    processing_job_id: input.jobId,
    safe_input_summary: {},
    safe_output_summary: {},
    state: input.state,
    status: input.status,
    step_key: input.stepName,
    step_name: input.stepName,
    updated_at: input.now
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function insertAuditLog(input: {
  action: string;
  actorRole: UserRole | null;
  actorUserId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  requestId: string | null;
  resourceId: string | null;
  resourceType: string;
  userAgent: string | null;
}) {
  const serviceClient = createSupabaseServiceClient();
  const { error } = await serviceClient.from("audit_logs").insert({
    action: input.action,
    actor_role: input.actorRole,
    actor_user_id: input.actorUserId,
    entity_id: input.resourceId,
    entity_type: input.resourceType,
    ip_address: input.ipAddress,
    metadata: input.metadata,
    request_id: input.requestId,
    resource_id: input.resourceId,
    resource_type: input.resourceType,
    safe_metadata: input.metadata,
    user_agent: input.userAgent
  });

  if (error) {
    throw new Error(error.message);
  }
}

function toReportFile(row: DbRow): ReportFileRecord {
  return {
    checksumSha256: stringField(row, "checksum_sha256", "checksum"),
    createdAt: stringField(row, "created_at"),
    deletedAt: nullableString(row, "deleted_at"),
    fileSizeBytes: numberField(row, "file_size_bytes", "size_bytes"),
    id: stringField(row, "id"),
    mimeType: stringField(row, "mime_type"),
    originalFilename: stringField(row, "original_filename"),
    scanCompletedAt: nullableString(row, "scan_completed_at"),
    scanStatus: nullableString(row, "scan_status") as ReportFileRecord["scanStatus"],
    status: stringField(row, "status") as ReportFileRecord["status"],
    storageBucket: stringField(row, "storage_bucket") as ReportFileRecord["storageBucket"],
    storageKey: stringField(row, "storage_key"),
    unsupportedReason: nullableString(row, "unsupported_reason"),
    updatedAt: stringField(row, "updated_at"),
    uploadedAt: nullableString(row, "uploaded_at") ?? stringField(row, "created_at"),
    userId: stringField(row, "user_id")
  };
}

function toLabReport(row: DbRow): LabReportRecord {
  return {
    classificationConfidence: nullableNumber(row, "classification_confidence"),
    createdAt: stringField(row, "created_at"),
    extractionVersion: 1,
    id: stringField(row, "id"),
    parserVersion: "supabase_metadata",
    rawExtractedTables: null,
    rawExtractedText: null,
    reportFileId: stringField(row, "report_file_id"),
    reportType: nullableString(row, "report_type"),
    status: stringField(row, "status") as LabReportRecord["status"],
    supportedPanels: arrayField(row, "supported_panels"),
    unsupportedSections: arrayField(row, "unsupported_sections"),
    updatedAt: stringField(row, "updated_at"),
    userId: stringField(row, "user_id")
  };
}

function toProcessingJob(row: DbRow): ProcessingJobRecord {
  return {
    attemptCount: numberField(row, "attempt_count"),
    completedAt: nullableString(row, "completed_at"),
    createdAt: stringField(row, "created_at"),
    currentState: stringField(row, "current_state") as ProcessingJobRecord["currentState"],
    currentStep: stepNameField(row),
    errorCode: nullableString(row, "error_code"),
    errorMessage: nullableString(row, "error_message"),
    failedAt: nullableString(row, "failed_at"),
    id: stringField(row, "id"),
    idempotencyKey: stringField(row, "idempotency_key"),
    jobType: "report_processing",
    labReportId: stringField(row, "lab_report_id"),
    lockedBy: nullableString(row, "locked_by"),
    lockedUntil: nullableString(row, "locked_until"),
    maxAttempts: numberField(row, "max_attempts"),
    metadata: objectField(row, "metadata"),
    nextRunAt: nullableString(row, "next_run_at"),
    priority: numberField(row, "priority"),
    processingVersion: stringField(row, "processing_version"),
    queuedAt: stringField(row, "queued_at"),
    reportFileId: stringField(row, "report_file_id"),
    startedAt: nullableString(row, "started_at"),
    status: stringField(row, "status") as ProcessingJobRecord["status"],
    updatedAt: stringField(row, "updated_at"),
    userId: stringField(row, "user_id"),
    workerId: nullableString(row, "worker_id")
  };
}

function toProcessingStep(row: DbRow): ProcessingJobStepRecord {
  return {
    attemptCount: numberField(row, "attempt_count", "attempt_number"),
    attemptNumber: numberField(row, "attempt_number", "attempt_count"),
    completedAt: nullableString(row, "completed_at"),
    createdAt: stringField(row, "created_at"),
    durationMs: nullableNumber(row, "duration_ms"),
    errorCode: nullableString(row, "error_code"),
    errorMessage: nullableString(row, "error_message"),
    failedAt: nullableString(row, "failed_at"),
    id: stringField(row, "id"),
    inputSnapshot: objectField(row, "input_snapshot"),
    lockedBy: nullableString(row, "locked_by"),
    lockedUntil: nullableString(row, "locked_until"),
    maxAttempts: numberField(row, "max_attempts"),
    outputSnapshot: objectField(row, "output_snapshot"),
    processingJobId: stringField(row, "processing_job_id", "job_id"),
    safeInputSummary: objectField(row, "safe_input_summary"),
    safeOutputSummary: objectField(row, "safe_output_summary"),
    startedAt: nullableString(row, "started_at"),
    state: stringField(row, "state") as ProcessingJobStepRecord["state"],
    status: stringField(row, "status") as ProcessingJobStepRecord["status"],
    stepKey: stringField(row, "step_key", "step_name"),
    stepName: stepNameField(row, "step_name", "step_key"),
    updatedAt: stringField(row, "updated_at")
  };
}

function stepNameField(row: DbRow, primary = "current_step", fallback = "current_state"): ProcessingStepName {
  const value = stringField(row, primary, fallback);
  return PROCESSING_STEP_NAMES.has(value as ProcessingStepName) ? (value as ProcessingStepName) : "malware_scan";
}

function toBiomarkerResult(row: DbRow): BiomarkerResultRecord {
  return {
    canonicalBiomarkerKey: nullableString(row, "canonical_biomarker_key"),
    canonicalName: nullableString(row, "canonical_name"),
    confidenceScore: numberField(row, "confidence_score"),
    correctedAt: nullableString(row, "corrected_at"),
    correctedBy: nullableString(row, "corrected_by"),
    correctedCanonicalName: null,
    correctedConfidenceScore: null,
    correctedRawName: null,
    correctedReferenceHigh: null,
    correctedReferenceLow: null,
    correctedReferenceRangeText: null,
    correctedReviewRouting: null,
    correctedSourceText: null,
    correctedSystemFlag: null,
    correctedUnit: null,
    correctedValueNumeric: null,
    correctedValueText: null,
    correctionReason: nullableString(row, "correction_reason"),
    createdAt: stringField(row, "created_at"),
    extractionVersion: 1,
    id: stringField(row, "id"),
    isCritical: Boolean(row.is_critical),
    isManuallyCorrected: Boolean(row.is_manually_corrected),
    isSupported: Boolean(row.is_supported),
    labFlag: stringField(row, "lab_flag") as BiomarkerResultRecord["labFlag"],
    labName: nullableString(row, "lab_name"),
    labReportId: stringField(row, "lab_report_id"),
    originalUnit: nullableString(row, "original_unit"),
    pageNumber: nullableNumber(row, "page_number"),
    rawName: stringField(row, "raw_name"),
    referenceHigh: nullableNumber(row, "reference_high"),
    referenceLow: nullableNumber(row, "reference_low"),
    referenceRangeText: nullableString(row, "reference_range_text"),
    reportDate: nullableString(row, "report_date"),
    reviewRouting: stringField(row, "review_routing") as BiomarkerResultRecord["reviewRouting"],
    sourceBbox: objectField(row, "source_bbox"),
    sourceText: stringField(row, "source_text"),
    systemFlag: stringField(row, "system_flag") as BiomarkerResultRecord["systemFlag"],
    unit: nullableString(row, "unit"),
    updatedAt: stringField(row, "updated_at"),
    userId: stringField(row, "user_id"),
    valueNumeric: nullableNumber(row, "value_numeric"),
    valueText: nullableString(row, "value_text")
  };
}

function throwIfSupabaseError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

function stringField(row: DbRow, primary: string, fallback?: string) {
  const value = row[primary] ?? (fallback ? row[fallback] : undefined);
  return typeof value === "string" ? value : "";
}

function nullableString(row: DbRow, primary: string, fallback?: string) {
  const value = row[primary] ?? (fallback ? row[fallback] : undefined);
  return typeof value === "string" ? value : null;
}

function numberField(row: DbRow, primary: string, fallback?: string) {
  const value = row[primary] ?? (fallback ? row[fallback] : undefined);
  return typeof value === "number" ? value : Number(value ?? 0);
}

function nullableNumber(row: DbRow, primary: string) {
  const value = row[primary];
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function arrayField(row: DbRow, primary: string) {
  const value = row[primary];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function objectField(row: DbRow, primary: string) {
  const value = row[primary];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
