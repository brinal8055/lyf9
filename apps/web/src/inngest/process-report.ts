import {
  BIOMARKER_EXTRACTION_SCHEMA_VERSION,
  PATIENT_EXPLANATION_SCHEMA_VERSION,
  biomarkerExtractionPromptVersion,
  getAiProvider,
  hashModelPayload,
  patientExplanationPromptVersion
} from "@/lib/ai";
import { normalizeBiomarkerItems, validateNormalizedBiomarkers } from "@/lib/biomarkers";
import {
  classifyExtractedReport,
  getDocumentParserProvider,
  getOcrProvider,
  type ExtractedDocumentResult
} from "@/lib/document-extraction";
import { minExtractedTextChars } from "@/lib/document-extraction/document-parser-provider";
import { getMalwareScannerProvider, toReportScanStatus } from "@/lib/malware";
import { runUnsafeLanguageFilter } from "@/lib/reports/safety";
import type { ReportType } from "@/lib/reports/types";
import { createSupabaseAtomicWorkflowProvider } from "@/lib/workflow";

import { inngest } from "./client";
import { compensate } from "./compensations";
import {
  fetchReportFileRow,
  insertBiomarkerResults,
  insertExtractedDocument,
  insertHealthInsight,
  insertHealthRiskFlags,
  insertModelRun,
  updateJobState,
  updateLabReportClassification,
  updateReportFileScan,
  updateReportFileStatus
} from "./pipeline-writers";

const WORKER_ID = "inngest-saga";
const EXTRACTION_VERSION = 1;

export type ReportConfirmedEvent = {
  data: {
    jobId: string;
    labReportId: string;
    reportFileId: string;
    userId: string;
  };
  name: "report/confirmed";
};

export const processReport = inngest.createFunction(
  {
    concurrency: { limit: 10 },
    id: "process-report",
    retries: 3,
    triggers: [{ event: "report/confirmed" }]
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ event, step }: { event: ReportConfirmedEvent; step: any }) => {
    const { jobId, labReportId, reportFileId, userId } = event.data;
    const workflow = createSupabaseAtomicWorkflowProvider();
    const completedSteps: string[] = [];

    try {
      // ── Step 1: Malware scan ────────────────────────────────────────────────
      const scan = await step.run("malware-scan", async () => {
        await workflow.runJobStep({ jobId, stepName: "malware_scan", workerId: WORKER_ID });
        await updateJobState(jobId, "malware_scan");
        const reportFile = await fetchReportFileRow(reportFileId);
        const result = await getMalwareScannerProvider().scanFile({
          mimeType: String(reportFile.mime_type ?? ""),
          reportFileId,
          storageKey: String(reportFile.storage_key ?? "")
        });
        const scanStatus = toReportScanStatus(result.status);
        await updateReportFileScan(reportFileId, scanStatus, scanStatus);

        if (scanStatus !== "scan_passed" && scanStatus !== "scan_skipped_dev_only") {
          await workflow.markStepFailed({
            errorCode: scanStatus,
            errorMessage: `Malware scan did not pass (${result.provider}).`,
            jobId,
            retryable: false,
            stepName: "malware_scan"
          });
          await workflow.markJobBlocked({
            errorCode: scanStatus,
            jobId,
            reason: `Malware scan outcome: ${scanStatus}`,
            stepName: "malware_scan"
          });
          await updateJobState(jobId, "failed");
          return { blocked: true, scanStatus };
        }

        await workflow.markStepSucceeded({
          jobId,
          outputSnapshot: { provider: result.provider, scanStatus },
          stepName: "malware_scan"
        });
        await updateJobState(jobId, "scan_passed");
        return { blocked: false, scanStatus };
      });

      if (scan.blocked) {
        return { jobId, reportFileId, status: "blocked", reason: scan.scanStatus };
      }
      completedSteps.push("malware-scan");

      // ── Step 2: Document extraction (parser → OCR fallback) ───────────────
      const extraction = await step.run("extract-document", async () => {
        await workflow.runJobStep({ jobId, stepName: "extract_document", workerId: WORKER_ID });
        await updateJobState(jobId, "text_extraction_pending");
        const reportFile = await fetchReportFileRow(reportFileId);
        const parseParams = {
          filename: String(reportFile.original_filename ?? ""),
          labReportId,
          mimeType: String(reportFile.mime_type ?? ""),
          reportFileId,
          storageKey: String(reportFile.storage_key ?? "")
        };

        const parser = getDocumentParserProvider();
        let result: ExtractedDocumentResult = await parser.parseDocument(parseParams);
        let parserName = parser.name;

        const textTooShort = (result.extractedText?.length ?? 0) < minExtractedTextChars();
        if (result.status === "ocr_required" || (result.status === "low_text_confidence" && textTooShort)) {
          await workflow.runJobStep({ jobId, stepName: "ocr_fallback", workerId: WORKER_ID });
          await updateJobState(jobId, "ocr_required");
          const ocr = getOcrProvider();
          result = await ocr.extractText(parseParams);
          parserName = ocr.name;
          await workflow.markStepSucceeded({
            jobId,
            outputSnapshot: { provider: parserName, status: result.status },
            stepName: "ocr_fallback"
          });
        }

        if (result.status === "failed" || !result.extractedText) {
          await workflow.markStepFailed({
            errorCode: result.errorCode ?? "extraction_failed",
            errorMessage: result.errorMessage ?? "Document extraction failed.",
            jobId,
            retryable: true,
            stepName: "extract_document"
          });
          await workflow.markJobBlocked({
            errorCode: result.errorCode ?? "extraction_failed",
            jobId,
            reason: result.errorMessage ?? "Document extraction failed.",
            stepName: "extract_document"
          });
          await updateReportFileStatus(reportFileId, "extraction_failed");
          await updateJobState(jobId, "extraction_failed");
          return { extractedDocumentId: null, extractedText: null };
        }

        const extractedDocumentId = await insertExtractedDocument({
          extractionVersion: EXTRACTION_VERSION,
          labReportId,
          parserName,
          reportFileId,
          result
        });
        await workflow.markStepSucceeded({
          jobId,
          outputSnapshot: { extractedDocumentId, pageCount: result.pageCount ?? null },
          stepName: "extract_document"
        });
        await updateJobState(jobId, "text_extracted");
        return {
          extractedDocumentId,
          extractedTablesJson: result.extractedTablesJson ?? null,
          extractedText: result.extractedText,
          filename: parseParams.filename
        };
      });

      if (!extraction.extractedDocumentId || !extraction.extractedText) {
        return { jobId, reportFileId, status: "extraction_failed" };
      }
      completedSteps.push("extract-document");

      // ── Step 3: Deterministic classification (blocks unsupported before AI) ─
      const classification = await step.run("classify-report", async () => {
        await workflow.runJobStep({ jobId, stepName: "classify_report", workerId: WORKER_ID });
        const result = await classifyExtractedReport({
          extractedText: extraction.extractedText,
          filename: extraction.filename
        });
        await workflow.markStepSucceeded({
          jobId,
          outputSnapshot: { confidence: result.confidenceScore, status: result.status },
          stepName: "classify_report"
        });
        await updateJobState(jobId, "classified");
        await updateLabReportClassification(labReportId, {
          reportType: result.reportType,
          status: result.status === "supported" || result.status === "limited_beta" ? "classified" : "unsupported",
          unsupportedReason: result.unsupportedReason ?? null
        });

        if (result.status === "unsupported" || result.status === "unknown") {
          await updateReportFileStatus(reportFileId, "unsupported");
          await updateJobState(jobId, "unsupported");
          await workflow.markJobCompleted({ jobId });
        }
        return result;
      });

      if (classification.status === "unsupported" || classification.status === "unknown") {
        return { jobId, reportFileId, status: "unsupported" };
      }
      completedSteps.push("classify-report");

      // ── Step 4: AI biomarker extraction + normalize + validate ─────────────
      const biomarkers = await step.run("extract-biomarkers", async () => {
        await workflow.runJobStep({ jobId, stepName: "extract_biomarkers", workerId: WORKER_ID });
        await updateJobState(jobId, "biomarker_extraction_pending");

        const ai = getAiProvider();
        const aiInput = {
          extractedDocumentId: extraction.extractedDocumentId,
          extractedTablesJson: extraction.extractedTablesJson,
          extractedText: extraction.extractedText,
          labReportId,
          reportFileId,
          userId
        };

        let output;
        try {
          output = await ai.extractBiomarkers(aiInput);
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "ai_extraction_failed";
          await insertModelRun({
            errorCode: "ai_extraction_failed",
            errorMessage: message,
            extractedDocumentId: extraction.extractedDocumentId,
            inputHash: hashModelPayload(aiInput),
            jobId,
            labReportId,
            modelName: process.env.OPENAI_MODEL_EXTRACTION ?? ai.name,
            promptVersion: biomarkerExtractionPromptVersion(),
            provider: ai.name,
            reportFileId,
            schemaVersion: BIOMARKER_EXTRACTION_SCHEMA_VERSION,
            status: "failed",
            taskType: "biomarker_extraction",
            userId
          });
          throw caught;
        }

        const modelRunId = await insertModelRun({
          extractedDocumentId: extraction.extractedDocumentId,
          inputHash: hashModelPayload(aiInput),
          jobId,
          labReportId,
          modelName: process.env.OPENAI_MODEL_EXTRACTION ?? ai.name,
          outputHash: hashModelPayload(output),
          outputJson: output as unknown as Record<string, unknown>,
          promptVersion: biomarkerExtractionPromptVersion(),
          provider: ai.name,
          reportFileId,
          schemaVersion: BIOMARKER_EXTRACTION_SCHEMA_VERSION,
          status: "succeeded",
          taskType: "biomarker_extraction",
          userId
        });
        await workflow.markStepSucceeded({
          jobId,
          outputSnapshot: { biomarkerCount: output.biomarkers.length, modelRunId },
          stepName: "extract_biomarkers"
        });
        await updateJobState(jobId, "biomarker_extracted");

        await workflow.runJobStep({ jobId, stepName: "normalize_biomarkers", workerId: WORKER_ID });
        const normalized = normalizeBiomarkerItems({
          aiModelRunId: modelRunId,
          extractedDocumentId: extraction.extractedDocumentId,
          items: output.biomarkers,
          labName: output.report_metadata.lab_name ?? null,
          labReportId,
          now: new Date().toISOString(),
          reportDate: output.report_metadata.report_date ?? null,
          reportFileId,
          reportType: (classification.reportType ?? "unknown") as ReportType,
          userId
        });
        await workflow.markStepSucceeded({
          jobId,
          outputSnapshot: { normalizedCount: normalized.length },
          stepName: "normalize_biomarkers"
        });
        await updateJobState(jobId, "normalized");

        await workflow.runJobStep({ jobId, stepName: "validate_biomarkers", workerId: WORKER_ID });
        const validation = validateNormalizedBiomarkers(normalized);
        if (!validation.ok) {
          await workflow.markStepFailed({
            errorCode: "biomarker_validation_failed",
            errorMessage: validation.errors.join("; ").slice(0, 900),
            jobId,
            retryable: false,
            stepName: "validate_biomarkers"
          });
          await updateJobState(jobId, "validation_failed");
          throw new Error(`biomarker_validation_failed: ${validation.errors.join("; ")}`);
        }

        const inserted = await insertBiomarkerResults({
          aiModelRunId: modelRunId,
          biomarkers: normalized,
          extractionVersion: EXTRACTION_VERSION,
          labReportId,
          userId
        });
        await workflow.markStepSucceeded({
          jobId,
          outputSnapshot: { insertedCount: inserted.length },
          stepName: "validate_biomarkers"
        });
        await updateJobState(jobId, "validated");

        return { inserted, modelRunId, normalized };
      });
      completedSteps.push("extract-biomarkers");

      // ── Step 5: Patient explanation + deterministic safety filter ──────────
      const explanation = await step.run("generate-explanation", async () => {
        await workflow.runJobStep({
          jobId,
          stepName: "generate_patient_explanation",
          workerId: WORKER_ID
        });
        await updateJobState(jobId, "insight_generation_pending");

        const ai = getAiProvider();
        const withIds = biomarkers.normalized.map(
          (marker: Record<string, unknown>, index: number) => ({
            ...marker,
            id: biomarkers.inserted[index]?.id ?? marker.id
          })
        );
        const output = await ai.generatePatientExplanation({
          biomarkers: withIds,
          labReportId,
          userId
        });
        const modelRunId = await insertModelRun({
          extractedDocumentId: extraction.extractedDocumentId,
          inputHash: hashModelPayload({ labReportId, markerCount: withIds.length }),
          jobId,
          labReportId,
          modelName: process.env.OPENAI_MODEL_EXPLANATION ?? ai.name,
          outputHash: hashModelPayload(output),
          outputJson: output as unknown as Record<string, unknown>,
          promptVersion: patientExplanationPromptVersion(),
          provider: ai.name,
          reportFileId,
          schemaVersion: PATIENT_EXPLANATION_SCHEMA_VERSION,
          status: "succeeded",
          taskType: "patient_explanation",
          userId
        });
        await workflow.markStepSucceeded({
          jobId,
          outputSnapshot: { modelRunId },
          stepName: "generate_patient_explanation"
        });
        await updateJobState(jobId, "insight_generated");

        await workflow.runJobStep({ jobId, stepName: "run_safety_rules", workerId: WORKER_ID });
        const safety = runUnsafeLanguageFilter(JSON.stringify(output));
        await workflow.markStepSucceeded({
          jobId,
          outputSnapshot: { blocked: safety.blocked, matchedCount: safety.matchedPhrases.length },
          stepName: "run_safety_rules"
        });

        return { modelRunId, output, safety };
      });
      completedSteps.push("generate-explanation");

      // ── Step 6: Route review + publish ──────────────────────────────────────
      const final = await step.run("route-and-publish", async () => {
        await workflow.runJobStep({ jobId, stepName: "route_review", workerId: WORKER_ID });

        const criticalMarkers = biomarkers.inserted.filter(
          (marker: { isCritical: boolean }) => marker.isCritical
        );
        const reviewMarkers = biomarkers.inserted.filter(
          (marker: { reviewRouting: string }) =>
            marker.reviewRouting === "manual_review_required" ||
            marker.reviewRouting === "critical_review_required"
        );
        const unsafeOutput = explanation.safety.blocked;
        const doctorReviewNeeded =
          criticalMarkers.length > 0 ||
          reviewMarkers.length > 0 ||
          explanation.output.doctor_review_recommended;

        const insightStatus = unsafeOutput
          ? "admin_review_pending"
          : doctorReviewNeeded
            ? "doctor_review_pending"
            : "ai_only_published";

        await insertHealthRiskFlags({
          flags: [
            ...criticalMarkers.map((marker: { id: string }) => ({
              biomarkerResultId: marker.id,
              flagType: "critical_value",
              reason: "Deterministic critical-value rule matched.",
              severity: "critical"
            })),
            ...(unsafeOutput
              ? [
                  {
                    biomarkerResultId: null,
                    flagType: "unsafe_ai_output",
                    reason: `Safety filter matched: ${explanation.safety.matchedPhrases.join(", ").slice(0, 400)}`,
                    severity: "high"
                  }
                ]
              : [])
          ],
          labReportId,
          reportFileId,
          userId
        });

        await insertHealthInsight({
          aiModelRunId: explanation.modelRunId,
          disclaimer: explanation.output.disclaimer,
          labReportId,
          output: explanation.output,
          safetyFlags: explanation.safety.matchedPhrases,
          sourceBiomarkerIds: biomarkers.inserted.map((marker: { id: string }) => marker.id),
          status: insightStatus,
          userId
        });
        await workflow.markStepSucceeded({
          jobId,
          outputSnapshot: { insightStatus },
          stepName: "route_review"
        });

        await workflow.runJobStep({ jobId, stepName: "publish_result", workerId: WORKER_ID });
        const jobState = unsafeOutput
          ? "critical_review_required"
          : doctorReviewNeeded
            ? "doctor_review_required"
            : "published";
        await updateJobState(jobId, jobState);
        await updateLabReportClassification(labReportId, {
          reportType: classification.reportType,
          status: jobState
        });
        await workflow.markStepSucceeded({
          jobId,
          outputSnapshot: { jobState },
          stepName: "publish_result"
        });
        await workflow.markJobCompleted({ jobId });

        return { insightStatus, jobState };
      });

      return { jobId, reportFileId, status: final.jobState };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "processing_failed";
      await step.run("compensate", async () => {
        for (const name of [...completedSteps].reverse()) {
          await compensate(reportFileId, name);
        }
        await workflow.markJobBlocked({ jobId, reason: reason.slice(0, 900) });
        await updateJobState(jobId, "failed");
        await updateReportFileStatus(reportFileId, "failed");
      });
      throw error;
    }
  }
);
