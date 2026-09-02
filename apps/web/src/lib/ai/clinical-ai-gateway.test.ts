import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeBiomarkerItems } from "../biomarkers";
import type { AiProvider } from "./ai-provider";
import { ClinicalAiGateway } from "./clinical-ai-gateway";
import { GeminiStructuredOutputsProvider } from "./gemini-structured-provider";
import { getAiProvider, getAiRuntimeStatus } from "./index";
import { MockAiProvider } from "./mock-ai-provider";
import { OpenAiStructuredOutputsProvider } from "./openai-structured-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("clinical AI provider boundary", () => {
  it("fails closed for an unknown provider", () => {
    process.env.APP_ENV = "staging";
    process.env.AI_PROVIDER = "unexpected-provider";

    expect(() => getAiProvider()).toThrow("ai_provider_unsupported");
    expect(getAiRuntimeStatus().readyForReportPipeline).toBe(false);
  });

  it("requires both report-pipeline Gemini capabilities", () => {
    process.env.APP_ENV = "staging";
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL_EXTRACTION = "gemini-2.5-flash";
    delete process.env.GEMINI_MODEL_EXPLANATION;

    expect(getAiRuntimeStatus()).toMatchObject({
      capabilities: {
        biomarker_extraction: { configured: true },
        patient_explanation: { configured: false }
      },
      providerId: "gemini",
      readyForReportPipeline: false
    });

    process.env.GEMINI_MODEL_EXPLANATION = "gemini-2.5-flash";
    expect(getAiRuntimeStatus().readyForReportPipeline).toBe(true);
  });

  it("overrides model-authored marker facts and review routing", async () => {
    const biomarkers = normalizedMarkers();
    class AlteredFactsProvider extends MockAiProvider {
      override async generatePatientExplanation(params: Parameters<AiProvider["generatePatientExplanation"]>[0]) {
        const output = await super.generatePatientExplanation(params);
        const marker = output.normal_markers[0];
        return {
          ...output,
          doctor_review_recommended: false,
          normal_markers: marker
            ? [{ ...marker, display_name: "Wrong name", status: "critical" as const, value_display: "999" }]
            : []
        };
      }
    }

    const result = await new ClinicalAiGateway(new AlteredFactsProvider()).generatePatientExplanation({
      biomarkers,
      labReportId: "report-1",
      userId: "user-1"
    });

    expect(result.output.normal_markers[0]).toMatchObject({
      display_name: "Hemoglobin",
      status: "normal",
      value_display: "13.5 g/dL"
    });
    expect(result.output.doctor_review_recommended).toBe(true);
    expect(result.output.disclaimer).toContain("not a diagnosis or prescription");
  });

  it("rejects explanations whose source trace does not match persisted biomarkers", async () => {
    const biomarkers = normalizedMarkers();
    class InvalidTraceProvider extends MockAiProvider {
      override async generatePatientExplanation(params: Parameters<AiProvider["generatePatientExplanation"]>[0]) {
        const output = await super.generatePatientExplanation(params);
        return { ...output, source_biomarker_ids: ["unknown-result"] };
      }
    }

    await expect(
      new ClinicalAiGateway(new InvalidTraceProvider()).generatePatientExplanation({
        biomarkers,
        labReportId: "report-1",
        userId: "user-1"
      })
    ).rejects.toMatchObject({ code: "ai_schema_validation_failed", message: "ai_schema_validation_failed" });
  });

  it("retries one transient provider failure", async () => {
    process.env.AI_PROVIDER_RETRY_BASE_MS = "0";
    class FlakyProvider extends MockAiProvider {
      attempts = 0;

      override async extractBiomarkers(params: Parameters<AiProvider["extractBiomarkers"]>[0]) {
        this.attempts += 1;
        if (this.attempts === 1) throw new Error("provider_request_failed_503");
        return super.extractBiomarkers(params);
      }
    }

    const provider = new FlakyProvider();
    const result = await new ClinicalAiGateway(provider).extractBiomarkers({
      extractedDocumentId: "document-1",
      extractedText: "Hemoglobin | 13.5 | g/dL | 12-16",
      labReportId: "report-1",
      reportFileId: "file-1",
      userId: "user-1"
    });

    expect(provider.attempts).toBe(2);
    expect(result.output.biomarkers.length).toBeGreaterThan(0);
  });

  it("uses a header for Gemini credentials and returns sanitized provider errors", async () => {
    configureGemini();
    process.env.AI_PROVIDER_RETRY_BASE_MS = "0";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "sensitive upstream detail" } }), { status: 429 })
    );
    const gateway = new ClinicalAiGateway(new GeminiStructuredOutputsProvider());

    await expect(
      gateway.extractBiomarkers({
        extractedDocumentId: "document-1",
        extractedText: "Hemoglobin | 13.5 | g/dL | 12-16",
        labReportId: "report-1",
        reportFileId: "file-1",
        userId: "user-1"
      })
    ).rejects.toMatchObject({ code: "ai_provider_unavailable", message: "ai_provider_unavailable" });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(url)).not.toContain("test-gemini-key");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("test-gemini-key");
  });

  it.each([
    {
      body: { error: { message: "This model is no longer available.", status: "NOT_FOUND" } },
      expectedCode: "ai_model_unavailable",
      status: 404
    },
    {
      body: { error: { message: "Your prepayment credits are depleted.", status: "RESOURCE_EXHAUSTED" } },
      expectedCode: "ai_provider_quota_exhausted",
      status: 429
    },
    {
      body: { error: { message: "The credential is invalid.", status: "PERMISSION_DENIED" } },
      expectedCode: "ai_provider_auth_failed",
      status: 403
    }
  ])("classifies Gemini HTTP $status failures without exposing upstream details", async ({ body, expectedCode, status }) => {
    configureGemini();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status })
    );
    const gateway = new ClinicalAiGateway(new GeminiStructuredOutputsProvider());

    await expect(
      gateway.extractBiomarkers({
        extractedDocumentId: "document-1",
        extractedText: "Hemoglobin | 13.5 | g/dL | 12-16",
        labReportId: "report-1",
        reportFileId: "file-1",
        userId: "user-1"
      })
    ).rejects.toMatchObject({ code: expectedCode, message: expectedCode });
  });

  it("classifies exhausted OpenAI credits as non-retryable", async () => {
    configureOpenAi();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "credit_balance_exhausted", type: "insufficient_quota" } }), {
        status: 429
      })
    );
    const gateway = new ClinicalAiGateway(new OpenAiStructuredOutputsProvider());

    await expect(
      gateway.extractBiomarkers({
        extractedDocumentId: "document-1",
        extractedText: "Hemoglobin | 13.5 | g/dL | 12-16",
        labReportId: "report-1",
        reportFileId: "file-1",
        userId: "user-1"
      })
    ).rejects.toMatchObject({ code: "ai_provider_quota_exhausted", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function normalizedMarkers() {
  return normalizeBiomarkerItems({
    aiModelRunId: "model-run-1",
    extractedDocumentId: "document-1",
    items: [
      {
        canonical_name: "Hemoglobin",
        confidence: 0.9,
        lab_flag: "normal",
        raw_name: "Hemoglobin",
        reference_high: 16,
        reference_low: 12,
        reference_range_text: "12-16",
        source_text: "Hemoglobin | 13.5 | g/dL | 12-16",
        system_flag: "normal",
        unit: "g/dL",
        value_numeric: 13.5,
        value_text: null
      }
    ],
    labName: null,
    labReportId: "report-1",
    now: "2026-09-02T00:00:00.000Z",
    reportDate: null,
    reportFileId: "file-1",
    reportType: "cbc",
    userId: "user-1"
  });
}

function configureGemini() {
  process.env.APP_ENV = "test";
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_MODEL_EXTRACTION = "gemini-3.5-flash";
  process.env.GEMINI_MODEL_EXPLANATION = "gemini-3.5-flash";
  process.env.GEMINI_MODEL_DOCTOR_SUMMARY = "gemini-3.5-flash";
}

function configureOpenAi() {
  process.env.APP_ENV = "test";
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL_EXTRACTION = "gpt-5.6-terra";
  process.env.OPENAI_MODEL_EXPLANATION = "gpt-5.6-terra";
  process.env.OPENAI_MODEL_DOCTOR_SUMMARY = "gpt-5.6-terra";
}
