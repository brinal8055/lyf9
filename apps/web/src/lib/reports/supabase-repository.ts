import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { createSupabaseServiceClient } from "../auth/providers/supabase-server";
import { writeSupabaseAuditLog } from "../auth/supabase-auth";
import { buildMarkerCards, buildTrendSeries, reportFilesByLabReportId } from "./presentation";
import { getStorageProvider } from "./providers/storage";
import { PROCESSING_VERSION, makeIdempotencyKey } from "./validation";
import type {
  AnalyticsEventName,
  AnalyticsEventRecord,
  AuditLogRecord,
  BetaInviteRecord,
  BiomarkerFlag,
  DataRightsRequestRecord,
  DoctorReviewAction,
  DoctorReviewRecord,
  ExtractedDocumentRecord,
  FeedbackEventRecord,
  BiomarkerResultRecord,
  HealthInsightRecord,
  HealthRiskFlagRecord,
  LabReportRecord,
  ModelRunRecord,
  ProcessingJobRecord,
  ProcessingStepName,
  ProcessingJobStepRecord,
  PaymentProductType,
  PaymentProviderName,
  PaymentRecord,
  ReminderRecord,
  ReportFileRecord,
  ReviewRouting,
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

export async function getSupabaseStoreHealth() {
  const serviceClient = createSupabaseServiceClient();
  const { count, error } = await serviceClient
    .from("report_files")
    .select("id", { count: "exact", head: true });

  if (error) {
    return {
      errorCode: error.code || "supabase_query_failed",
      ok: false,
      storageMode: process.env.STORAGE_PROVIDER ?? "unconfigured",
      storeMode: "supabase-postgres"
    };
  }

  return {
    ok: true,
    reportFileCount: count ?? 0,
    storageMode: process.env.STORAGE_PROVIDER ?? "unconfigured",
    storeMode: "supabase-postgres"
  };
}

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
    storage_bucket: uploadTarget.storageBucket,
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
  const insights = (insightsResult.data ?? []).map(toHealthInsight);

  return (filesResult.data ?? []).map((row) => {
    const reportFile = toReportFile(row);
    const labReport = labReports.find((report) => report.reportFileId === reportFile.id) ?? null;
    return {
      healthInsight: labReport
        ? insights.find((insight) => insight.labReportId === labReport.id) ?? null
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
  const healthInsightRow = labReport
    ? (insightResult.data ?? []).find((row) => stringField(row, "lab_report_id") === labReport.id) ?? null
    : null;
  const healthInsight = healthInsightRow ? toHealthInsight(healthInsightRow) : null;
  const labReports = labReport ? [labReport] : [];
  const filesByLabReportId = reportFilesByLabReportId(labReports, [reportFile]);

  return {
    biomarkerResults,
    feedbackEvents: (feedbackResult.data ?? []).map(toFeedbackEvent),
    healthInsight,
    job: jobResult.data ? toProcessingJob(jobResult.data) : null,
    labReport,
    markerCards: buildMarkerCards({
      currentMarkers: biomarkerResults,
      insight: healthInsight,
      previousMarkers: [],
      reportFilesByLabReportId: filesByLabReportId
    }),
    reminders: (reminderResult.data ?? []).map(toReminder),
    reportFile,
    riskFlags: (flagResult.data ?? []).map(toHealthRiskFlag),
    unsupportedSections: labReport?.unsupportedSections ?? []
  };
}

export async function listSupabaseHealthTimeline(userId: string) {
  const serviceClient = createSupabaseServiceClient();
  const [filesResult, reportsResult, jobsResult, insightsResult, markerResult, reminderResult] =
    await Promise.all([
      serviceClient
        .from("report_files")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      serviceClient.from("lab_reports").select("*").eq("user_id", userId),
      serviceClient.from("processing_jobs").select("*").eq("user_id", userId),
      serviceClient.from("health_insights").select("*").eq("user_id", userId),
      serviceClient.from("biomarker_results").select("*").eq("user_id", userId),
      serviceClient
        .from("reminders")
        .select("*")
        .eq("user_id", userId)
        .order("reminder_date", { ascending: true })
    ]);

  throwIfSupabaseError(filesResult.error);
  throwIfSupabaseError(reportsResult.error);
  throwIfSupabaseError(jobsResult.error);
  throwIfSupabaseError(insightsResult.error);
  throwIfSupabaseError(markerResult.error);
  throwIfSupabaseError(reminderResult.error);

  const reportFiles = (filesResult.data ?? []).map(toReportFile);
  const labReports = (reportsResult.data ?? []).map(toLabReport);
  const jobs = (jobsResult.data ?? []).map(toProcessingJob);
  const insights = (insightsResult.data ?? []).map(toHealthInsight);
  const markers = (markerResult.data ?? []).map(toBiomarkerResult);
  const filesByLabReportId = reportFilesByLabReportId(labReports, reportFiles);

  return {
    reminders: (reminderResult.data ?? []).map(toReminder),
    timeline: reportFiles.map((reportFile) => {
      const labReport = labReports.find((report) => report.reportFileId === reportFile.id) ?? null;
      return {
        insight: labReport
          ? insights.find((insight) => insight.labReportId === labReport.id) ?? null
          : null,
        job: jobs.find((job) => job.reportFileId === reportFile.id) ?? null,
        labReport,
        markerCount: labReport
          ? markers.filter((marker) => marker.labReportId === labReport.id).length
          : 0,
        reportFile
      };
    }),
    trendSeries: buildTrendSeries({
      markers,
      reportFilesByLabReportId: filesByLabReportId
    })
  };
}

export async function createSupabaseRetestReminder(input: {
  canonicalBiomarkerKey: string | null;
  note: string | null;
  reminderDate: string;
  reportFileId: string | null;
  title: string;
  userId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  let labReportId: string | null = null;

  if (input.reportFileId) {
    const { data, error } = await serviceClient
      .from("lab_reports")
      .select("id")
      .eq("report_file_id", input.reportFileId)
      .eq("user_id", input.userId)
      .maybeSingle();
    throwIfSupabaseError(error);
    labReportId = (data as DbRow | null) ? stringField(data as DbRow, "id") : null;
  }

  const { data, error } = await serviceClient
    .from("reminders")
    .insert({
      canonical_biomarker_key: input.canonicalBiomarkerKey,
      lab_report_id: labReportId,
      note: input.note,
      reminder_date: input.reminderDate,
      report_file_id: input.reportFileId,
      status: "scheduled",
      title: input.title,
      user_id: input.userId
    })
    .select("*")
    .single();

  throwIfSupabaseError(error);

  const reminder = toReminder(data as DbRow);
  await trackSupabaseAnalyticsEvent({
    eventName: "reminder_set",
    metadata: { canonicalBiomarkerKey: input.canonicalBiomarkerKey },
    reportFileId: input.reportFileId,
    userId: input.userId
  });

  return reminder;
}

export async function startSupabasePayment(input: {
  amountMinorUnits: number;
  currency: "INR";
  legalReviewRequired: boolean;
  productType: PaymentProductType;
  provider: PaymentProviderName;
  providerOrderId: string;
  publicLaunchEnabled: boolean;
  reportFileId: string | null;
  userId: string;
}): Promise<PaymentRecord> {
  const serviceClient = createSupabaseServiceClient();

  if (input.reportFileId) {
    const ownership = await serviceClient
      .from("report_files")
      .select("id")
      .eq("id", input.reportFileId)
      .eq("user_id", input.userId)
      .maybeSingle();
    throwIfSupabaseError(ownership.error);

    if (!ownership.data) {
      throw new Error("report_not_found");
    }
  }

  const { data, error } = await serviceClient
    .from("payments")
    .insert({
      amount: input.amountMinorUnits,
      currency: input.currency,
      product_type: input.productType,
      provider: input.provider,
      provider_order_id: input.providerOrderId,
      report_id: input.reportFileId,
      status: "started",
      user_id: input.userId
    })
    .select("*")
    .single();

  throwIfSupabaseError(error);

  await trackSupabaseAnalyticsEvent({
    eventName: "payment_started",
    metadata: { amountMinorUnits: input.amountMinorUnits, productType: input.productType },
    reportFileId: input.reportFileId,
    userId: input.userId
  });

  return toPayment(data as DbRow, {
    legalReviewRequired: input.legalReviewRequired,
    publicLaunchEnabled: input.publicLaunchEnabled
  });
}

export async function findSupabasePayment(
  paymentId: string,
  userId: string
): Promise<DbRow | null> {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .eq("user_id", userId)
    .maybeSingle();

  throwIfSupabaseError(error);
  return (data as DbRow | null) ?? null;
}

export async function completeSupabasePayment(input: {
  legalReviewRequired: boolean;
  paymentId: string;
  providerPaymentId: string;
  publicLaunchEnabled: boolean;
  userId: string;
}): Promise<PaymentRecord> {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("payments")
    .update({
      provider_payment_id: input.providerPaymentId,
      status: "completed",
      updated_at: new Date().toISOString()
    })
    .eq("id", input.paymentId)
    .eq("user_id", input.userId)
    .select("*")
    .single();

  throwIfSupabaseError(error);

  const payment = toPayment(data as DbRow, {
    legalReviewRequired: input.legalReviewRequired,
    publicLaunchEnabled: input.publicLaunchEnabled
  });

  await trackSupabaseAnalyticsEvent({
    eventName: "payment_completed",
    metadata: { amountMinorUnits: payment.amountMinorUnits, productType: payment.productType },
    reportFileId: payment.reportId,
    userId: input.userId
  });
  await writeSupabaseAuditLog({
    action: "payment_completed",
    actorRole: "user",
    actorUserId: input.userId,
    metadata: { productType: payment.productType, provider: payment.provider },
    resourceId: payment.id,
    resourceType: "payment"
  });

  return payment;
}

async function findSupabaseUserIdByEmail(email: string): Promise<string | null> {
  const serviceClient = createSupabaseServiceClient();
  const normalized = email.trim().toLowerCase();
  const { data, error } = await serviceClient
    .from("user_profiles")
    .select("user_id")
    .eq("email", normalized)
    .maybeSingle();

  throwIfSupabaseError(error);
  return data ? stringField(data as DbRow, "user_id") : null;
}

async function resolveSupabaseUserId(identity: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identity)) {
    return identity;
  }
  return findSupabaseUserIdByEmail(identity);
}

async function buildSupabaseDoctorReviewDetail(reviewRow: DbRow) {
  const serviceClient = createSupabaseServiceClient();
  const labReportId = stringField(reviewRow, "lab_report_id");
  const reportFileId = stringField(reviewRow, "report_file_id");
  const healthInsightId = stringField(reviewRow, "health_insight_id");
  const patientUserId = stringField(reviewRow, "user_id");

  const assignedDoctorId = nullableString(reviewRow, "assigned_doctor_id");

  const [
    labResult,
    fileResult,
    insightResult,
    markerResult,
    flagResult,
    patientResult,
    doctorResult
  ] = await Promise.all([
    serviceClient.from("lab_reports").select("*").eq("id", labReportId).maybeSingle(),
    serviceClient.from("report_files").select("*").eq("id", reportFileId).maybeSingle(),
    serviceClient.from("health_insights").select("*").eq("id", healthInsightId).maybeSingle(),
    serviceClient.from("biomarker_results").select("*").eq("lab_report_id", labReportId),
    serviceClient.from("health_risk_flags").select("*").eq("lab_report_id", labReportId),
    serviceClient
      .from("user_profiles")
      .select("email, full_name")
      .eq("user_id", patientUserId)
      .maybeSingle(),
    // assigned_doctor_id is a UUID; the record exposes an email field, so
    // resolve it here rather than leaking the raw UUID into the UI.
    assignedDoctorId
      ? serviceClient
          .from("user_profiles")
          .select("email")
          .eq("user_id", assignedDoctorId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  throwIfSupabaseError(labResult.error);
  throwIfSupabaseError(fileResult.error);
  throwIfSupabaseError(insightResult.error);
  throwIfSupabaseError(markerResult.error);
  throwIfSupabaseError(flagResult.error);
  throwIfSupabaseError(patientResult.error);
  throwIfSupabaseError(doctorResult.error);

  const patientRow = patientResult.data as DbRow | null;
  const doctorRow = doctorResult.data as DbRow | null;
  const assignedDoctorEmail = doctorRow ? stringField(doctorRow, "email") : null;

  return {
    biomarkers: (markerResult.data ?? []).map(toBiomarkerResult),
    healthInsight: insightResult.data ? toHealthInsight(insightResult.data as DbRow) : null,
    labReport: labResult.data ? toLabReport(labResult.data) : null,
    patient: {
      displayName: patientRow
        ? stringField(patientRow, "full_name") || stringField(patientRow, "email").split("@")[0]
        : patientUserId,
      userId: patientUserId
    },
    questionnaireSummary: {
      goals: "See the patient onboarding questionnaire.",
      symptoms: "See the patient onboarding questionnaire."
    },
    reportFile: fileResult.data ? toReportFile(fileResult.data) : null,
    review: toDoctorReview(reviewRow, assignedDoctorEmail),
    riskFlags: (flagResult.data ?? []).map(toHealthRiskFlag)
  };
}

export async function listSupabaseDoctorReviews(doctorIdentity: string) {
  const doctorId = await resolveSupabaseUserId(doctorIdentity);

  if (!doctorId) {
    return [];
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("doctor_reviews")
    .select("*")
    .eq("assigned_doctor_id", doctorId)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error);

  return Promise.all(((data ?? []) as DbRow[]).map(buildSupabaseDoctorReviewDetail));
}

export async function getSupabaseDoctorReviewDetail(doctorIdentity: string, reviewId: string) {
  const doctorId = await resolveSupabaseUserId(doctorIdentity);

  if (!doctorId) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("doctor_reviews")
    .select("*")
    .eq("id", reviewId)
    .eq("assigned_doctor_id", doctorId)
    .maybeSingle();

  throwIfSupabaseError(error);
  return data ? buildSupabaseDoctorReviewDetail(data as DbRow) : null;
}

export async function assignSupabaseDoctorReview(input: {
  actorUserId: string;
  assignedDoctorEmail?: string;
  assignedDoctorId?: string;
  healthInsightId: string;
  ipAddress: string | null;
  priority?: "standard" | "urgent";
  requestId: string | null;
  userAgent: string | null;
}) {
  const serviceClient = createSupabaseServiceClient();
  // Prefer the UUID when the caller already resolved a doctor (the capacity-aware
  // assignment path). The email lookup remains for legacy callers only.
  const doctorId =
    input.assignedDoctorId ??
    (input.assignedDoctorEmail
      ? await findSupabaseUserIdByEmail(input.assignedDoctorEmail)
      : null);

  if (!doctorId) {
    throw new Error("assigned_doctor_not_found");
  }

  const insightResult = await serviceClient
    .from("health_insights")
    .select("*")
    .eq("id", input.healthInsightId)
    .maybeSingle();
  throwIfSupabaseError(insightResult.error);

  if (!insightResult.data) {
    throw new Error("health_insight_not_found");
  }

  const insight = insightResult.data as DbRow;
  const labReportId = stringField(insight, "lab_report_id");
  const labResult = await serviceClient
    .from("lab_reports")
    .select("report_file_id")
    .eq("id", labReportId)
    .maybeSingle();
  throwIfSupabaseError(labResult.error);

  const reportFileId = labResult.data ? stringField(labResult.data as DbRow, "report_file_id") : "";
  const now = new Date().toISOString();
  const priority = input.priority ?? "standard";

  const existingResult = await serviceClient
    .from("doctor_reviews")
    .select("*")
    .eq("health_insight_id", input.healthInsightId)
    .neq("status", "rejected")
    .maybeSingle();
  throwIfSupabaseError(existingResult.error);

  const reviewValues = {
    ai_draft_snapshot: {
      disclaimer: stringField(insight, "disclaimer"),
      summary: stringField(insight, "summary")
    },
    assigned_at: now,
    assigned_by: input.actorUserId,
    assigned_doctor_id: doctorId,
    health_insight_id: input.healthInsightId,
    lab_report_id: labReportId,
    priority,
    report_file_id: reportFileId,
    status: "assigned",
    updated_at: now,
    user_id: stringField(insight, "user_id")
  };

  const upsertResult = existingResult.data
    ? await serviceClient
        .from("doctor_reviews")
        .update({
          assigned_doctor_id: doctorId,
          priority,
          status:
            stringField(existingResult.data as DbRow, "status") === "more_info_requested"
              ? "assigned"
              : stringField(existingResult.data as DbRow, "status"),
          updated_at: now
        })
        .eq("id", stringField(existingResult.data as DbRow, "id"))
        .select("*")
        .single()
    : await serviceClient.from("doctor_reviews").insert(reviewValues).select("*").single();

  throwIfSupabaseError(upsertResult.error);
  const review = upsertResult.data as DbRow;

  const insightUpdate = await serviceClient
    .from("health_insights")
    .update({
      doctor_review_id: stringField(review, "id"),
      status: "doctor_review_required",
      updated_at: now
    })
    .eq("id", input.healthInsightId);
  throwIfSupabaseError(insightUpdate.error);

  await writeSupabaseAuditLog({
    action: "doctor_review_assigned",
    actorRole: "admin",
    actorUserId: input.actorUserId,
    metadata: { healthInsightId: input.healthInsightId, priority },
    resourceId: stringField(review, "id"),
    resourceType: "doctor_review"
  });
  await trackSupabaseAnalyticsEvent({
    eventName: "doctor_review_requested",
    metadata: { priority },
    reportFileId,
    userId: stringField(insight, "user_id")
  });

  return toDoctorReview(review);
}

export async function applySupabaseDoctorReviewAction(input: {
  action: DoctorReviewAction;
  doctorEmail?: string;
  doctorIdentity?: string;
  editedSummary: string | null;
  ipAddress: string | null;
  notes: string | null;
  reason: string | null;
  requestId: string | null;
  reviewId: string;
  userAgent: string | null;
}) {
  const serviceClient = createSupabaseServiceClient();
  const doctorId = await resolveSupabaseUserId(input.doctorIdentity ?? input.doctorEmail ?? "");

  if (!doctorId) {
    throw new Error("doctor_review_not_found");
  }

  const reviewResult = await serviceClient
    .from("doctor_reviews")
    .select("*")
    .eq("id", input.reviewId)
    .eq("assigned_doctor_id", doctorId)
    .maybeSingle();
  throwIfSupabaseError(reviewResult.error);

  if (!reviewResult.data) {
    throw new Error("doctor_review_not_found");
  }

  const review = reviewResult.data as DbRow;
  const now = new Date().toISOString();
  const reviewUpdate: DbRow = { doctor_notes: input.notes, updated_at: now };
  const insightUpdate: DbRow = { updated_at: now };

  if (input.action === "mark_urgent") {
    reviewUpdate.priority = "urgent";
    if (stringField(review, "status") === "assigned") {
      reviewUpdate.status = "in_review";
    }
  } else if (input.action === "approve") {
    reviewUpdate.completed_at = now;
    reviewUpdate.status = "approved";
    insightUpdate.doctor_reviewed_at = now;
    insightUpdate.doctor_reviewed_by = doctorId;
    insightUpdate.status = "doctor_reviewed";
  } else if (input.action === "edit_and_approve") {
    reviewUpdate.completed_at = now;
    reviewUpdate.doctor_edited_output = { summary: input.editedSummary };
    reviewUpdate.status = "edited_approved";
    insightUpdate.doctor_reviewed_at = now;
    insightUpdate.doctor_reviewed_by = doctorId;
    insightUpdate.status = "doctor_reviewed";
    if (input.editedSummary) {
      insightUpdate.summary = input.editedSummary;
    }
  } else if (input.action === "reject") {
    reviewUpdate.completed_at = now;
    reviewUpdate.rejection_reason = input.reason;
    reviewUpdate.status = "rejected";
    insightUpdate.status = "rejected";
  } else if (input.action === "request_more_info") {
    reviewUpdate.request_more_info_message = input.reason;
    reviewUpdate.status = "more_info_requested";
    insightUpdate.status = "doctor_review_required";
  }

  const updatedReview = await serviceClient
    .from("doctor_reviews")
    .update(reviewUpdate)
    .eq("id", input.reviewId)
    .select("*")
    .single();
  throwIfSupabaseError(updatedReview.error);

  const updatedInsight = await serviceClient
    .from("health_insights")
    .update(insightUpdate)
    .eq("id", stringField(review, "health_insight_id"));
  throwIfSupabaseError(updatedInsight.error);

  await writeSupabaseAuditLog({
    action: "doctor_review_action",
    actorRole: "doctor",
    actorUserId: doctorId,
    metadata: { action: input.action },
    resourceId: input.reviewId,
    resourceType: "doctor_review"
  });

  return buildSupabaseDoctorReviewDetail(updatedReview.data as DbRow);
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

export async function createSupabaseBetaInvite(input: {
  actorUserId: string;
  email: string;
  inviteCode: string;
  role: BetaInviteRecord["role"];
}) {
  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await serviceClient
    .from("beta_invites")
    .insert({
      email: input.email.trim().toLowerCase(),
      invite_code_hash: hashInviteCode(input.inviteCode),
      invited_by: input.actorUserId,
      role: input.role,
      status: "created",
      updated_at: now
    })
    .select("*")
    .single();
  throwIfSupabaseError(error);

  const invite = toBetaInvite(data as DbRow, input.inviteCode);
  await insertAuditLog({
    action: "beta_invite_created",
    actorRole: "admin",
    actorUserId: input.actorUserId,
    ipAddress: null,
    metadata: { role: input.role },
    requestId: null,
    resourceId: invite.id,
    resourceType: "beta_invite",
    userAgent: null
  });
  return invite;
}

export async function redeemSupabaseBetaInvite(input: { email: string; inviteCode: string }) {
  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await serviceClient
    .from("beta_invites")
    .select("*")
    .eq("email", input.email.trim().toLowerCase())
    .eq("invite_code_hash", hashInviteCode(input.inviteCode))
    .eq("status", "created")
    .gt("expires_at", now)
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!data) return { ok: false, reason: "A valid private beta invite code is required." };

  const redeemed = await serviceClient
    .from("beta_invites")
    .update({ redeemed_at: now, status: "redeemed", updated_at: now })
    .eq("id", stringField(data as DbRow, "id"))
    .eq("status", "created")
    .select("id")
    .maybeSingle();
  throwIfSupabaseError(redeemed.error);
  if (!redeemed.data) return { ok: false, reason: "This private beta invite was already used." };

  await insertAuditLog({
    action: "beta_invite_redeemed",
    actorRole: null,
    actorUserId: null,
    ipAddress: null,
    metadata: {},
    requestId: null,
    resourceId: stringField(data as DbRow, "id"),
    resourceType: "beta_invite",
    userAgent: null
  });
  return { ok: true, reason: null };
}

export async function createSupabaseDataExport(input: {
  actorRole: "admin" | "superadmin";
  actorUserId: string;
  targetUserId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const userId = await resolveSupabaseUserId(input.targetUserId);
  if (!userId) throw new Error("user_not_found");

  const tables = [
    "user_profiles",
    "user_health_profiles",
    "questionnaire_responses",
    "user_consents",
    "report_files",
    "lab_reports",
    "processing_jobs",
    "biomarker_results",
    "health_insights",
    "health_risk_flags",
    "doctor_reviews",
    "reminders",
    "feedback_events",
    "analytics_events",
    "payments"
  ] as const;
  const rows = await Promise.all(
    tables.map(async (table) => {
      const result = await serviceClient.from(table).select("*").eq("user_id", userId);
      throwIfSupabaseError(result.error);
      return [table, result.data ?? []] as const;
    })
  );
  const now = new Date().toISOString();
  const request: DataRightsRequestRecord = {
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    createdAt: now,
    deletedRecordCounts: null,
    exportJson: Object.fromEntries(rows),
    id: randomUUID(),
    requestType: "export",
    status: "completed",
    userId
  };

  await insertAuditLog({
    action: "data_export_completed",
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    ipAddress: null,
    metadata: { tableCount: tables.length },
    requestId: null,
    resourceId: request.id,
    resourceType: "data_rights_request",
    userAgent: null
  });
  return request;
}

export async function createSupabaseDataDeletion(input: {
  actorRole: "superadmin";
  actorUserId: string;
  targetUserId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const userId = await resolveSupabaseUserId(input.targetUserId);
  if (!userId) throw new Error("user_not_found");
  if (userId === input.actorUserId) throw new Error("cannot_delete_current_operator");

  const files = await serviceClient
    .from("report_files")
    .select("storage_key")
    .eq("user_id", userId);
  throwIfSupabaseError(files.error);
  const storageProvider = getStorageProvider();
  for (const row of files.data ?? []) {
    const storageKey = stringField(row as DbRow, "storage_key");
    if (storageKey) await storageProvider.deleteFile({ storageKey });
  }

  const deleted = await serviceClient.auth.admin.deleteUser(userId);
  throwIfSupabaseError(deleted.error);
  const request: DataRightsRequestRecord = {
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    createdAt: new Date().toISOString(),
    deletedRecordCounts: { reportFiles: files.data?.length ?? 0, users: 1 },
    exportJson: null,
    id: randomUUID(),
    requestType: "delete",
    status: "completed",
    userId
  };

  await insertAuditLog({
    action: "data_delete_completed",
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    ipAddress: null,
    metadata: { reportFileCount: files.data?.length ?? 0 },
    requestId: null,
    resourceId: request.id,
    resourceType: "data_rights_request",
    userAgent: null
  });
  return request;
}

export async function correctSupabaseBiomarker(input: {
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
  const serviceClient = createSupabaseServiceClient();
  const existing = await serviceClient
    .from("biomarker_results")
    .select("*")
    .eq("id", input.biomarkerResultId)
    .maybeSingle();
  throwIfSupabaseError(existing.error);
  if (!existing.data) throw new Error("biomarker_result_not_found");

  const correctedValues = {
    canonicalName: input.canonicalName,
    confidenceScore: input.confidenceScore,
    rawName: input.rawName,
    referenceHigh: input.referenceHigh,
    referenceLow: input.referenceLow,
    referenceRangeText: input.referenceRangeText,
    reviewRouting: input.reviewRouting,
    sourceText: input.sourceText,
    systemFlag: input.systemFlag,
    unit: input.unit,
    valueNumeric: input.valueNumeric,
    valueText: input.valueText
  };
  const now = new Date().toISOString();
  const updated = await serviceClient
    .from("biomarker_results")
    .update({
      corrected_at: now,
      corrected_by: input.actorUserId,
      corrected_unit: input.unit,
      corrected_value_numeric: input.valueNumeric,
      corrected_value_text: input.valueText,
      corrected_values: correctedValues,
      correction_reason: input.reason,
      is_manually_corrected: true,
      updated_at: now
    })
    .eq("id", input.biomarkerResultId)
    .select("*")
    .single();
  throwIfSupabaseError(updated.error);

  await insertAuditLog({
    action: "admin_biomarker_corrected",
    actorRole: "admin",
    actorUserId: input.actorUserId,
    ipAddress: input.ipAddress,
    metadata: {
      correctedFields: Object.entries(correctedValues)
        .filter(([, value]) => value !== null)
        .map(([field]) => field),
      reason: input.reason
    },
    requestId: input.requestId,
    resourceId: input.biomarkerResultId,
    resourceType: "biomarker_result",
    userAgent: input.userAgent
  });

  return toBiomarkerResult(updated.data as DbRow);
}

export async function listSupabaseAdminReports() {
  const serviceClient = createSupabaseServiceClient();
  const [
    analyticsEvents,
    auditLogs,
    betaInvites,
    biomarkerResults,
    doctorReviews,
    extractedDocuments,
    feedbackEvents,
    healthInsights,
    healthRiskFlags,
    jobs,
    labReports,
    modelRuns,
    payments,
    reportFiles,
    reminders,
    steps
  ] = await Promise.all([
    serviceClient.from("analytics_events").select("*").order("created_at", { ascending: false }).limit(500),
    serviceClient.from("audit_logs").select("*").order("created_at", { ascending: false }),
    serviceClient.from("beta_invites").select("*").order("created_at", { ascending: false }),
    serviceClient.from("biomarker_results").select("*").order("created_at", { ascending: false }),
    serviceClient.from("doctor_reviews").select("*").order("created_at", { ascending: false }),
    serviceClient.from("extracted_documents").select("*").order("created_at", { ascending: false }),
    serviceClient.from("feedback_events").select("*").order("created_at", { ascending: false }),
    serviceClient.from("health_insights").select("*").order("created_at", { ascending: false }),
    serviceClient.from("health_risk_flags").select("*").order("created_at", { ascending: false }),
    serviceClient.from("processing_jobs").select("*").order("created_at", { ascending: false }),
    serviceClient.from("lab_reports").select("*"),
    serviceClient.from("model_runs").select("*").order("created_at", { ascending: false }),
    serviceClient.from("payments").select("*").order("created_at", { ascending: false }),
    serviceClient.from("report_files").select("*").order("created_at", { ascending: false }),
    serviceClient.from("reminders").select("*").order("created_at", { ascending: false }),
    serviceClient.from("processing_job_steps").select("*").order("created_at", { ascending: false })
  ]);

  [
    analyticsEvents,
    auditLogs,
    betaInvites,
    biomarkerResults,
    doctorReviews,
    extractedDocuments,
    feedbackEvents,
    healthInsights,
    healthRiskFlags,
    jobs,
    labReports,
    modelRuns,
    payments,
    reportFiles,
    reminders,
    steps
  ].forEach((result) => throwIfSupabaseError(result.error));

  const mappedJobs = (jobs.data ?? []).map(toProcessingJob);
  const mappedFiles = (reportFiles.data ?? []).map(toReportFile);
  const mappedMarkers = (biomarkerResults.data ?? []).map(toBiomarkerResult);
  const mappedFlags = (healthRiskFlags.data ?? []).map(toHealthRiskFlag);
  const mappedDocuments = (extractedDocuments.data ?? []).map(toExtractedDocument);

  return {
    analyticsEvents: (analyticsEvents.data ?? []).map(toAnalyticsEvent),
    auditLogs: (auditLogs.data ?? []).map(toAuditLog),
    betaInvites: (betaInvites.data ?? []).map((row) => toBetaInvite(row as DbRow, "")),
    biomarkerAliases: [],
    biomarkerCatalog: [],
    biomarkerResults: mappedMarkers,
    dataRightsRequests: [],
    doctorReviews: (doctorReviews.data ?? []).map((row) => toDoctorReview(row as DbRow)),
    extractedDocuments: mappedDocuments,
    feedbackEvents: (feedbackEvents.data ?? []).map(toFeedbackEvent),
    healthInsights: (healthInsights.data ?? []).map(toHealthInsight),
    healthRiskFlags: mappedFlags,
    jobs: mappedJobs,
    labReports: (labReports.data ?? []).map(toLabReport),
    modelRuns: (modelRuns.data ?? []).map(toModelRun),
    notifications: [],
    payments: (payments.data ?? []).map((row) =>
      toPayment(row as DbRow, { legalReviewRequired: true, publicLaunchEnabled: false })
    ),
    queues: {
      blockedJobs: mappedJobs.filter((job) => job.status === "blocked"),
      criticalFlaggedReports: mappedFlags.filter((flag) => flag.severity === "critical"),
      failedJobs: mappedJobs.filter((job) => job.status === "failed"),
      failedExtraction: mappedJobs.filter(
        (job) => job.currentState === "extraction_failed" || job.errorCode?.includes("extraction")
      ),
      lowConfidenceExtraction: mappedMarkers.filter(
        (marker) => marker.confidenceScore < 0.95 || marker.reviewRouting === "soft_review"
      ),
      manualCorrectionNeeded: mappedMarkers.filter(
        (marker) =>
          !marker.isManuallyCorrected &&
          (marker.reviewRouting === "manual_review_required" ||
            marker.reviewRouting === "critical_review_required")
      ),
      ocrRequiredReports: mappedDocuments.filter((document) => document.status === "ocr_required"),
      unknownClassification: mappedJobs.filter(
        (job) => job.errorCode === "report_classification_unknown"
      ),
      unsupportedReports: mappedFiles.filter((file) => file.status === "unsupported")
    },
    reminders: (reminders.data ?? []).map(toReminder),
    reportFiles: mappedFiles,
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

function toPayment(
  row: DbRow,
  flags: { legalReviewRequired: boolean; publicLaunchEnabled: boolean }
): PaymentRecord {
  return {
    amountMinorUnits: numberField(row, "amount"),
    createdAt: stringField(row, "created_at"),
    currency: (stringField(row, "currency") || "INR") as PaymentRecord["currency"],
    id: stringField(row, "id"),
    legalReviewRequired: flags.legalReviewRequired,
    productType: stringField(row, "product_type") as PaymentProductType,
    provider: stringField(row, "provider") as PaymentProviderName,
    providerOrderId: nullableString(row, "provider_order_id"),
    providerPaymentId: nullableString(row, "provider_payment_id"),
    publicLaunchEnabled: flags.publicLaunchEnabled,
    reportId: nullableString(row, "report_id"),
    status: stringField(row, "status") as PaymentRecord["status"],
    updatedAt: stringField(row, "updated_at"),
    userId: stringField(row, "user_id")
  };
}

function toBetaInvite(row: DbRow, rawInviteCode: string): BetaInviteRecord {
  return {
    createdAt: stringField(row, "created_at"),
    email: stringField(row, "email"),
    id: stringField(row, "id"),
    inviteCode: rawInviteCode,
    invitedBy: stringField(row, "invited_by"),
    redeemedAt: nullableString(row, "redeemed_at"),
    redeemedBy: nullableString(row, "redeemed_by"),
    role: stringField(row, "role") as BetaInviteRecord["role"],
    status: stringField(row, "status") as BetaInviteRecord["status"],
    updatedAt: stringField(row, "updated_at")
  };
}

function toDoctorReview(row: DbRow, resolvedDoctorEmail?: string | null): DoctorReviewRecord {
  const snapshot = (row.ai_draft_snapshot ?? {}) as Record<string, unknown>;
  const editedOutput = (row.doctor_edited_output ?? null) as Record<string, unknown> | null;

  return {
    aiDraftSnapshot: {
      disclaimer: typeof snapshot.disclaimer === "string" ? snapshot.disclaimer : "",
      possibleRelevance: Array.isArray(snapshot.possibleRelevance)
        ? (snapshot.possibleRelevance as string[])
        : [],
      questionsToAskDoctor: Array.isArray(snapshot.questionsToAskDoctor)
        ? (snapshot.questionsToAskDoctor as string[])
        : [],
      retestSuggestion:
        typeof snapshot.retestSuggestion === "string" ? snapshot.retestSuggestion : null,
      summary: typeof snapshot.summary === "string" ? snapshot.summary : ""
    },
    assignedAt: stringField(row, "assigned_at"),
    assignedBy: stringField(row, "assigned_by"),
    // Falls back to the UUID only when the doctor has no user_profiles row,
    // which should not happen for an approved doctor.
    assignedDoctorEmail: resolvedDoctorEmail ?? stringField(row, "assigned_doctor_id"),
    assignedDoctorId: stringField(row, "assigned_doctor_id"),
    completedAt: nullableString(row, "completed_at"),
    createdAt: stringField(row, "created_at"),
    doctorEditedSummary:
      editedOutput && typeof editedOutput.summary === "string" ? editedOutput.summary : null,
    doctorNotes: nullableString(row, "doctor_notes"),
    healthInsightId: stringField(row, "health_insight_id"),
    id: stringField(row, "id"),
    labReportId: stringField(row, "lab_report_id"),
    priority: stringField(row, "priority") as DoctorReviewRecord["priority"],
    rejectionReason: nullableString(row, "rejection_reason"),
    reportFileId: stringField(row, "report_file_id"),
    requestMoreInfoMessage: nullableString(row, "request_more_info_message"),
    status: stringField(row, "status") as DoctorReviewRecord["status"],
    updatedAt: stringField(row, "updated_at"),
    userId: stringField(row, "user_id")
  };
}

function toAuditLog(row: DbRow): AuditLogRecord {
  return {
    action: stringField(row, "action") as AuditLogRecord["action"],
    actorRole: nullableString(row, "actor_role") as AuditLogRecord["actorRole"],
    actorUserId: nullableString(row, "actor_user_id"),
    createdAt: stringField(row, "created_at"),
    entityId: nullableString(row, "entity_id", "resource_id"),
    entityType: stringField(row, "entity_type", "resource_type") as AuditLogRecord["entityType"],
    id: stringField(row, "id"),
    ipAddress: nullableString(row, "ip_address"),
    requestId: nullableString(row, "request_id"),
    safeMetadata: objectField(row, "safe_metadata"),
    userAgent: nullableString(row, "user_agent")
  };
}

function toAnalyticsEvent(row: DbRow): AnalyticsEventRecord {
  return {
    createdAt: stringField(row, "created_at"),
    eventName: stringField(row, "event_name") as AnalyticsEventName,
    id: stringField(row, "id"),
    labReportId: nullableString(row, "lab_report_id"),
    metadata: objectField(row, "metadata"),
    reportFileId: nullableString(row, "report_file_id"),
    userId: nullableString(row, "user_id")
  };
}

function toExtractedDocument(row: DbRow): ExtractedDocumentRecord {
  return {
    confidenceScore: nullableNumber(row, "confidence_score"),
    createdAt: stringField(row, "created_at"),
    error: nullableString(row, "error_message", "error"),
    errorCode: nullableString(row, "error_code"),
    extractedTablesJson: tableArrayField(row, "extracted_tables_json"),
    extractedText: nullableString(row, "extracted_text"),
    extractionVersion: 1,
    id: stringField(row, "id"),
    ocrProvider: nullableString(row, "ocr_provider"),
    pageCount: nullableNumber(row, "page_count"),
    pageMetadataJson: objectField(row, "page_metadata_json"),
    parserName: stringField(row, "parser_name"),
    parserProvider: stringField(row, "parser_provider"),
    parserVersion: stringField(row, "parser_version"),
    reportFileId: stringField(row, "report_file_id"),
    reportId: stringField(row, "lab_report_id", "report_id"),
    status: stringField(row, "status") as ExtractedDocumentRecord["status"],
    updatedAt: stringField(row, "updated_at") || stringField(row, "created_at")
  };
}

function toModelRun(row: DbRow): ModelRunRecord {
  return {
    costEstimate: nullableNumber(row, "cost_estimate"),
    costEstimateMinorUnits: nullableNumber(row, "cost_estimate_minor_units"),
    createdAt: stringField(row, "created_at"),
    errorCode: nullableString(row, "error_code"),
    errorMessage: nullableString(row, "error_message"),
    extractedDocumentId: nullableString(row, "extracted_document_id"),
    id: stringField(row, "id"),
    inputHash: stringField(row, "input_hash"),
    labReportId: nullableString(row, "lab_report_id"),
    latencyMs: nullableNumber(row, "latency_ms"),
    modelName: stringField(row, "model_name"),
    outputHash: nullableString(row, "output_hash"),
    outputJson: nullableObjectField(row, "output_json"),
    processingJobId: nullableString(row, "processing_job_id"),
    promptVersion: stringField(row, "prompt_version"),
    provider: stringField(row, "provider"),
    reportFileId: nullableString(row, "report_file_id"),
    safetyFilterStatus: nullableString(row, "safety_filter_status") as ModelRunRecord["safetyFilterStatus"],
    schemaVersion: stringField(row, "schema_version"),
    status: stringField(row, "status") as ModelRunRecord["status"],
    taskType: stringField(row, "task_type") as ModelRunRecord["taskType"],
    tokenCount: nullableNumber(row, "token_count"),
    tokenInputCount: nullableNumber(row, "token_input_count"),
    tokenOutputCount: nullableNumber(row, "token_output_count"),
    userId: nullableString(row, "user_id")
  };
}

function toReminder(row: DbRow): ReminderRecord {
  return {
    canonicalBiomarkerKey: nullableString(row, "canonical_biomarker_key"),
    createdAt: stringField(row, "created_at"),
    id: stringField(row, "id"),
    labReportId: nullableString(row, "lab_report_id"),
    note: nullableString(row, "note"),
    reminderDate: stringField(row, "reminder_date"),
    reportFileId: nullableString(row, "report_file_id"),
    status: stringField(row, "status") as ReminderRecord["status"],
    title: stringField(row, "title"),
    updatedAt: stringField(row, "updated_at"),
    userId: stringField(row, "user_id")
  };
}

export function toFeedbackEvent(row: DbRow): FeedbackEventRecord {
  return {
    createdAt: stringField(row, "created_at"),
    confusingText: nullableString(row, "confusing_text"),
    doctorReviewId: nullableString(row, "doctor_review_id"),
    feedbackSurface: stringField(row, "feedback_surface") as FeedbackEventRecord["feedbackSurface"],
    freeText: nullableString(row, "free_text"),
    helpful: stringField(row, "helpful") as FeedbackEventRecord["helpful"],
    id: stringField(row, "id"),
    labReportId: nullableString(row, "lab_report_id"),
    reportFileId: nullableString(row, "report_file_id", "report_id"),
    status: stringField(row, "status") as FeedbackEventRecord["status"],
    userId: stringField(row, "user_id"),
    wouldTrustDoctorReview: stringField(
      row,
      "would_trust_doctor_review"
    ) as FeedbackEventRecord["wouldTrustDoctorReview"]
  };
}

export function toHealthRiskFlag(row: DbRow): HealthRiskFlagRecord {
  const rawFlagType = stringField(row, "flag_type");
  const rawSeverity = stringField(row, "severity");

  return {
    biomarkerResultId: nullableString(row, "biomarker_result_id"),
    createdAt: stringField(row, "created_at"),
    flagType:
      rawFlagType === "unsafe_ai_output" ? "unsafe_language" : (rawFlagType as HealthRiskFlagRecord["flagType"]),
    id: stringField(row, "id"),
    labReportId: stringField(row, "lab_report_id"),
    reason: stringField(row, "reason"),
    reportFileId: nullableString(row, "report_file_id"),
    ruleVersion: nullableString(row, "rule_version"),
    severity:
      rawSeverity === "critical" || rawSeverity === "high" ? "critical" : "review",
    source: stringField(row, "source") as HealthRiskFlagRecord["source"],
    status: stringField(row, "status") as HealthRiskFlagRecord["status"],
    updatedAt: nullableString(row, "updated_at") ?? undefined,
    userId: stringField(row, "user_id")
  };
}

export function toHealthInsight(row: DbRow): HealthInsightRecord {
  const explanation = explanationPayload(row);
  const rawStatus = stringField(row, "status");
  const persistedSummary = stringField(row, "summary");

  return {
    createdAt: stringField(row, "created_at"),
    disclaimer: stringValue(explanation.disclaimer) || stringField(row, "disclaimer"),
    doctorEditedSummary: nullableString(row, "doctor_edited_summary"),
    doctorReviewId: nullableString(row, "doctor_review_id"),
    doctorReviewReason:
      nullableString(row, "doctor_review_reason") ?? nullableStringValue(explanation.doctor_review_reason),
    doctorReviewRequired:
      booleanField(row, "doctor_review_required") || rawStatus === "doctor_review_pending" || rawStatus === "admin_review_pending",
    doctorReviewedAt: nullableString(row, "doctor_reviewed_at"),
    doctorReviewedBy: nullableString(row, "doctor_reviewed_by"),
    explanationJson: explanation,
    id: stringField(row, "id"),
    insightType: "patient_explanation",
    labReportId: stringField(row, "lab_report_id"),
    markersNeedingAttention: markerExplanations(explanation.markers_needing_attention),
    modelRunId: nullableString(row, "ai_model_run_id", "model_run_id"),
    normalMarkers: normalMarkerExplanations(explanation.normal_markers),
    possibleRelevance: stringArray(explanation.possible_relevance),
    publishedAt: nullableString(row, "published_at"),
    questionsToAskDoctor: stringArray(explanation.questions_to_ask_doctor),
    reportFileId: nullableString(row, "report_file_id"),
    retestSuggestion: nullableStringValue(explanation.retest_suggestion),
    safetyFlags: arrayField(row, "safety_flags"),
    safetyStatus: normalizeSafetyStatus(stringField(row, "safety_status")),
    sourceBiomarkerIds:
      arrayField(row, "source_biomarker_ids").length > 0
        ? arrayField(row, "source_biomarker_ids")
        : stringArray(explanation.source_biomarker_ids),
    status: normalizeInsightStatus(rawStatus),
    summary:
      rawStatus === "doctor_reviewed"
        ? persistedSummary || stringValue(explanation.summary)
        : stringValue(explanation.summary) || persistedSummary,
    updatedAt: stringField(row, "updated_at"),
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
  const corrected = objectField(row, "corrected_values");
  return {
    canonicalBiomarkerKey: nullableString(row, "canonical_biomarker_key"),
    canonicalName: nullableString(row, "canonical_name"),
    confidenceScore: numberField(row, "confidence_score"),
    correctedAt: nullableString(row, "corrected_at"),
    correctedBy: nullableString(row, "corrected_by"),
    correctedCanonicalName: nullableStringValue(corrected.canonicalName),
    correctedConfidenceScore: nullableNumberValue(corrected.confidenceScore),
    correctedRawName: nullableStringValue(corrected.rawName),
    correctedReferenceHigh: nullableNumberValue(corrected.referenceHigh),
    correctedReferenceLow: nullableNumberValue(corrected.referenceLow),
    correctedReferenceRangeText: nullableStringValue(corrected.referenceRangeText),
    correctedReviewRouting: nullableStringValue(corrected.reviewRouting) as BiomarkerResultRecord["correctedReviewRouting"],
    correctedSourceText: nullableStringValue(corrected.sourceText),
    correctedSystemFlag: nullableStringValue(corrected.systemFlag) as BiomarkerResultRecord["correctedSystemFlag"],
    correctedUnit: nullableString(row, "corrected_unit") ?? nullableStringValue(corrected.unit),
    correctedValueNumeric:
      nullableNumber(row, "corrected_value_numeric") ?? nullableNumberValue(corrected.valueNumeric),
    correctedValueText:
      nullableString(row, "corrected_value_text") ?? nullableStringValue(corrected.valueText),
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

function nullableObjectField(row: DbRow, primary: string) {
  const value = row[primary];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function tableArrayField(row: DbRow, primary: string): string[][][] | null {
  const value = row[primary];
  return Array.isArray(value) ? (value as string[][][]) : null;
}

function explanationPayload(row: DbRow) {
  const explanation = objectField(row, "explanation_json");
  return Object.keys(explanation).length > 0 ? explanation : objectField(row, "output_json");
}

function normalizeInsightStatus(status: string): HealthInsightRecord["status"] {
  if (status === "ai_only_published") return "ai_only_ready";
  if (status === "doctor_review_pending" || status === "admin_review_pending") {
    return "doctor_review_required";
  }
  if (
    status === "draft" ||
    status === "ai_only_ready" ||
    status === "doctor_review_required" ||
    status === "doctor_reviewed" ||
    status === "rejected" ||
    status === "archived"
  ) {
    return status;
  }
  return "draft";
}

function normalizeSafetyStatus(
  status: string
): HealthInsightRecord["safetyStatus"] {
  if (status === "passed" || status === "blocked" || status === "review_required") {
    return status;
  }
  return undefined;
}

function markerExplanations(value: unknown): HealthInsightRecord["markersNeedingAttention"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      biomarkerResultId: stringValue(item.biomarker_result_id),
      explanation: stringValue(item.explanation),
      title: stringValue(item.display_name) || stringValue(item.title),
      valueLabel: stringValue(item.value_display) || stringValue(item.value_label)
    }))
    .filter((item) => item.biomarkerResultId.length > 0);
}

function normalMarkerExplanations(value: unknown): HealthInsightRecord["normalMarkers"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .map((item) => ({
      biomarkerResultId: stringValue(item.biomarker_result_id),
      title: stringValue(item.display_name) || stringValue(item.title),
      valueLabel: stringValue(item.value_display) || stringValue(item.value_label)
    }))
    .filter((item) => item.biomarkerResultId.length > 0);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableStringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nullableNumberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function booleanField(row: DbRow, field: string) {
  return row[field] === true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hashInviteCode(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
