import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const metadata = {
  ipAddress: "127.0.0.1",
  requestId: "mock-e2e",
  userAgent: "vitest",
  userId: "qa@example.com"
};

describe("mock report pipeline e2e", () => {
  beforeEach(() => {
    process.env.LYF9_REPORT_STORE_DIR = path.join(process.cwd(), "..", "..", ".local", "reports-mock-e2e");
    vi.resetModules();
  });

  it("runs a supported report through schema-first AI steps", async () => {
    const {
      completeUpload,
      createUploadInit,
      getStore,
      processWorkflowOnce,
      resetReportStoreForTests
    } = await import("../reports/repository");
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "e2e1".repeat(16),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "cbc-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });

    for (let index = 0; index < 9; index += 1) {
      await processWorkflowOnce({ workerId: "qa-worker" });
    }

    const store = await getStore();
    expect(store.processingJobs[0].status).toBe("completed");
    expect(store.biomarkerResults.length).toBeGreaterThan(0);
    expect(store.modelRuns.some((run) => run.taskType === "extract_biomarkers")).toBe(true);
    expect(store.healthInsights[0].disclaimer).toContain("not a diagnosis or prescription");
  });

  it("stops unsupported reports before AI", async () => {
    const {
      completeUpload,
      createUploadInit,
      getStore,
      processWorkflowOnce,
      resetReportStoreForTests
    } = await import("../reports/repository");
    await resetReportStoreForTests();
    const init = await createUploadInit({
      ...metadata,
      checksumSha256: "e2e2".repeat(16),
      fileSizeBytes: 2048,
      mimeType: "application/pdf",
      originalFilename: "radiology-mri-report.pdf"
    });
    await completeUpload({ ...metadata, reportFileId: init.reportFile.id });
    await processWorkflowOnce({ workerId: "qa-worker" });
    await processWorkflowOnce({ workerId: "qa-worker" });
    await processWorkflowOnce({ workerId: "qa-worker" });

    const store = await getStore();
    expect(store.processingJobs[0].errorCode).toBe("unsupported_report_type");
    expect(store.modelRuns).toHaveLength(0);
    expect(store.healthInsights).toHaveLength(0);
  });
});
