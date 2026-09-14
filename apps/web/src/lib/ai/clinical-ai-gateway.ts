import { runUnsafeLanguageFilter } from "../reports/safety";
import type { NormalizedBiomarker } from "../biomarkers";
import type { AiProvider, AiTask } from "./ai-provider";
import {
  requiredDisclaimer,
  validateBiomarkerExtractionSchema,
  validateDoctorSummarySchema,
  validatePatientExplanationSchema,
  type BiomarkerExtractionOutput,
  type DoctorSummaryOutput,
  type PatientExplanationOutput
} from "./ai-schemas";

export type AiInvocationMetadata = {
  latencyMs: number;
  modelName: string;
  provider: string;
  task: AiTask;
};

export type AiGatewayResult<T> = {
  metadata: AiInvocationMetadata;
  output: T;
};

export type PatientExplanationGatewayResult = AiGatewayResult<PatientExplanationOutput> & {
  safety: ReturnType<typeof runUnsafeLanguageFilter>;
};

export class AiGatewayError extends Error {
  readonly code: string;
  readonly metadata: AiInvocationMetadata;
  readonly retryable: boolean;

  constructor(code: string, metadata: AiInvocationMetadata, retryable: boolean) {
    super(code);
    this.name = "AiGatewayError";
    this.code = code;
    this.metadata = metadata;
    this.retryable = retryable;
  }
}

export class ClinicalAiGateway {
  constructor(private readonly provider: AiProvider) {}

  get providerName() {
    return this.provider.name;
  }

  getModelName(task: AiTask) {
    return this.provider.getModelName(task) ?? this.provider.name;
  }

  async extractBiomarkers(
    params: Parameters<AiProvider["extractBiomarkers"]>[0]
  ): Promise<AiGatewayResult<BiomarkerExtractionOutput>> {
    return this.invoke("biomarker_extraction", () => this.provider.extractBiomarkers(params), (output) => {
      const validation = validateBiomarkerExtractionSchema(output);
      if (!validation.ok) throw new Error("ai_schema_validation_failed");
      return output;
    });
  }

  async generatePatientExplanation(
    params: Parameters<AiProvider["generatePatientExplanation"]>[0]
  ): Promise<PatientExplanationGatewayResult> {
    const result = await this.invoke(
      "patient_explanation",
      () => this.provider.generatePatientExplanation(params),
      (raw) => enforcePatientExplanationFacts(raw, params.biomarkers)
    );
    return {
      ...result,
      safety: runUnsafeLanguageFilter(JSON.stringify(result.output))
    };
  }

  async generateDoctorSummary(
    params: Parameters<AiProvider["generateDoctorSummary"]>[0]
  ): Promise<AiGatewayResult<DoctorSummaryOutput>> {
    return this.invoke("doctor_summary", () => this.provider.generateDoctorSummary(params), (output) => {
      if (!output || typeof output !== "object") throw new Error("ai_schema_validation_failed");
      const validation = validateDoctorSummarySchema(output);
      if (!validation.ok) throw new Error("ai_schema_validation_failed");
      return output;
    });
  }

  private async invoke<T>(task: AiTask, run: () => Promise<T>, validate: (output: T) => T) {
    const startedAt = Date.now();
    const metadata = (): AiInvocationMetadata => ({
      latencyMs: Date.now() - startedAt,
      modelName: this.getModelName(task),
      provider: this.provider.name,
      task
    });

    const maxAttempts = providerMaxAttempts();
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const output = validate(await run());
        return { metadata: metadata(), output };
      } catch (caught) {
        if (caught instanceof AiGatewayError) throw caught;
        const failure = classifyAiFailure(caught);
        const retryInline = failure.code === "ai_provider_unavailable" && attempt < maxAttempts;
        if (!retryInline) {
          throw new AiGatewayError(failure.code, metadata(), failure.retryable);
        }
        await wait(providerRetryBaseMs() * (2 ** (attempt - 1)));
      }
    }

    throw new AiGatewayError("ai_provider_failed", metadata(), false);
  }
}

export function aiFailureDetails(caught: unknown, fallback: { modelName: string; provider: string; task: AiTask }) {
  if (caught instanceof AiGatewayError) {
    return {
      code: caught.code,
      latencyMs: caught.metadata.latencyMs,
      message: caught.code,
      modelName: caught.metadata.modelName,
      provider: caught.metadata.provider,
      retryable: caught.retryable
    };
  }

  const failure = classifyAiFailure(caught);
  return {
    code: failure.code,
    latencyMs: null,
    message: failure.code,
    modelName: fallback.modelName,
    provider: fallback.provider,
    retryable: failure.retryable
  };
}

function enforcePatientExplanationFacts(
  raw: PatientExplanationOutput,
  biomarkers: NormalizedBiomarker[]
): PatientExplanationOutput {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray(raw.markers_needing_attention) ||
    !Array.isArray(raw.normal_markers) ||
    !Array.isArray(raw.source_biomarker_ids)
  ) {
    throw new Error("ai_schema_validation_failed");
  }
  const known = new Map(biomarkers.map((marker) => [marker.id, marker]));
  const explanations = [...(raw.markers_needing_attention ?? []), ...(raw.normal_markers ?? [])];
  const explanationIds = explanations.map((item) => item.biomarker_result_id);
  const sourceIds = raw.source_biomarker_ids ?? [];
  const expectedIds = biomarkers.map((marker) => marker.id);

  if (
    hasDuplicates(explanationIds) ||
    hasDuplicates(sourceIds) ||
    explanationIds.some((id) => !known.has(id)) ||
    sourceIds.some((id) => !known.has(id)) ||
    !sameIds(explanationIds, expectedIds) ||
    !sameIds(sourceIds, expectedIds)
  ) {
    throw new Error("ai_source_trace_validation_failed");
  }

  const applyFacts = (item: PatientExplanationOutput["normal_markers"][number]) => {
    const marker = known.get(item.biomarker_result_id)!;
    return {
      ...item,
      display_name: marker.canonicalName ?? marker.rawName,
      status: patientStatus(marker),
      value_display: valueDisplay(marker)
    };
  };
  const deterministicReview = biomarkers.some(
    (marker) => marker.isCritical || marker.normalizationStatus === "unmapped" || marker.reviewRouting !== "auto_accept"
  );
  const output: PatientExplanationOutput = {
    ...raw,
    disclaimer: requiredDisclaimer(),
    doctor_review_reason:
      deterministicReview && !raw.doctor_review_reason
        ? "One or more extracted markers require human review."
        : raw.doctor_review_reason,
    doctor_review_recommended: deterministicReview || raw.doctor_review_recommended,
    markers_needing_attention: raw.markers_needing_attention.map(applyFacts),
    normal_markers: raw.normal_markers.map(applyFacts),
    source_biomarker_ids: expectedIds
  };
  const validation = validatePatientExplanationSchema(output);
  if (!validation.ok) throw new Error("ai_schema_validation_failed");
  return output;
}

function patientStatus(marker: NormalizedBiomarker): PatientExplanationOutput["normal_markers"][number]["status"] {
  if (marker.isCritical || marker.systemFlag === "critical") return "critical";
  if (marker.systemFlag === "borderline") return "monitor";
  if (["high", "low", "normal", "unknown"].includes(marker.systemFlag)) {
    return marker.systemFlag as "high" | "low" | "normal" | "unknown";
  }
  return "unknown";
}

function valueDisplay(marker: NormalizedBiomarker) {
  const value = marker.valueNumeric ?? marker.valueText ?? "Not available";
  return marker.unit ? `${value} ${marker.unit}` : String(value);
}

function hasDuplicates(values: string[]) {
  return new Set(values).size !== values.length;
}

function sameIds(actual: string[], expected: string[]) {
  if (actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  return expected.every((id) => actualSet.has(id));
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function providerMaxAttempts() {
  const configured = Number(process.env.AI_PROVIDER_MAX_ATTEMPTS ?? "3");
  if (!Number.isInteger(configured) || configured < 1) return 3;
  return Math.min(configured, 5);
}

function providerRetryBaseMs() {
  const configured = Number(process.env.AI_PROVIDER_RETRY_BASE_MS ?? "1000");
  return Number.isFinite(configured) && configured >= 0 ? configured : 1000;
}

function classifyAiFailure(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "";
  if (message.includes("configuration_required") || message.includes("disabled outside")) {
    return { code: "ai_configuration_required", retryable: false };
  }
  if (message.includes("provider_unsupported")) {
    return { code: "ai_provider_unsupported", retryable: false };
  }
  if (message.includes("timeout")) {
    return { code: "ai_provider_timeout", retryable: true };
  }
  if (message.includes("quota_exhausted")) {
    return { code: "ai_provider_quota_exhausted", retryable: false };
  }
  if (message.includes("model_unavailable")) {
    return { code: "ai_model_unavailable", retryable: false };
  }
  if (message.includes("auth_failed")) {
    return { code: "ai_provider_auth_failed", retryable: false };
  }
  if (message.includes("request_invalid")) {
    return { code: "ai_provider_request_invalid", retryable: false };
  }
  if (/request_failed_(429|5\d\d)/.test(message)) {
    return { code: "ai_provider_unavailable", retryable: true };
  }
  if (message.includes("blocked") || message.includes("refused")) {
    return { code: "ai_provider_refused", retryable: false };
  }
  if (message.includes("schema") || message.includes("source_trace") || caught instanceof SyntaxError) {
    return { code: "ai_schema_validation_failed", retryable: false };
  }
  return { code: "ai_provider_failed", retryable: false };
}
