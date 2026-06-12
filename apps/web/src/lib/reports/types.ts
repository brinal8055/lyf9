export type ReportFileStatus =
  | "upload_pending"
  | "uploaded"
  | "upload_failed"
  | "scan_pending"
  | "scan_passed"
  | "scan_failed"
  | "scan_skipped_dev_only"
  | "scan_configuration_required"
  | "rejected_file_type"
  | "rejected_file_size"
  | "unsupported"
  | "ocr_required"
  | "processing"
  | "extraction_failed"
  | "failed"
  | "deleted";

export type ProcessingJobStatus =
  | "queued"
  | "running"
  | "waiting"
  | "blocked"
  | "failed"
  | "retry_scheduled"
  | "completed"
  | "cancelled";

export type ProcessingStepStatus =
  | "queued"
  | "running"
  | "waiting"
  | "blocked"
  | "failed"
  | "retry_scheduled"
  | "completed"
  | "cancelled";

export type ProcessingStepName =
  | "malware_scan"
  | "classify_report"
  | "extract_document"
  | "ocr_fallback"
  | "extract_biomarkers"
  | "normalize_biomarkers"
  | "validate_biomarkers"
  | "run_safety_rules"
  | "generate_patient_explanation"
  | "route_review"
  | "publish_result";

export type ProcessingJobState =
  | "uploaded"
  | "malware_scan"
  | "scan_pending"
  | "scan_passed"
  | "classified"
  | "unsupported"
  | "text_extraction_pending"
  | "text_extracted"
  | "ocr_required"
  | "ocr_completed"
  | "extraction_failed"
  | "biomarker_extraction_pending"
  | "biomarker_extracted"
  | "normalized"
  | "validation_failed"
  | "validated"
  | "low_confidence_review_required"
  | "critical_review_required"
  | "insight_generation_pending"
  | "insight_generated"
  | "doctor_review_required"
  | "doctor_reviewed"
  | "published"
  | "failed"
  | "archived"
  | "deleted";

export type ReportScanStatus =
  | "scan_pending"
  | "scan_passed"
  | "scan_failed"
  | "scan_skipped_dev_only"
  | "scan_configuration_required";

export type ReportType =
  | "cbc"
  | "lipid"
  | "thyroid"
  | "lft"
  | "kft"
  | "hba1c_glucose"
  | "vitamin"
  | "full_body_supported"
  | "urine_limited"
  | "unsupported"
  | "unknown";

export type ExtractedDocumentStatus =
  | "text_extraction_pending"
  | "text_extracted"
  | "ocr_required"
  | "ocr_completed"
  | "low_text_confidence"
  | "unsupported"
  | "extraction_failed";

export type BiomarkerFlag = "low" | "high" | "normal" | "borderline" | "critical" | "unknown";

export type ReviewRouting =
  | "auto_accept"
  | "soft_review"
  | "manual_review_required"
  | "critical_review_required";

export type UserRole = "user" | "admin" | "doctor" | "superadmin";

export type InsightStatus =
  | "draft"
  | "ai_only_ready"
  | "doctor_review_required"
  | "doctor_reviewed"
  | "rejected"
  | "archived";

export type DoctorReviewStatus =
  | "assigned"
  | "in_review"
  | "approved"
  | "edited_approved"
  | "rejected"
  | "more_info_requested";

export type DoctorReviewAction =
  | "approve"
  | "edit_and_approve"
  | "reject"
  | "request_more_info"
  | "mark_urgent";

export type PaymentProductType = "ai_report_explanation" | "doctor_reviewed_report";

export type PaymentStatus = "started" | "completed" | "failed" | "cancelled";

export type AnalyticsEventName =
  | "signup_started"
  | "signup_completed"
  | "consent_completed"
  | "questionnaire_completed"
  | "report_uploaded"
  | "explanation_viewed"
  | "marker_card_opened"
  | "reminder_set"
  | "doctor_review_requested"
  | "payment_started"
  | "payment_completed"
  | "feedback_submitted";

export type NotificationEventType =
  | "report_processing_complete"
  | "doctor_review_complete"
  | "retest_reminder";

export type BetaInviteStatus = "created" | "redeemed" | "revoked";

export type ReportFileRecord = {
  id: string;
  userId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  storageBucket: "mock-private" | "local-private" | "s3-private";
  storageKey: string;
  status: ReportFileStatus;
  unsupportedReason: string | null;
  uploadedAt: string;
  scanStatus: ReportScanStatus | null;
  scanCompletedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LabReportRecord = {
  id: string;
  userId: string;
  reportFileId: string;
  reportType: string | null;
  supportedPanels: string[];
  unsupportedSections: string[];
  status:
    | "draft"
    | "text_extracted"
    | "biomarker_extracted"
    | "biomarker_validated"
    | "insight_generated"
    | "doctor_review_required"
    | "admin_review_required"
    | "ocr_required"
    | "unsupported"
    | "failed";
  parserVersion: string;
  extractionVersion: 1;
  rawExtractedText: string | null;
  rawExtractedTables: string[][][] | null;
  classificationConfidence: number | null;
  createdAt: string;
  updatedAt: string;
};

export type BiomarkerCatalogRecord = {
  id: string;
  canonicalKey: string;
  canonicalName: string;
  category: string;
  supportedReportTypes: ReportType[];
  defaultUnit: string | null;
  allowedUnits: string[];
  normalRangeRules: Record<string, unknown>;
  criticalRules: Record<string, unknown>;
  isSupported: boolean;
  requiresDoctorReviewWhenAbnormal: boolean;
  descriptionForAdmin: string | null;
  catalogVersion: "biomarker_catalog_v1";
  createdAt: string;
  updatedAt: string;
};

export type BiomarkerAliasRecord = {
  id: string;
  biomarkerCatalogId: string;
  alias: string;
  normalizedAlias: string;
  labName: string | null;
  locale: string | null;
  confidenceWeight: number;
  createdAt: string;
  updatedAt: string;
};

export type BiomarkerResultRecord = {
  id: string;
  userId: string;
  labReportId: string;
  reportFileId?: string | null;
  extractedDocumentId?: string | null;
  biomarkerCatalogId?: string | null;
  extractionVersion: 1;
  rawName: string;
  canonicalName: string | null;
  canonicalBiomarkerKey: string | null;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  originalUnit: string | null;
  referenceRangeText: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  labFlag: BiomarkerFlag;
  systemFlag: BiomarkerFlag;
  confidenceScore: number;
  pageNumber: number | null;
  sourceText: string;
  sourceHash?: string;
  sourceBbox: Record<string, unknown> | null;
  isSupported: boolean;
  isCritical: boolean;
  reviewRouting: ReviewRouting;
  normalizationStatus?: "mapped" | "unmapped";
  validationStatus?: "pending" | "valid" | "invalid";
  reviewStatus?: ReviewRouting;
  aiModelRunId?: string | null;
  isManuallyCorrected: boolean;
  correctedRawName: string | null;
  correctedCanonicalName: string | null;
  correctedValueNumeric: number | null;
  correctedValueText: string | null;
  correctedUnit: string | null;
  correctedReferenceRangeText: string | null;
  correctedReferenceLow: number | null;
  correctedReferenceHigh: number | null;
  correctedSystemFlag: BiomarkerFlag | null;
  correctedSourceText: string | null;
  correctedConfidenceScore: number | null;
  correctedReviewRouting: ReviewRouting | null;
  correctionReason: string | null;
  correctedBy: string | null;
  correctedAt: string | null;
  reportDate: string | null;
  labName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HealthRiskFlagRecord = {
  id: string;
  userId: string;
  labReportId: string;
  reportFileId?: string | null;
  biomarkerResultId: string | null;
  flagType: "critical_value" | "low_confidence" | "unsafe_language";
  severity: "review" | "critical";
  reason: string;
  source?: "deterministic_rules" | "safety_filter";
  ruleVersion?: string | null;
  status?: "open" | "resolved";
  createdAt: string;
  updatedAt?: string;
};

export type ReminderRecord = {
  id: string;
  userId: string;
  reportFileId: string | null;
  labReportId: string | null;
  canonicalBiomarkerKey: string | null;
  title: string;
  reminderDate: string;
  note: string | null;
  status: "scheduled" | "sent" | "dismissed" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

export type FeedbackEventRecord = {
  id: string;
  userId: string;
  reportFileId: string | null;
  labReportId: string | null;
  doctorReviewId: string | null;
  feedbackSurface: "report_result" | "dashboard" | "doctor_review";
  helpful: "yes" | "no" | "unsure";
  confusingText: string | null;
  wouldTrustDoctorReview: "yes" | "no" | "unsure";
  freeText: string | null;
  status: "new" | "triaged" | "resolved" | "archived";
  createdAt: string;
};

export type PaymentRecord = {
  id: string;
  userId: string;
  reportId: string | null;
  productType: PaymentProductType;
  amountMinorUnits: number;
  currency: "INR";
  status: PaymentStatus;
  provider: "razorpay_sandbox_placeholder";
  providerOrderId: string | null;
  providerPaymentId: string | null;
  legalReviewRequired: boolean;
  publicLaunchEnabled: false;
  createdAt: string;
  updatedAt: string;
};

export type AnalyticsEventRecord = {
  id: string;
  userId: string | null;
  eventName: AnalyticsEventName;
  reportFileId: string | null;
  labReportId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type NotificationRecord = {
  id: string;
  userId: string;
  eventType: NotificationEventType;
  recipientEmail: string;
  subject: string;
  bodyPreview: string;
  provider: "email_placeholder";
  status: "queued" | "sent_placeholder" | "failed";
  relatedReportFileId: string | null;
  relatedDoctorReviewId: string | null;
  createdAt: string;
};

export type DataRightsRequestRecord = {
  id: string;
  userId: string;
  requestType: "export" | "delete";
  status: "completed";
  actorUserId: string;
  actorRole: UserRole;
  exportJson: Record<string, unknown> | null;
  deletedRecordCounts: Record<string, number> | null;
  createdAt: string;
};

export type BetaInviteRecord = {
  id: string;
  email: string;
  inviteCode: string;
  role: UserRole;
  status: BetaInviteStatus;
  invitedBy: string;
  redeemedBy: string | null;
  redeemedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HealthInsightRecord = {
  id: string;
  userId: string;
  labReportId: string;
  reportFileId?: string | null;
  modelRunId: string | null;
  insightType?: "patient_explanation";
  status: InsightStatus;
  summary: string;
  explanationJson?: Record<string, unknown>;
  markersNeedingAttention: Array<{
    biomarkerResultId: string;
    title: string;
    valueLabel: string;
    explanation: string;
  }>;
  normalMarkers: Array<{
    biomarkerResultId: string;
    title: string;
    valueLabel: string;
  }>;
  possibleRelevance: string[];
  questionsToAskDoctor: string[];
  retestSuggestion: string | null;
  disclaimer: string;
  sourceBiomarkerIds: string[];
  safetyFlags: string[];
  safetyStatus?: "passed" | "blocked" | "review_required";
  doctorReviewRequired?: boolean;
  doctorReviewReason?: string | null;
  publishedAt?: string | null;
  doctorReviewId: string | null;
  doctorReviewedAt: string | null;
  doctorReviewedBy: string | null;
  doctorEditedSummary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DoctorReviewRecord = {
  id: string;
  userId: string;
  labReportId: string;
  reportFileId: string;
  healthInsightId: string;
  assignedDoctorId: string;
  assignedDoctorEmail: string;
  assignedBy: string;
  status: DoctorReviewStatus;
  priority: "standard" | "urgent";
  aiDraftSnapshot: {
    summary: string;
    possibleRelevance: string[];
    questionsToAskDoctor: string[];
    retestSuggestion: string | null;
    disclaimer: string;
  };
  doctorEditedSummary: string | null;
  doctorNotes: string | null;
  rejectionReason: string | null;
  requestMoreInfoMessage: string | null;
  assignedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ModelRunRecord = {
  id: string;
  userId: string | null;
  reportFileId?: string | null;
  labReportId: string | null;
  extractedDocumentId?: string | null;
  processingJobId: string | null;
  taskType: "extract_biomarkers" | "patient_explanation" | "doctor_summary" | "safety_check" | "explain_report_ai_only" | "safety_filter";
  provider?: string;
  modelName: string;
  promptVersion: string;
  schemaVersion: string;
  inputHash: string;
  outputHash: string | null;
  outputJson: Record<string, unknown> | null;
  tokenCount?: number | null;
  tokenInputCount: number | null;
  tokenOutputCount: number | null;
  costEstimate?: number | null;
  costEstimateMinorUnits: number | null;
  latencyMs: number | null;
  safetyFilterStatus: "passed" | "blocked" | "not_applicable" | null;
  status?: "succeeded" | "failed";
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
};

export type ExtractedDocumentRecord = {
  id: string;
  reportId: string;
  reportFileId: string;
  extractionVersion: 1;
  parserName: string;
  parserProvider: string;
  parserVersion: string;
  ocrProvider: string | null;
  extractedText: string | null;
  extractedTablesJson: string[][][] | null;
  pageMetadataJson: Record<string, unknown>;
  pageCount: number | null;
  confidenceScore: number | null;
  status: ExtractedDocumentStatus;
  errorCode: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProcessingJobRecord = {
  id: string;
  userId: string;
  reportFileId: string;
  labReportId: string;
  jobType: "report_processing";
  status: ProcessingJobStatus;
  currentState: ProcessingJobState;
  currentStep: ProcessingStepName;
  idempotencyKey: string;
  processingVersion: string;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedUntil: string | null;
  nextRunAt: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  workerId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProcessingJobStepRecord = {
  id: string;
  processingJobId: string;
  stepKey: string;
  stepName: ProcessingStepName;
  state: ProcessingJobState;
  status: ProcessingStepStatus;
  attemptNumber: number;
  attemptCount: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedUntil: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  safeInputSummary: Record<string, unknown>;
  safeOutputSummary: Record<string, unknown>;
  inputSnapshot: Record<string, unknown> | null;
  outputSnapshot: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogRecord = {
  id: string;
  actorUserId: string | null;
  actorRole: UserRole | null;
  action:
    | "report_upload_initialized"
    | "report_upload_init"
    | "report_upload_blocked"
    | "report_upload_rejected_file_type"
    | "report_upload_rejected_file_size"
    | "report_upload_completed"
    | "processing_job_created"
    | "processing_job_claimed"
    | "processing_job_step_started"
    | "processing_job_step_completed"
    | "processing_job_step_failed"
    | "processing_job_retry_scheduled"
    | "processing_job_blocked"
    | "processing_job_failed"
    | "processing_job_completed"
    | "processing_job_cancelled"
    | "processing_job_lock_expired"
    | "signed_url_generation"
    | "signed_upload_url_generated"
    | "signed_download_url_generated"
    | "raw_report_access_requested"
    | "raw_report_access_denied"
    | "raw_report_access"
    | "malware_scan_started"
    | "malware_scan_passed"
    | "malware_scan_failed"
    | "malware_scan_configuration_required"
    | "report_deleted"
    | "document_extraction_started"
    | "document_extraction_completed"
    | "document_extraction_failed"
    | "document_extraction_ocr_required"
    | "ocr_extraction_started"
    | "ocr_extraction_completed"
    | "ocr_extraction_failed"
    | "ocr_configuration_required"
    | "report_classification_started"
    | "report_classification_completed"
    | "report_classification_unsupported"
    | "report_classification_unknown"
    | "extracted_document_admin_viewed"
    | "biomarker_extraction_started"
    | "biomarker_extraction_completed"
    | "biomarker_extraction_failed"
    | "biomarker_normalization_started"
    | "biomarker_normalization_completed"
    | "biomarker_normalization_review_required"
    | "biomarker_validation_started"
    | "biomarker_validation_completed"
    | "biomarker_validation_failed"
    | "low_confidence_review_required"
    | "safety_rules_started"
    | "safety_rules_completed"
    | "critical_review_required"
    | "patient_explanation_started"
    | "patient_explanation_completed"
    | "patient_explanation_blocked_by_safety"
    | "ai_configuration_required"
    | "ai_schema_validation_failed"
    | "model_run_created"
    | "model_run_failed"
    | "model_run_logged"
    | "health_insight_generated"
    | "retest_reminder_created"
    | "feedback_submitted"
    | "admin_biomarker_corrected"
    | "doctor_review_assigned"
    | "doctor_review_action"
    | "payment_started"
    | "payment_completed"
    | "analytics_event_tracked"
    | "notification_placeholder_created"
    | "data_export_completed"
    | "data_delete_completed"
    | "beta_invite_created"
    | "beta_invite_redeemed"
    | "job_state_change";
  entityType:
    | "report_file"
    | "report_upload"
    | "processing_job"
    | "lab_report"
    | "model_run"
    | "health_insight"
    | "biomarker_result"
    | "doctor_review"
    | "payment"
    | "analytics_event"
    | "notification"
    | "data_rights_request"
    | "beta_invite"
    | "reminder"
    | "feedback_event";
  entityId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  safeMetadata: Record<string, unknown>;
  createdAt: string;
};

export type ReportStore = {
  reportFiles: ReportFileRecord[];
  labReports: LabReportRecord[];
  extractedDocuments: ExtractedDocumentRecord[];
  biomarkerCatalog: BiomarkerCatalogRecord[];
  biomarkerAliases: BiomarkerAliasRecord[];
  biomarkerResults: BiomarkerResultRecord[];
  healthInsights: HealthInsightRecord[];
  doctorReviews: DoctorReviewRecord[];
  modelRuns: ModelRunRecord[];
  healthRiskFlags: HealthRiskFlagRecord[];
  reminders: ReminderRecord[];
  feedbackEvents: FeedbackEventRecord[];
  payments: PaymentRecord[];
  analyticsEvents: AnalyticsEventRecord[];
  notifications: NotificationRecord[];
  dataRightsRequests: DataRightsRequestRecord[];
  betaInvites: BetaInviteRecord[];
  processingJobs: ProcessingJobRecord[];
  processingJobSteps: ProcessingJobStepRecord[];
  auditLogs: AuditLogRecord[];
};
