import { describe, expect, it } from "vitest";
import { readFile, writeFile } from "fs/promises";
import path from "path";

import {
  extractBiomarkersFromDocument,
  routeBiomarkerReview,
  validateBiomarkerExtractionOutput
} from "./biomarkers";
import { findCatalogByAlias } from "./catalog";
import { classifyReport } from "./classification";
import { localDocumentParser } from "./parser";
import { buildMarkerCards, buildTrendSeries, reportFilesByLabReportId } from "./presentation";
import {
  applyDoctorReviewAction,
  auditReportUploadBlocked,
  assignDoctorReview,
  completeUpload,
  completePayment,
  correctBiomarker,
  createBetaInvite,
  createFeedbackEvent,
  createDataDeletion,
  createDataExport,
  createSignedDownloadUrl,
  createRetestReminder,
  createUploadInit,
  deleteReportFile,
  getPrivateStoragePathForTests,
  getUserFacingReportStatus,
  getDoctorReviewDetail,
  getReportDetails,
  getStore,
  listAdminReports,
  listDoctorReviews,
  listHealthTimeline,
  processWorkflowOnce,
  resetReportStoreForTests,
  retryProcessingJob,
  startPayment,
  trackAnalyticsEvent,
  validateAndRedeemBetaInvite
} from "./repository";
import {
  createSignedToken,
  verifySignedToken
} from "./signed-url";
import {
  makeIdempotencyKey,
  validateUploadInit
} from "./validation";
import { getMalwareScannerProvider } from "../malware";
import {
  MarkerProvider,
  MockFixtureDocumentParser,
  MockOcrProvider,
  TextractOcrProvider,
  classifyExtractedReport,
  getDocumentParserProvider
} from "../document-extraction";
import {
  MockAiProvider,
  OpenAiStructuredOutputsProvider,
  getAiProvider,
  validateBiomarkerExtractionSchema,
  validatePatientExplanationSchema
} from "../ai";
import { normalizeBiomarkerItems } from "../biomarkers";
import { runMedicalSafetyRules } from "../safety";
import { createDatabaseWorkflowProvider, getBackoffNextRunAt } from "../workflow";
import {
  generateSafeExplanation,
  runUnsafeLanguageFilter,
  validateExplanationOutput
} from "./safety";
import { inferUserRole, roleCanAccess } from "../auth/roles";

const metadata = {
  ipAddress: "127.0.0.1",
  requestId: "test-request",
  userAgent: "vitest",
  userId: "beta@example.com"
};

async function persistStoreForTests(store: unknown) {
  await writeFile(path.join(getPrivateStoragePathForTests(), "..", "store.json"), JSON.stringify(store, null, 2));
}

describe("upload validation", () => {
  it("accepts PDF/JPG/JPEG/PNG MIME types and rejects unsupported files", () => {
    expect(
      validateUploadInit({
        checksumSha256: "a".repeat(64),
        fileSizeBytes: 1024,
        mimeType: "application/pdf",
        originalFilename: "report.pdf"
      }).ok
    ).toBe(true);
    expect(
      validateUploadInit({
        checksumSha256: "a".repeat(64),
        fileSizeBytes: 1024,
        mimeType: "image/jpeg",
        originalFilename: "report.jpeg"
      }).ok
    ).toBe(true);
    expect(
      validateUploadInit({
        checksumSha256: "a".repeat(64),
        fileSizeBytes: 1024,
        mimeType: "image/jpg",
        originalFilename: "report.jpg"
      }).ok
    ).toBe(true);
    expect(
      validateUploadInit({
        checksumSha256: "a".repeat(64),
        fileSizeBytes: 1024,
        mimeType: "text/plain",
        originalFilename: "report.txt"
      }).ok
    ).toBe(false);
  });
});

describe("signed URLs", () => {
  it("verifies action and expiry", () => {
    const token = createSignedToken(
      {
        action: "upload",
        expiresAt: Date.now() + 1000,
        reportFileId: "report-1",
        storageKey: "private/report.pdf",
        userId: "beta@example.com"
      },
      "secret"
    );

    expect(verifySignedToken(token, "upload", "secret")?.reportFileId).toBe("report-1");
    expect(verifySignedToken(token, "download", "secret")).toBeNull();
  });
});

describe("RBAC helpers", () => {
  it("infers private-beta roles and protects privileged workspaces", () => {
    expect(inferUserRole("admin@lyf9.ai")).toBe("admin");
    expect(inferUserRole("doctor@lyf9.ai")).toBe("doctor");
    expect(inferUserRole("superadmin@lyf9.ai")).toBe("superadmin");
    expect(inferUserRole("member@example.com")).toBe("user");
    expect(roleCanAccess("admin", ["admin"])).toBe(true);
    expect(roleCanAccess("doctor", ["doctor"])).toBe(true);
    expect(roleCanAccess("user", ["admin"])).toBe(false);
    expect(roleCanAccess("admin", ["doctor"])).toBe(false);
    expect(roleCanAccess("superadmin", ["doctor"])).toBe(true);
  });
});

describe("report repository", () => {
  it("audits upload-init attempts blocked by missing required consent", async () => {
    await resetReportStoreForTests();

    await auditReportUploadBlocked({
      actorRole: "user",
      ipAddress: "127.0.0.1",
      reason: "missing_required_consent",
      requestId: "blocked-request",
      userAgent: "vitest",
      userId: "beta@example.com"
    });

    const store = await getStore();
    expect(store.auditLogs).toHaveLength(1);
    expect(store.auditLogs[0]).toMatchObject({
      action: "report_upload_blocked",
      actorUserId: "beta@example.com",
      entityType: "report_upload",
      safeMetadata: { reason: "missing_required_consent" }
    });
  });

  it("creates report metadata, signed upload target, processing job after upload, and audit logs", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "b".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });

    expect(init.reportFile.status).toBe("upload_pending");
    expect(init.job).toBeNull();
    expect(init.uploadTarget.uploadUrl).toContain("mock://upload/");
    expect(init.uploadTarget.storageKey).toContain(`reports/${metadata.userId}/${init.reportFile.id}/`);

    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      reportFileId: init.reportFile.id
    });

    const store = await getStore();
    expect(store.reportFiles).toHaveLength(1);
    expect(store.extractedDocuments).toHaveLength(1);
    expect(store.processingJobs).toHaveLength(1);
    expect(store.processingJobs[0].idempotencyKey).toBe(
      makeIdempotencyKey("beta@example.com", "b".repeat(64))
    );
    expect(store.processingJobs[0].currentState).toBe("insight_generated");
    expect(store.processingJobs[0].status).toBe("completed");
    expect(store.labReports[0].reportType).toBe("cbc");
    expect(store.labReports[0].rawExtractedText).toContain("Complete Blood Count");
    expect(store.labReports[0].rawExtractedTables?.[0]?.length).toBeGreaterThan(0);
    expect(store.biomarkerResults).toHaveLength(3);
    expect(store.biomarkerResults[0].sourceText).toContain("Hemoglobin");
    expect(store.biomarkerResults[0].confidenceScore).toBeGreaterThanOrEqual(0.95);
    expect(store.healthInsights).toHaveLength(1);
    expect(store.healthInsights[0].status).toBe("ai_only_ready");
    expect(store.healthInsights[0].disclaimer).toContain("not a diagnosis or prescription");
    expect(store.modelRuns.map((run) => run.taskType)).toEqual([
      "extract_biomarkers",
      "explain_report_ai_only"
    ]);
    expect(store.processingJobSteps.some((step) => step.state === "scan_passed")).toBe(true);
    expect(store.processingJobSteps.some((step) => step.state === "classified")).toBe(true);
    expect(store.processingJobSteps.some((step) => step.state === "biomarker_extracted")).toBe(true);
    expect(store.processingJobSteps.some((step) => step.state === "insight_generated")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "report_upload_completed")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "signed_upload_url_generated")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "processing_job_created")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "malware_scan_passed")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "document_extraction_completed")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "model_run_logged")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "job_state_change")).toBe(true);
  });

  it("routes image reports to OCR_REQUIRED when OCR is not configured", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "c".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "image/png",
      originalFilename: "cbc-report.png"
    });

    await completeUpload({
      ...metadata,
      bytes: Buffer.from("not-real-image-fixture"),
      reportFileId: init.reportFile.id
    });

    const store = await getStore();
    expect(store.processingJobs[0].currentState).toBe("ocr_required");
    expect(store.processingJobs[0].status).toBe("failed");
    expect(store.extractedDocuments[0].status).toBe("ocr_required");
  });

  it("blocks processing when malware scan fails", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "1".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "virus-test-cbc-report.pdf"
    });

    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      reportFileId: init.reportFile.id
    });

    const store = await getStore();
    expect(store.reportFiles[0].status).toBe("scan_failed");
    expect(store.processingJobs[0].status).toBe("failed");
    expect(store.processingJobs[0].errorCode).toBe("malware_scan_failed");
    expect(store.extractedDocuments).toHaveLength(0);
    expect(store.healthInsights).toHaveLength(0);
  });

  it("keeps S3/AWS secrets out of frontend source imports", async () => {
    const uploadForm = await readFile(
      path.join(process.cwd(), "src/components/reports/report-upload-form.tsx"),
      "utf8"
    );
    const authLib = await readFile(path.join(process.cwd(), "src/lib/auth/supabase-auth.ts"), "utf8");

    expect(uploadForm).not.toContain("AWS_SECRET_ACCESS_KEY");
    expect(uploadForm).not.toContain("AWS_ACCESS_KEY_ID");
    expect(uploadForm).not.toContain("S3_REPORT_BUCKET");
    expect(authLib).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("rejects executable, SVG, ZIP, unknown, oversized, and empty uploads", () => {
    const base = {
      checksumSha256: "2".repeat(64),
      fileSizeBytes: 1024,
      originalFilename: "report.pdf"
    };

    for (const mimeType of [
      "application/x-msdownload",
      "image/svg+xml",
      "application/zip",
      "application/octet-stream"
    ]) {
      expect(validateUploadInit({ ...base, mimeType }).ok).toBe(false);
    }

    expect(validateUploadInit({ ...base, fileSizeBytes: 0, mimeType: "application/pdf" }).ok).toBe(false);
    expect(
      validateUploadInit({
        ...base,
        fileSizeBytes: 20 * 1024 * 1024 + 1,
        mimeType: "application/pdf"
      }).ok
    ).toBe(false);
  });

  it("generates signed download URLs only for owners, admins, and assigned doctors", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "3".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "glucose-report.pdf"
    });
    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("critical-glucose-report.txt")),
      reportFileId: init.reportFile.id
    });
    const insight = (await getStore()).healthInsights[0];
    await assignDoctorReview({
      actorUserId: "admin@lyf9.ai",
      assignedDoctorEmail: "doctor@lyf9.ai",
      healthInsightId: insight.id,
      ipAddress: "127.0.0.1",
      priority: "urgent",
      requestId: "download-assign",
      userAgent: "vitest"
    });

    const ownerUrl = await createSignedDownloadUrl({
      ...metadata,
      actorRole: "user",
      purpose: "owner_download",
      reportFileId: init.reportFile.id
    });
    expect(ownerUrl.downloadUrl).toContain(`/api/reports/${init.reportFile.id}/download?token=`);
    await expect(
      createSignedDownloadUrl({
        ...metadata,
        actorRole: "user",
        purpose: "cross_user_download",
        reportFileId: init.reportFile.id,
        userId: "other@example.com"
      })
    ).rejects.toThrow("report_not_found");
    await expect(
      createSignedDownloadUrl({
        ...metadata,
        actorRole: "doctor",
        purpose: "unassigned_doctor_download",
        reportFileId: init.reportFile.id,
        userId: "other-doctor@lyf9.ai"
      })
    ).rejects.toThrow("report_not_found");
    const doctorUrl = await createSignedDownloadUrl({
      ...metadata,
      actorRole: "doctor",
      purpose: "assigned_doctor_download",
      reportFileId: init.reportFile.id,
      userId: "doctor@lyf9.ai"
    });
    const adminUrl = await createSignedDownloadUrl({
      ...metadata,
      actorRole: "admin",
      purpose: "admin_operational_download",
      reportFileId: init.reportFile.id,
      userId: "admin@lyf9.ai"
    });
    const store = await getStore();

    expect(doctorUrl.downloadUrl).toContain(`/api/reports/${init.reportFile.id}/download?token=`);
    expect(adminUrl.downloadUrl).toContain(`/api/reports/${init.reportFile.id}/download?token=`);
    expect(store.auditLogs.some((log) => log.action === "raw_report_access_denied")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "raw_report_access_requested")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "signed_download_url_generated")).toBe(true);
  });

  it("marks deleted reports and prevents future signed download URLs", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "4".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      reportFileId: init.reportFile.id
    });

    const deleted = await deleteReportFile({
      ...metadata,
      actorRole: "user",
      reportFileId: init.reportFile.id
    });
    await expect(
      createSignedDownloadUrl({
        ...metadata,
        actorRole: "user",
        purpose: "deleted_download",
        reportFileId: init.reportFile.id
      })
    ).rejects.toThrow("report_not_found");
    const store = await getStore();

    expect(deleted.reportFile.status).toBe("deleted");
    expect(deleted.reportFile.deletedAt).toBeTruthy();
    expect(store.auditLogs.some((log) => log.action === "report_deleted")).toBe(true);
  });

  it("blocks processing while scan is pending and fails closed when scanner is not configured", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "5".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({
      ...metadata,
      reportFileId: init.reportFile.id
    });
    const pendingStore = await getStore();
    expect(pendingStore.reportFiles[0].scanStatus).toBe("scan_pending");
    expect(pendingStore.processingJobs[0].currentState).toBe("scan_pending");
    expect(pendingStore.extractedDocuments).toHaveLength(0);

    const previousAppEnv = process.env.APP_ENV;
    const previousScanner = process.env.MALWARE_SCANNER_PROVIDER;
    process.env.APP_ENV = "production";
    process.env.MALWARE_SCANNER_PROVIDER = "mock";
    const scan = await getMalwareScannerProvider().scanFile({
      mimeType: "application/pdf",
      reportFileId: init.reportFile.id,
      storageKey: init.reportFile.storageKey
    });
    if (previousAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = previousAppEnv;
    }
    if (previousScanner === undefined) {
      delete process.env.MALWARE_SCANNER_PROVIDER;
    } else {
      process.env.MALWARE_SCANNER_PROVIDER = previousScanner;
    }

    expect(scan.status).toBe("configuration_required");
  });

  it("does not create duplicate active jobs for duplicate upload-complete calls", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "6".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });

    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });

    const store = await getStore();
    expect(store.processingJobs).toHaveLength(1);
    expect(store.processingJobSteps.filter((step) => step.stepName === "malware_scan")).toHaveLength(1);
  });

  it("claims queued jobs with leases and prevents a second worker claim", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "7".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    const store = await getStore();
    const workflow = createDatabaseWorkflowProvider(store);

    const firstClaim = await workflow.claimNextJob({
      leaseSeconds: 300,
      now: "2026-06-06T00:00:00.000Z",
      workerId: "worker-a"
    });
    const secondClaim = await workflow.claimNextJob({
      leaseSeconds: 300,
      now: "2026-06-06T00:00:10.000Z",
      workerId: "worker-b"
    });

    expect(firstClaim?.lockedBy).toBe("worker-a");
    expect(firstClaim?.attemptCount).toBe(1);
    expect(secondClaim).toBeNull();
    expect(store.auditLogs.some((log) => log.action === "processing_job_claimed")).toBe(true);
  });

  it("does not claim terminal or blocked jobs", async () => {
    for (const status of ["blocked", "failed", "completed", "cancelled"] as const) {
      await resetReportStoreForTests();
      const init = await createUploadInit({
        ...metadata,
        checksumSha256: `${status.length}`.repeat(64).slice(0, 64),
        fileSizeBytes: 2048,
        mimeType: "application/pdf",
        originalFilename: "cbc-report.pdf"
      });
      await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
      const store = await getStore();
      store.processingJobs[0].status = status;
      const workflow = createDatabaseWorkflowProvider(store);

      await expect(
        workflow.claimNextJob({
          leaseSeconds: 300,
          now: "2026-06-06T00:00:00.000Z",
          workerId: "worker-a"
        })
      ).resolves.toBeNull();
    }
  });

  it("does not claim retry jobs before next_run_at", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "71".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    const store = await getStore();
    store.processingJobs[0].status = "retry_scheduled";
    store.processingJobs[0].nextRunAt = "2026-06-06T00:05:00.000Z";
    const workflow = createDatabaseWorkflowProvider(store);

    await expect(
      workflow.claimNextJob({
        leaseSeconds: 300,
        now: "2026-06-06T00:04:59.000Z",
        workerId: "worker-a"
      })
    ).resolves.toBeNull();

    const claim = await workflow.claimNextJob({
      leaseSeconds: 300,
      now: "2026-06-06T00:05:00.000Z",
      workerId: "worker-a"
    });
    expect(claim?.id).toBe(store.processingJobs[0].id);
  });

  it("releases expired locks so another worker can reclaim the job", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "8".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    const store = await getStore();
    const workflow = createDatabaseWorkflowProvider(store);

    await workflow.claimNextJob({
      leaseSeconds: 1,
      now: "2026-06-06T00:00:00.000Z",
      workerId: "worker-a"
    });
    const reclaimed = await workflow.claimNextJob({
      leaseSeconds: 300,
      now: "2026-06-06T00:00:02.000Z",
      workerId: "worker-b"
    });

    expect(reclaimed?.lockedBy).toBe("worker-b");
    expect(reclaimed?.attemptCount).toBe(2);
    expect(store.auditLogs.some((log) => log.action === "processing_job_lock_expired")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "processing_job_retry_scheduled")).toBe(true);
  });

  it("marks expired locks failed after max attempts", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "81".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    const store = await getStore();
    const job = store.processingJobs[0];
    job.status = "running";
    job.lockedBy = "worker-a";
    job.lockedUntil = "2026-06-06T00:00:00.000Z";
    job.attemptCount = job.maxAttempts;
    const workflow = createDatabaseWorkflowProvider(store);

    const released = await workflow.releaseExpiredLocks({ now: "2026-06-06T00:00:01.000Z" });

    expect(released).toBe(1);
    expect(job.status).toBe("failed");
    expect(job.errorCode).toBe("lock_expired_max_attempts");
    expect(store.auditLogs.some((log) => log.action === "processing_job_failed")).toBe(true);
  });

  it("returns null safely when no jobs are claimable", async () => {
    await resetReportStoreForTests();
    const workflow = createDatabaseWorkflowProvider(await getStore());

    await expect(
      workflow.claimNextJob({
        leaseSeconds: 300,
        now: "2026-06-06T00:00:00.000Z",
        workerId: "worker-a"
      })
    ).resolves.toBeNull();
  });

  it("allows only one concurrent local claimant for the same job", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "82".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    const workflow = createDatabaseWorkflowProvider(await getStore());

    const claims = await Promise.all([
      workflow.claimNextJob({ leaseSeconds: 300, now: "2026-06-06T00:00:00.000Z", workerId: "worker-a" }),
      workflow.claimNextJob({ leaseSeconds: 300, now: "2026-06-06T00:00:00.000Z", workerId: "worker-b" })
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(new Set(claims.filter(Boolean).map((claim) => claim?.id)).size).toBe(1);
  });

  it("lets multiple workers claim distinct queued jobs without duplicate ids", async () => {
    await resetReportStoreForTests();
    for (const checksum of ["83".repeat(32), "84".repeat(32)]) {
      const init = await createUploadInit({
        ...metadata,
        checksumSha256: checksum,
        fileSizeBytes: 2048,
        mimeType: "application/pdf",
        originalFilename: "cbc-report.pdf"
      });
      await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    }
    const workflow = createDatabaseWorkflowProvider(await getStore());

    const claims = await Promise.all([
      workflow.claimNextJob({ leaseSeconds: 300, now: "2026-06-06T00:00:00.000Z", workerId: "worker-a" }),
      workflow.claimNextJob({ leaseSeconds: 300, now: "2026-06-06T00:00:00.000Z", workerId: "worker-b" })
    ]);

    expect(claims.filter(Boolean)).toHaveLength(2);
    expect(new Set(claims.map((claim) => claim?.id)).size).toBe(2);
  });

  it("blocks best-effort local claim in staging-like environments", async () => {
    await resetReportStoreForTests();
    const previousAppEnv = process.env.APP_ENV;
    try {
      process.env.APP_ENV = "staging";
      const workflow = createDatabaseWorkflowProvider(await getStore());

      await expect(
        workflow.claimNextJob({
          leaseSeconds: 300,
          now: "2026-06-06T00:00:00.000Z",
          workerId: "worker-a"
        })
      ).rejects.toThrow("atomic_workflow_claim_required");
    } finally {
      restoreEnv("APP_ENV", previousAppEnv);
    }
  });

  it("schedules retry for retryable step failures", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "9".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    const store = await getStore();
    const workflow = createDatabaseWorkflowProvider(store);
    const job = store.processingJobs[0];

    await workflow.runJobStep({ jobId: job.id, stepName: "malware_scan", workerId: "worker-a" });
    await workflow.markStepFailed({
      errorCode: "scanner_unavailable",
      errorMessage: "Temporary scanner outage.",
      jobId: job.id,
      retryable: true,
      stepName: "malware_scan"
    });
    await workflow.scheduleRetry({
      jobId: job.id,
      nextRunAt: getBackoffNextRunAt(2, new Date("2026-06-06T00:00:00.000Z")),
      reason: "scanner_unavailable",
      stepName: "malware_scan"
    });

    expect(job.status).toBe("retry_scheduled");
    expect(job.nextRunAt).toBe("2026-06-06T00:01:00.000Z");
    expect(store.auditLogs.some((log) => log.action === "processing_job_retry_scheduled")).toBe(true);
  });

  it("process-once handles no jobs gracefully", async () => {
    await resetReportStoreForTests();
    await expect(processWorkflowOnce({ workerId: "worker-a" })).resolves.toMatchObject({
      processed: false,
      reason: "no_jobs"
    });
  });

  it("runs durable malware_scan and advances to document extraction", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "a1".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });

    const result = await processWorkflowOnce({ workerId: "worker-a" });
    const store = await getStore();

    expect(result).toMatchObject({ processed: true, reason: "malware_scan_passed" });
    expect(store.reportFiles[0].scanStatus).toBe("scan_passed");
    expect(store.processingJobs[0].currentStep).toBe("extract_document");
    expect(store.processingJobs[0].status).toBe("queued");
    expect(store.extractedDocuments).toHaveLength(0);
    expect(store.auditLogs.some((log) => log.action === "processing_job_step_completed")).toBe(true);
  });

  it("does not rerun a completed malware_scan step", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "a2".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    await processWorkflowOnce({ workerId: "worker-a" });
    await processWorkflowOnce({ workerId: "worker-b" });

    const store = await getStore();
    const malwareStep = store.processingJobSteps.find((step) => step.stepName === "malware_scan");
    expect(malwareStep?.attemptCount).toBe(1);
  });

  it("extracts a scanned document through OCR and queues biomarker extraction", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "b1".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "image/png",
      originalFilename: "ocr-cbc-report.png"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });

    await processWorkflowOnce({ workerId: "worker-a" });
    await processWorkflowOnce({ workerId: "worker-a" });
    await processWorkflowOnce({ workerId: "worker-a" });
    await processWorkflowOnce({ workerId: "worker-a" });

    const store = await getStore();
    expect(store.extractedDocuments.map((document) => document.status)).toEqual(["ocr_required", "ocr_completed"]);
    expect(store.labReports[0].reportType).toBe("cbc");
    expect(store.processingJobs[0].currentStep).toBe("extract_biomarkers");
    expect(store.processingJobs[0].status).toBe("queued");
    expect(store.processingJobs[0].errorCode).toBeNull();
    expect(store.biomarkerResults).toHaveLength(0);
    expect(store.healthInsights).toHaveLength(0);
    expect(store.auditLogs.some((log) => log.action === "document_extraction_ocr_required")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "ocr_extraction_completed")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "report_classification_completed")).toBe(true);
  });

  it("extract_document requires scan_passed and blocks scan_pending reports", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "b2".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    const store = await getStore();
    store.processingJobs[0].currentStep = "extract_document";
    await persistStoreForTests(store);

    await processWorkflowOnce({ workerId: "worker-a" });
    const updatedStore = await getStore();

    expect(updatedStore.extractedDocuments).toHaveLength(0);
    expect(updatedStore.processingJobs[0].status).toBe("blocked");
    expect(updatedStore.processingJobs[0].errorCode).toBe("scan_not_passed");
  });

  it("extract_document blocks scan_failed reports", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "b3".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    const store = await getStore();
    store.reportFiles[0].scanStatus = "scan_failed";
    store.reportFiles[0].status = "scan_failed";
    store.processingJobs[0].currentStep = "extract_document";
    await persistStoreForTests(store);

    await processWorkflowOnce({ workerId: "worker-a" });
    const updatedStore = await getStore();

    expect(updatedStore.extractedDocuments).toHaveLength(0);
    expect(updatedStore.processingJobs[0].status).toBe("blocked");
    expect(updatedStore.processingJobs[0].errorCode).toBe("upload_not_complete");
  });

  it("classifies unsupported reports safely and does not run AI interpretation", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "b4".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "radiology-mri-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });

    await processWorkflowOnce({ workerId: "worker-a" });
    await processWorkflowOnce({ workerId: "worker-a" });
    await processWorkflowOnce({ workerId: "worker-a" });

    const store = await getStore();
    expect(store.reportFiles[0].status).toBe("unsupported");
    expect(store.reportFiles[0].unsupportedReason).toContain("Lyf9 AI will not generate AI-only medical insights");
    expect(store.processingJobs[0].status).toBe("blocked");
    expect(store.processingJobs[0].errorCode).toBe("unsupported_report_type");
    expect(store.biomarkerResults).toHaveLength(0);
    expect(store.healthInsights).toHaveLength(0);
    expect(store.modelRuns).toHaveLength(0);
    expect(store.auditLogs.some((log) => log.action === "report_classification_unsupported")).toBe(true);
  });

  it("runs durable schema-first AI steps and routes low confidence to review", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "b5".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });

    for (let index = 0; index < 9; index += 1) {
      await processWorkflowOnce({ workerId: "worker-a" });
    }

    const store = await getStore();
    expect(store.processingJobs[0].status).toBe("completed");
    expect(store.processingJobs[0].currentState).toBe("low_confidence_review_required");
    expect(store.modelRuns.map((run) => run.taskType)).toContain("extract_biomarkers");
    expect(store.modelRuns.map((run) => run.taskType)).toContain("patient_explanation");
    expect(store.modelRuns.every((run) => run.inputHash && run.outputHash)).toBe(true);
    expect(store.biomarkerResults.length).toBeGreaterThan(0);
    expect(store.healthInsights[0].status).toBe("doctor_review_required");
    expect(store.healthInsights[0].disclaimer).toContain("not a diagnosis or prescription");
    expect(store.auditLogs.some((log) => log.action === "biomarker_extraction_started")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "biomarker_normalization_completed")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "biomarker_validation_completed")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "safety_rules_completed")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "patient_explanation_completed")).toBe(true);
  });

  it("blocks durable AI extraction when OpenAI config is missing in deployed env", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "b6".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });

    for (let index = 0; index < 3; index += 1) {
      await processWorkflowOnce({ workerId: "worker-a" });
    }

    const previousAppEnv = process.env.APP_ENV;
    const previousProvider = process.env.AI_PROVIDER;
    const previousApiKey = process.env.OPENAI_API_KEY;
    const previousBestEffort = process.env.ALLOW_BEST_EFFORT_WORKFLOW_CLAIM;
    try {
      process.env.APP_ENV = "production";
      process.env.AI_PROVIDER = "openai";
      process.env.ALLOW_BEST_EFFORT_WORKFLOW_CLAIM = "true";
      delete process.env.OPENAI_API_KEY;
      await processWorkflowOnce({ workerId: "worker-a" });
    } finally {
      restoreEnv("APP_ENV", previousAppEnv);
      restoreEnv("AI_PROVIDER", previousProvider);
      restoreEnv("OPENAI_API_KEY", previousApiKey);
      restoreEnv("ALLOW_BEST_EFFORT_WORKFLOW_CLAIM", previousBestEffort);
    }

    const store = await getStore();
    expect(store.processingJobs[0].status).toBe("blocked");
    expect(store.processingJobs[0].errorCode).toBe("ai_configuration_required");
    expect(store.modelRuns[0].status).toBe("failed");
    expect(store.auditLogs.some((log) => log.action === "ai_configuration_required")).toBe(true);
  });

  it("blocks durable workflow when malware scan fails", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "a3".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "virus-test-cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    await processWorkflowOnce({ workerId: "worker-a" });
    const store = await getStore();

    expect(store.reportFiles[0].scanStatus).toBe("scan_failed");
    expect(store.processingJobs[0].status).toBe("blocked");
    expect(store.processingJobs[0].errorCode).toBe("malware_scan_failed");
    expect(store.auditLogs.some((log) => log.action === "malware_scan_failed")).toBe(true);
  });

  it("blocks durable workflow when malware scanner configuration is required", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "a4".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    const previousAppEnv = process.env.APP_ENV;
    const previousScanner = process.env.MALWARE_SCANNER_PROVIDER;
    const previousBestEffort = process.env.ALLOW_BEST_EFFORT_WORKFLOW_CLAIM;
    try {
      process.env.APP_ENV = "production";
      process.env.MALWARE_SCANNER_PROVIDER = "mock";
      process.env.ALLOW_BEST_EFFORT_WORKFLOW_CLAIM = "true";
      await processWorkflowOnce({ workerId: "worker-a" });
    } finally {
      restoreEnv("APP_ENV", previousAppEnv);
      restoreEnv("MALWARE_SCANNER_PROVIDER", previousScanner);
      restoreEnv("ALLOW_BEST_EFFORT_WORKFLOW_CLAIM", previousBestEffort);
    }
    const store = await getStore();

    expect(store.reportFiles[0].scanStatus).toBe("scan_configuration_required");
    expect(store.processingJobs[0].status).toBe("blocked");
    expect(store.auditLogs.some((log) => log.action === "malware_scan_configuration_required")).toBe(true);
  });

  it("allows dev-only scan skip locally and blocks it in staging", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "a5".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "skip-dev-only-cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    await processWorkflowOnce({ workerId: "worker-a" });
    expect((await getStore()).reportFiles[0].scanStatus).toBe("scan_skipped_dev_only");

    await resetReportStoreForTests();
    const stagingInit = await createUploadInit({
      ...metadata,
      checksumSha256: "a6".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "skip-dev-only-cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: stagingInit.reportFile.id });
    const previousAppEnv = process.env.APP_ENV;
    const previousAllow = process.env.ALLOW_MOCK_MALWARE_SCAN_IN_DEPLOYED_ENV;
    const previousBestEffort = process.env.ALLOW_BEST_EFFORT_WORKFLOW_CLAIM;
    try {
      process.env.APP_ENV = "staging";
      process.env.ALLOW_MOCK_MALWARE_SCAN_IN_DEPLOYED_ENV = "true";
      process.env.ALLOW_BEST_EFFORT_WORKFLOW_CLAIM = "true";
      await processWorkflowOnce({ workerId: "worker-a" });
    } finally {
      restoreEnv("APP_ENV", previousAppEnv);
      restoreEnv("ALLOW_MOCK_MALWARE_SCAN_IN_DEPLOYED_ENV", previousAllow);
      restoreEnv("ALLOW_BEST_EFFORT_WORKFLOW_CLAIM", previousBestEffort);
    }
    const store = await getStore();
    expect(store.reportFiles[0].scanStatus).toBe("scan_skipped_dev_only");
    expect(store.processingJobs[0].status).toBe("blocked");
    expect(store.processingJobs[0].errorCode).toBe("malware_scan_failed");
  });

  it("deleted and rejected reports cannot be processed", async () => {
    await resetReportStoreForTests();
    const deletedInit = await createUploadInit({
      ...metadata,
      checksumSha256: "a7".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: deletedInit.reportFile.id });
    await deleteReportFile({ ...metadata, actorRole: "user", reportFileId: deletedInit.reportFile.id });
    await processWorkflowOnce({ workerId: "worker-a" });
    expect((await getStore()).processingJobs[0].errorCode).toBe("deleted_report");
  });

  it("blocked and failed jobs are visible and user status hides internal errors", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "a8".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "virus-test-cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    await processWorkflowOnce({ workerId: "worker-a" });
    const admin = await listAdminReports();
    const store = await getStore();

    expect(admin.queues.blockedJobs).toHaveLength(1);
    expect(getUserFacingReportStatus({ job: store.processingJobs[0], reportFile: store.reportFiles[0] })).toBe(
      "Security scan failed"
    );
  });

  it("manual admin retry requeues blocked jobs", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "a9".repeat(32),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "virus-test-cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    await processWorkflowOnce({ workerId: "worker-a" });
    const retry = await retryProcessingJob({
      actorUserId: "admin@lyf9.ai",
      jobId: (await getStore()).processingJobs[0].id,
      reason: "Scanner configuration changed."
    });

    expect(retry.retryQueued).toBe(true);
    expect(retry.job.status).toBe("queued");
  });

  it("classifies clearly unsupported reports without extraction or interpretation", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "d".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "chest-xray.pdf"
    });

    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("radiology-report.txt")),
      reportFileId: init.reportFile.id
    });

    const store = await getStore();
    expect(store.processingJobs[0].currentState).toBe("unsupported");
    expect(store.processingJobs[0].status).toBe("completed");
    expect(store.labReports[0].reportType).toBe("unsupported");
    expect(store.labReports[0].rawExtractedText).toBeNull();
    expect(store.reportFiles[0].unsupportedReason).toContain("Radiology");
    expect(store.biomarkerResults).toHaveLength(0);
    expect(store.healthInsights).toHaveLength(0);
  });

  it("routes critical values to review and records risk flags", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "e".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "glucose-report.pdf"
    });

    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("critical-glucose-report.txt")),
      reportFileId: init.reportFile.id
    });

    const store = await getStore();
    expect(store.processingJobs[0].currentState).toBe("critical_review_required");
    expect(store.healthInsights[0].status).toBe("doctor_review_required");
    expect(store.healthRiskFlags.some((flag) => flag.flagType === "critical_value")).toBe(true);
  });

  it("routes low-confidence extraction to review", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "f".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-low-confidence.pdf"
    });

    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("low-confidence-report.txt")),
      reportFileId: init.reportFile.id
    });

    const store = await getStore();
    expect(store.processingJobs[0].currentState).toBe("low_confidence_review_required");
    expect(store.healthRiskFlags.some((flag) => flag.flagType === "low_confidence")).toBe(true);
  });

  it("returns report details with source-linked marker cards", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "h".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });

    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      reportFileId: init.reportFile.id
    });

    const details = await getReportDetails(metadata.userId, init.reportFile.id);
    expect(details?.healthInsight?.sourceBiomarkerIds.length).toBeGreaterThan(0);
    expect(details?.markerCards[0].biomarker.sourceText).toContain("Hemoglobin");
    expect(details?.markerCards[0].group).toBe("normal");
  });

  it("creates reminders and feedback records for report results", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "i".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });

    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      reportFileId: init.reportFile.id
    });

    const reminder = await createRetestReminder({
      canonicalBiomarkerKey: "hemoglobin",
      note: "Ask doctor if repeat testing is useful.",
      reminderDate: "2026-08-01",
      reportFileId: init.reportFile.id,
      title: "Discuss CBC retest",
      userId: metadata.userId
    });
    const feedback = await createFeedbackEvent({
      confusingText: "Reference range",
      feedbackSurface: "report_result",
      freeText: "Helpful source trace.",
      helpful: "yes",
      reportFileId: init.reportFile.id,
      userId: metadata.userId,
      wouldTrustDoctorReview: "yes"
    });
    const details = await getReportDetails(metadata.userId, init.reportFile.id);

    expect(reminder.status).toBe("scheduled");
    expect(feedback.status).toBe("new");
    expect(details?.reminders).toHaveLength(1);
    expect(details?.feedbackEvents).toHaveLength(1);
  });

  it("persists payment placeholders and analytics events", async () => {
    await resetReportStoreForTests();
    const payment = await startPayment({
      productType: "doctor_reviewed_report",
      reportFileId: null,
      userId: metadata.userId
    });
    const completed = await completePayment({
      paymentId: payment.id,
      userId: metadata.userId
    });
    const event = await trackAnalyticsEvent({
      eventName: "marker_card_opened",
      metadata: { biomarkerResultId: "marker-1" },
      userId: metadata.userId
    });
    const store = await getStore();

    expect(payment.status).toBe("started");
    expect(payment.provider).toBe("razorpay_sandbox_placeholder");
    expect(payment.publicLaunchEnabled).toBe(false);
    expect(completed.status).toBe("completed");
    expect(event.eventName).toBe("marker_card_opened");
    expect(store.analyticsEvents.map((item) => item.eventName)).toEqual([
      "payment_started",
      "payment_completed",
      "marker_card_opened"
    ]);
    expect(store.auditLogs.some((log) => log.action === "payment_started")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "payment_completed")).toBe(true);
  });

  it("creates and redeems beta invite codes", async () => {
    await resetReportStoreForTests();
    const previousMode = process.env.LYF9_BETA_ACCESS_MODE;
    process.env.LYF9_BETA_ACCESS_MODE = "invite_code";
    const invite = await createBetaInvite({
      actorUserId: "admin@lyf9.ai",
      email: "early@example.com"
    });

    expect(
      await validateAndRedeemBetaInvite({
        email: "early@example.com",
        inviteCode: "wrong"
      })
    ).toMatchObject({ ok: false });
    expect(
      await validateAndRedeemBetaInvite({
        email: "early@example.com",
        inviteCode: invite.inviteCode
      })
    ).toEqual({ ok: true, reason: null });

    const store = await getStore();
    expect(store.betaInvites[0].status).toBe("redeemed");
    expect(store.auditLogs.some((log) => log.action === "beta_invite_created")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "beta_invite_redeemed")).toBe(true);
    process.env.LYF9_BETA_ACCESS_MODE = previousMode;
  });

  it("creates notification placeholders for reminders and completed processing", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "n".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      reportFileId: init.reportFile.id
    });
    await createRetestReminder({
      canonicalBiomarkerKey: "hemoglobin",
      note: null,
      reminderDate: "2026-08-01",
      reportFileId: init.reportFile.id,
      title: "Discuss CBC retest",
      userId: metadata.userId
    });
    const store = await getStore();

    expect(store.notifications.map((item) => item.eventType)).toEqual([
      "report_processing_complete",
      "retest_reminder"
    ]);
    expect(store.notifications.every((item) => item.provider === "email_placeholder")).toBe(true);
  });

  it("exports and deletes user data internally with audit records", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "o".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      reportFileId: init.reportFile.id
    });
    await createFeedbackEvent({
      confusingText: null,
      feedbackSurface: "dashboard",
      freeText: "Dashboard feedback",
      helpful: "yes",
      reportFileId: null,
      userId: metadata.userId,
      wouldTrustDoctorReview: "yes"
    });

    const exported = await createDataExport({
      actorRole: "admin",
      actorUserId: "admin@lyf9.ai",
      targetUserId: metadata.userId
    });
    const deleted = await createDataDeletion({
      actorRole: "admin",
      actorUserId: "admin@lyf9.ai",
      targetUserId: metadata.userId
    });
    const store = await getStore();

    expect((exported.exportJson?.reportFiles as unknown[]).length).toBe(1);
    expect(deleted.deletedRecordCounts?.reportFiles).toBe(1);
    expect(store.reportFiles).toHaveLength(0);
    expect(store.feedbackEvents).toHaveLength(0);
    expect(store.auditLogs.some((log) => log.action === "data_export_completed")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "data_delete_completed")).toBe(true);
  });

  it("builds timeline trends for repeated canonical biomarkers", async () => {
    await resetReportStoreForTests();
    const first = await createUploadInit({
      ...metadata,
      checksumSha256: "j".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-first.pdf"
    });
    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      reportFileId: first.reportFile.id
    });
    const second = await createUploadInit({
      ...metadata,
      checksumSha256: "k".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-second.pdf"
    });
    await completeUpload({
      ...metadata,
      bytes: Buffer.from((await readFixture("cbc-report.txt")).replace("13.4", "13.9")),
      reportFileId: second.reportFile.id
    });

    const timeline = await listHealthTimeline(metadata.userId);
    const hemoglobinTrend = timeline.trendSeries.find(
      (series) => series.canonicalBiomarkerKey === "hemoglobin"
    );
    const details = await getReportDetails(metadata.userId, second.reportFile.id);

    expect(timeline.timeline).toHaveLength(2);
    expect(hemoglobinTrend?.points).toHaveLength(2);
    expect(details?.markerCards.find((card) => card.biomarker.canonicalBiomarkerKey === "hemoglobin")?.previousValue?.value).toBe(13.4);
  });

  it("stores admin biomarker corrections separately and audits them", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "l".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      reportFileId: init.reportFile.id
    });
    const storeBefore = await getStore();
    const marker = storeBefore.biomarkerResults[0];

    await correctBiomarker({
      actorUserId: "admin@lyf9.ai",
      biomarkerResultId: marker.id,
      canonicalName: marker.canonicalName,
      confidenceScore: 0.99,
      ipAddress: "127.0.0.1",
      rawName: marker.rawName,
      reason: "Verified against source text.",
      referenceHigh: marker.referenceHigh,
      referenceLow: marker.referenceLow,
      referenceRangeText: marker.referenceRangeText,
      requestId: "correction-test",
      reviewRouting: "auto_accept",
      sourceText: marker.sourceText,
      systemFlag: "normal",
      unit: marker.unit,
      userAgent: "vitest",
      valueNumeric: 13.5,
      valueText: null
    });

    const store = await getStore();
    const corrected = store.biomarkerResults.find((candidate) => candidate.id === marker.id);
    expect(corrected?.valueNumeric).toBe(marker.valueNumeric);
    expect(corrected?.correctedValueNumeric).toBe(13.5);
    expect(corrected?.isManuallyCorrected).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "admin_biomarker_corrected")).toBe(true);
  });

  it("scopes doctor reviews to assigned doctors and publishes only approved output", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "m".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "glucose-report.pdf"
    });
    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("critical-glucose-report.txt")),
      reportFileId: init.reportFile.id
    });
    const storeBefore = await getStore();
    const insight = storeBefore.healthInsights[0];

    const review = await assignDoctorReview({
      actorUserId: "admin@lyf9.ai",
      assignedDoctorEmail: "doctor@lyf9.ai",
      healthInsightId: insight.id,
      ipAddress: "127.0.0.1",
      priority: "urgent",
      requestId: "assign-test",
      userAgent: "vitest"
    });

    expect(await listDoctorReviews("other-doctor@lyf9.ai")).toHaveLength(0);
    expect(await getDoctorReviewDetail("other-doctor@lyf9.ai", review.id)).toBeNull();
    expect(await listDoctorReviews("doctor@lyf9.ai")).toHaveLength(1);

    await applyDoctorReviewAction({
      action: "reject",
      doctorEmail: "doctor@lyf9.ai",
      editedSummary: null,
      ipAddress: "127.0.0.1",
      notes: "Source unclear.",
      reason: "Need a clearer report copy.",
      requestId: "reject-test",
      reviewId: review.id,
      userAgent: "vitest"
    });
    expect((await getStore()).healthInsights[0].status).toBe("rejected");

    const secondReview = await assignDoctorReview({
      actorUserId: "admin@lyf9.ai",
      assignedDoctorEmail: "doctor@lyf9.ai",
      healthInsightId: insight.id,
      ipAddress: "127.0.0.1",
      priority: "urgent",
      requestId: "assign-test-2",
      userAgent: "vitest"
    });
    await applyDoctorReviewAction({
      action: "edit_and_approve",
      doctorEmail: "doctor@lyf9.ai",
      editedSummary: "Doctor-reviewed summary: discuss this flagged glucose result with a qualified doctor.",
      ipAddress: "127.0.0.1",
      notes: "Approved with cautious wording.",
      reason: null,
      requestId: "approve-test",
      reviewId: secondReview.id,
      userAgent: "vitest"
    });

    const store = await getStore();
    expect(store.healthInsights[0].status).toBe("doctor_reviewed");
    expect(store.healthInsights[0].doctorReviewedBy).toBe("doctor@lyf9.ai");
    expect(store.auditLogs.some((log) => log.action === "doctor_review_assigned")).toBe(true);
    expect(store.auditLogs.some((log) => log.action === "doctor_review_action")).toBe(true);
  });
});

describe("document parser", () => {
  it("exposes a parser interface and extracts fixture text/tables", async () => {
    const result = await localDocumentParser.parse({
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      filename: "cbc-report.pdf",
      mimeType: "application/pdf"
    });

    expect(localDocumentParser.parserName).toBe("local_text_parser");
    expect(result.status).toBe("text_extracted");
    expect(result.extractedText).toContain("Hemoglobin");
    expect(result.extractedTablesJson[0][0]).toEqual(["Test", "Result", "Unit", "Reference"]);
  });
});

describe("biomarker extraction and safety", () => {
  it("normalizes aliases using the v1 catalog", () => {
    expect(findCatalogByAlias("Hb")?.canonicalKey).toBe("hemoglobin");
    expect(findCatalogByAlias("SGPT")?.canonicalKey).toBe("sgpt_alt");
    expect(findCatalogByAlias("Unknown Marker")).toBeNull();
  });

  it("validates strict extraction schema output", async () => {
    const parsed = await localDocumentParser.parse({
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      filename: "cbc-report.pdf",
      mimeType: "application/pdf"
    });
    const output = extractBiomarkersFromDocument({
      extractedTablesJson: parsed.extractedTablesJson,
      extractedText: parsed.extractedText ?? "",
      reportId: "report-1",
      reportType: "cbc"
    });

    expect(validateBiomarkerExtractionOutput(output).ok).toBe(true);
    expect(output.biomarkers[0]).toMatchObject({
      canonical_name: "Hemoglobin",
      raw_name: "Hemoglobin",
      source_text: "Hemoglobin | 13.4 | g/dL | 12.0-15.0",
      unit: "g/dL"
    });
  });

  it("applies confidence threshold routing", () => {
    expect(routeBiomarkerReview(0.96, false, "normal", null)).toBe("auto_accept");
    expect(routeBiomarkerReview(0.9, false, "normal", null)).toBe("soft_review");
    expect(routeBiomarkerReview(0.79, false, "normal", null)).toBe("manual_review_required");
    expect(routeBiomarkerReview(0.99, true, "critical", null)).toBe("critical_review_required");
  });

  it("blocks unsafe diagnosis and prescription language", () => {
    expect(runUnsafeLanguageFilter("You have diabetes.").blocked).toBe(true);
    expect(runUnsafeLanguageFilter("Start metformin today.").blocked).toBe(true);
    expect(runUnsafeLanguageFilter("No doctor needed.").blocked).toBe(true);
    expect(runUnsafeLanguageFilter("Please discuss this marker with a doctor.").blocked).toBe(false);
    expect(
      runUnsafeLanguageFilter("This value may need urgent medical attention, especially if you have symptoms.").blocked
    ).toBe(false);
  });

  it("validates safe explanation schema", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "g".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });

    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("cbc-report.txt")),
      reportFileId: init.reportFile.id
    });

    const store = await getStore();
    const explanation = generateSafeExplanation({
      biomarkers: store.biomarkerResults,
      requiresDoctorReview: false
    });
    expect(validateExplanationOutput(explanation).ok).toBe(true);
    expect(runUnsafeLanguageFilter(JSON.stringify(explanation)).blocked).toBe(false);
  });

  it("validates schema-first AI outputs and rejects unsafe explanations", async () => {
    const provider = new MockAiProvider();
    const biomarkerOutput = await provider.extractBiomarkers({
      extractedDocumentId: "document-1",
      extractedText: await readFixture("cbc-report.txt"),
      labReportId: "report-1",
      reportFileId: "file-1",
      userId: metadata.userId
    });
    const explanation = await provider.generatePatientExplanation({
      biomarkers: [],
      labReportId: "report-1",
      userId: metadata.userId
    });

    expect(validateBiomarkerExtractionSchema(biomarkerOutput).ok).toBe(true);
    expect(validateBiomarkerExtractionSchema({
      biomarkers: [{ confidence: 1, source_text: "13.4", value_numeric: 13.4 }],
      report_metadata: {}
    } as never).ok).toBe(false);
    expect(validatePatientExplanationSchema({
      ...explanation,
      disclaimer: "missing required safety copy",
      source_biomarker_ids: ["marker-1"]
    }).ok).toBe(false);
    expect(runUnsafeLanguageFilter("You have diabetes and no need to consult a doctor.").blocked).toBe(true);
  });

  it("blocks mock AI in deployed env and OpenAI fails closed without config", async () => {
    const previousAppEnv = process.env.APP_ENV;
    const previousProvider = process.env.AI_PROVIDER;
    const previousApiKey = process.env.OPENAI_API_KEY;
    const previousModel = process.env.OPENAI_MODEL_EXTRACTION;
    try {
      process.env.APP_ENV = "staging";
      process.env.AI_PROVIDER = "mock";
      expect(() => getAiProvider()).toThrow("Mock AI provider is disabled");

      process.env.AI_PROVIDER = "openai";
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_MODEL_EXTRACTION;
      await expect(new OpenAiStructuredOutputsProvider().extractBiomarkers()).rejects.toThrow("ai_configuration_required");
    } finally {
      restoreEnv("APP_ENV", previousAppEnv);
      restoreEnv("AI_PROVIDER", previousProvider);
      restoreEnv("OPENAI_API_KEY", previousApiKey);
      restoreEnv("OPENAI_MODEL_EXTRACTION", previousModel);
    }
  });

  it("normalizes biomarkers, preserves source fields, and routes review", async () => {
    const provider = new MockAiProvider();
    const output = await provider.extractBiomarkers({
      extractedDocumentId: "document-1",
      extractedText: await readFixture("low-confidence-report.txt"),
      labReportId: "report-1",
      reportFileId: "file-1",
      userId: metadata.userId
    });
    const normalized = normalizeBiomarkerItems({
      aiModelRunId: "model-run-1",
      extractedDocumentId: "document-1",
      items: [
        ...output.biomarkers,
        {
          confidence: 0.99,
          raw_name: "Mystery Marker",
          source_text: "Mystery Marker | 10 | mg/dL",
          unit: "mg/dL",
          value_numeric: 10
        }
      ],
      labName: null,
      labReportId: "report-1",
      now: "2026-06-12T00:00:00.000Z",
      reportDate: null,
      reportFileId: "file-1",
      reportType: "cbc",
      userId: metadata.userId
    });

    expect(normalized.find((marker) => marker.rawName === "Hemoglobin")?.canonicalName).toBe("Hemoglobin");
    expect(normalized.find((marker) => marker.rawName === "Hemoglobin")?.reviewRouting).toBe("manual_review_required");
    expect(normalized.find((marker) => marker.rawName === "Mystery Marker")?.normalizationStatus).toBe("unmapped");
    expect(normalized.find((marker) => marker.rawName === "Mystery Marker")?.referenceRangeText).toBeNull();
  });

  it("routes critical markers through deterministic safety rules", () => {
    const critical = normalizeBiomarkerItems({
      aiModelRunId: "model-run-1",
      extractedDocumentId: "document-1",
      items: [{
        confidence: 0.99,
        raw_name: "Fasting glucose",
        reference_high: 100,
        reference_low: 70,
        reference_range_text: "70-100",
        source_text: "Fasting glucose | 340 | mg/dL | 70-100",
        unit: "mg/dL",
        value_numeric: 340
      }],
      labName: null,
      labReportId: "report-1",
      now: "2026-06-12T00:00:00.000Z",
      reportDate: null,
      reportFileId: "file-1",
      reportType: "hba1c_glucose",
      userId: metadata.userId
    });

    expect(runMedicalSafetyRules({
      biomarkers: critical,
      labReport: {
        classificationConfidence: 0.9,
        createdAt: "2026-06-12T00:00:00.000Z",
        extractionVersion: 1,
        id: "report-1",
        parserVersion: "test",
        rawExtractedTables: null,
        rawExtractedText: null,
        reportFileId: "file-1",
        reportType: "hba1c_glucose",
        status: "biomarker_validated",
        supportedPanels: ["hba1c_glucose"],
        unsupportedSections: [],
        updatedAt: "2026-06-12T00:00:00.000Z",
        userId: metadata.userId
      }
    }).doctorReviewRequired).toBe(true);
  });
});

describe("result page presentation models", () => {
  it("groups marker cards and trend series from source biomarkers", async () => {
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "l".repeat(64),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "glucose-report.pdf"
    });
    await completeUpload({
      ...metadata,
      bytes: Buffer.from(await readFixture("critical-glucose-report.txt")),
      reportFileId: init.reportFile.id
    });
    const store = await getStore();
    const labReport = store.labReports[0];
    const filesByLabReportId = reportFilesByLabReportId(store.labReports, store.reportFiles);
    const cards = buildMarkerCards({
      currentMarkers: store.biomarkerResults,
      insight: store.healthInsights[0],
      previousMarkers: store.biomarkerResults,
      reportFilesByLabReportId: filesByLabReportId
    });
    const trends = buildTrendSeries({
      markers: store.biomarkerResults,
      reportFilesByLabReportId: filesByLabReportId
    });

    expect(labReport.reportType).toBe("hba1c_glucose");
    expect(cards.some((card) => card.group === "critical")).toBe(true);
    expect(cards.every((card) => card.biomarker.sourceText.length > 0)).toBe(true);
    expect(trends).toHaveLength(0);
  });
});

describe("report classifier", () => {
  it("classifies supported report panels deterministically", async () => {
    await expect(classifyExtractedReport({ extractedText: "Complete Blood Count Hemoglobin WBC", filename: "cbc.pdf" }))
      .resolves.toMatchObject({ reportType: "cbc", status: "supported" });
    await expect(classifyExtractedReport({ extractedText: "Lipid Profile Cholesterol HDL LDL", filename: "lipid.pdf" }))
      .resolves.toMatchObject({ reportType: "lipid", status: "supported" });
    await expect(classifyExtractedReport({ extractedText: "Thyroid TSH T3 T4", filename: "thyroid.pdf" }))
      .resolves.toMatchObject({ reportType: "thyroid", status: "supported" });
    await expect(classifyExtractedReport({ extractedText: "Liver function SGOT SGPT Bilirubin", filename: "lft.pdf" }))
      .resolves.toMatchObject({ reportType: "lft", status: "supported" });
    await expect(classifyExtractedReport({ extractedText: "Kidney function creatinine urea egfr", filename: "kft.pdf" }))
      .resolves.toMatchObject({ reportType: "kft", status: "supported" });
    await expect(classifyExtractedReport({ extractedText: "HbA1c glucose fasting blood sugar", filename: "hba1c.pdf" }))
      .resolves.toMatchObject({ reportType: "hba1c_glucose", status: "supported" });
    await expect(classifyExtractedReport({ extractedText: "Vitamin D Vitamin B12 ferritin", filename: "vitamin.pdf" }))
      .resolves.toMatchObject({ reportType: "vitamin", status: "supported" });
  });

  it("classifies unsupported and unknown reports safely", async () => {
    await expect(classifyExtractedReport({ extractedText: "Radiology X-ray chest", filename: "xray.pdf" }))
      .resolves.toMatchObject({ reportType: "unsupported", status: "unsupported" });
    await expect(classifyExtractedReport({ extractedText: "ECG waveform rhythm strip", filename: "ecg.pdf" }))
      .resolves.toMatchObject({ reportType: "unsupported", status: "unsupported" });
    await expect(classifyExtractedReport({ extractedText: "Histopathology biopsy specimen", filename: "histopathology.pdf" }))
      .resolves.toMatchObject({ reportType: "unsupported", status: "unsupported" });
    await expect(classifyExtractedReport({ extractedText: "Prescription increase dose stop medication", filename: "rx.pdf" }))
      .resolves.toMatchObject({ reportType: "unsupported", status: "unsupported" });
    await expect(classifyExtractedReport({ extractedText: "Random wellness document", filename: "unknown.pdf" }))
      .resolves.toMatchObject({ reportType: "unsupported", status: "unknown" });
  });

  it("marks supported panels and full-body supported reports", async () => {
    expect(classifyReport({ filename: "lipid-profile.pdf" }).reportType).toBe("lipid");
    expect(
      classifyReport({
        extractedText: await readFixture("full-body-supported-report.txt"),
        filename: "annual-health-check.pdf"
      }).reportType
    ).toBe("full_body_supported");
  });

  it("marks limited beta urine reports separately", () => {
    const classification = classifyReport({
      extractedText: "Urine routine specific gravity protein glucose",
      filename: "urine-routine.pdf"
    });

    expect(classification.reportType).toBe("urine_limited");
    expect(classification.supported).toBe(true);
  });

  it("blocks unsupported and standalone cancer marker reports", () => {
    expect(classifyReport({ filename: "brain-mri.pdf" }).supported).toBe(false);
    const cancerMarker = classifyReport({
      extractedText: "CA 125 result 48 U/mL",
      filename: "tumor-marker.pdf"
    });
    expect(cancerMarker.reportType).toBe("unsupported");
    expect(cancerMarker.unsupportedSections).toContain("cancer_marker_standalone");
  });
});

describe("document extraction providers", () => {
  it("mock fixture parser and OCR provider return extracted text", async () => {
    const parsed = await new MockFixtureDocumentParser().parseDocument({
      filename: "cbc-report.pdf",
      mimeType: "application/pdf",
      reportFileId: "report-file",
      storageKey: "reports/user/report-file/mock.pdf"
    });
    const ocr = await new MockOcrProvider().extractText({
      filename: "ocr-cbc-report.png",
      mimeType: "image/png",
      reportFileId: "report-file",
      storageKey: "reports/user/report-file/mock.png"
    });

    expect(parsed.status).toBe("success");
    expect(parsed.extractedText).toContain("Complete Blood Count");
    expect(ocr.status).toBe("success");
    expect(ocr.extractedText).toContain("Complete Blood Count");
  });

  it("mock parser is allowed only in local/test-like environments", () => {
    const previousAppEnv = process.env.APP_ENV;
    try {
      process.env.APP_ENV = "staging";
      expect(() => getDocumentParserProvider()).toThrow("Mock document parser is disabled");
    } finally {
      restoreEnv("APP_ENV", previousAppEnv);
    }
  });

  it("Marker and Textract providers fail closed when not configured", async () => {
    const previousAppEnv = process.env.APP_ENV;
    const previousMarkerCommand = process.env.MARKER_COMMAND;
    const previousMarkerApiUrl = process.env.MARKER_API_URL;
    const previousTextractRegion = process.env.AWS_TEXTRACT_REGION;
    try {
      process.env.APP_ENV = "production";
      delete process.env.MARKER_COMMAND;
      delete process.env.MARKER_API_URL;
      delete process.env.AWS_TEXTRACT_REGION;

      const marker = await new MarkerProvider().parseDocument({
        filename: "cbc-report.pdf",
        mimeType: "application/pdf",
        reportFileId: "report-file",
        storageKey: "reports/user/report-file/mock.pdf"
      });
      const textract = await new TextractOcrProvider().extractText({
        filename: "cbc-report.png",
        mimeType: "image/png",
        reportFileId: "report-file",
        storageKey: "reports/user/report-file/mock.png"
      });

      expect(marker).toMatchObject({ errorCode: "marker_configuration_required", status: "failed" });
      expect(textract).toMatchObject({ errorCode: "ocr_configuration_required", status: "failed" });
    } finally {
      restoreEnv("APP_ENV", previousAppEnv);
      restoreEnv("MARKER_COMMAND", previousMarkerCommand);
      restoreEnv("MARKER_API_URL", previousMarkerApiUrl);
      restoreEnv("AWS_TEXTRACT_REGION", previousTextractRegion);
    }
  });
});

async function readFixture(filename: string) {
  return readFile(path.join(process.cwd(), "src/lib/reports/fixtures", filename), "utf8");
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
