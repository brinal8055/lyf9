import {
  requiredDisclaimer,
  validateBiomarkerExtractionSchema,
  validateDoctorSummarySchema,
  validatePatientExplanationSchema,
  type BiomarkerExtractionOutput,
  type DoctorSummaryOutput,
  type PatientExplanationOutput,
  type SafetyCheckResult
} from "./ai-schemas";
import { isLocalLikeAiEnv, type AiProvider } from "./ai-provider";
import {
  BIOMARKER_EXTRACTION_JSON_SCHEMA,
  DOCTOR_SUMMARY_JSON_SCHEMA,
  PATIENT_EXPLANATION_JSON_SCHEMA
} from "./openai-json-schemas";
import {
  BIOMARKER_EXTRACTION_SYSTEM_PROMPT,
  DOCTOR_SUMMARY_SYSTEM_PROMPT,
  PATIENT_EXPLANATION_SYSTEM_PROMPT
} from "./openai-prompts";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 120_000;

export class GeminiStructuredOutputsProvider implements AiProvider {
  name = "gemini_structured_outputs";

  async extractBiomarkers(
    params: Parameters<AiProvider["extractBiomarkers"]>[0]
  ): Promise<BiomarkerExtractionOutput> {
    const model = this.assertConfigured("GEMINI_MODEL_EXTRACTION");
    const output = await callGeminiStructured<BiomarkerExtractionOutput>({
      model,
      schema: BIOMARKER_EXTRACTION_JSON_SCHEMA,
      systemPrompt: BIOMARKER_EXTRACTION_SYSTEM_PROMPT,
      userPayload: {
        extracted_tables_json: params.extractedTablesJson ?? null,
        extracted_text: params.extractedText,
        patient_context: params.patientContext ?? null
      }
    });

    const validation = validateBiomarkerExtractionSchema(output);
    if (!validation.ok) {
      throw new Error(`gemini_extraction_schema_invalid: ${validation.errors.join("; ")}`);
    }
    return output;
  }

  async generatePatientExplanation(
    params: Parameters<AiProvider["generatePatientExplanation"]>[0]
  ): Promise<PatientExplanationOutput> {
    const model = this.assertConfigured("GEMINI_MODEL_EXPLANATION");
    const raw = await callGeminiStructured<PatientExplanationOutput>({
      model,
      schema: PATIENT_EXPLANATION_JSON_SCHEMA,
      systemPrompt: PATIENT_EXPLANATION_SYSTEM_PROMPT,
      userPayload: {
        biomarkers: params.biomarkers,
        patient_context: params.patientContext ?? null
      }
    });

    // The platform disclaimer is authoritative — never trust model-authored copy.
    const output: PatientExplanationOutput = { ...raw, disclaimer: requiredDisclaimer() };
    const validation = validatePatientExplanationSchema(output);
    if (!validation.ok) {
      throw new Error(`gemini_explanation_schema_invalid: ${validation.errors.join("; ")}`);
    }
    return output;
  }

  async generateDoctorSummary(
    params: Parameters<AiProvider["generateDoctorSummary"]>[0]
  ): Promise<DoctorSummaryOutput> {
    const model = this.assertConfigured("GEMINI_MODEL_DOCTOR_SUMMARY");
    const output = await callGeminiStructured<DoctorSummaryOutput>({
      model,
      schema: DOCTOR_SUMMARY_JSON_SCHEMA,
      systemPrompt: DOCTOR_SUMMARY_SYSTEM_PROMPT,
      userPayload: {
        biomarkers: params.biomarkers,
        patient_context: params.patientContext ?? null,
        patient_explanation: params.patientExplanation ?? null
      }
    });

    const validation = validateDoctorSummarySchema(output);
    if (!validation.ok) {
      throw new Error(`gemini_doctor_summary_schema_invalid: ${validation.errors.join("; ")}`);
    }
    return output;
  }

  async runSafetyCheck(params: Parameters<AiProvider["runSafetyCheck"]>[0]): Promise<SafetyCheckResult> {
    this.assertConfigured("GEMINI_MODEL_EXPLANATION");
    void params;
    return {
      blocked_terms: [],
      doctor_review_required: false,
      reasons: ["LLM-based safety is not enabled; deterministic safety is authoritative."],
      status: "review_required"
    };
  }

  private assertConfigured(modelEnvName: string) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const model = process.env[modelEnvName]?.trim();

    if (!apiKey || !model) {
      throw new Error(isLocalLikeAiEnv() ? "gemini_configuration_required" : "ai_configuration_required");
    }
    return model;
  }
}

// Gemini's responseSchema (OpenAPI 3.0 subset) rejects `additionalProperties`
// and nullable unions like `["string", "null"]` — strip/convert them.
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(toGeminiSchema);
  }
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const input = schema as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key === "additionalProperties") continue;
    output[key] = toGeminiSchema(value);
  }

  const type = input.type;
  if (Array.isArray(type)) {
    const nonNull = type.find((t) => t !== "null");
    output.type = nonNull ?? type[0];
    if (type.includes("null")) {
      output.nullable = true;
    }
  }

  const enumValues = input.enum;
  if (Array.isArray(enumValues) && enumValues.includes(null)) {
    output.enum = enumValues.filter((value) => value !== null);
    output.nullable = true;
  }

  return output;
}

async function callGeminiStructured<T>(input: {
  model: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userPayload: Record<string, unknown>;
}): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(isLocalLikeAiEnv() ? "gemini_configuration_required" : "ai_configuration_required");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/${input.model}:generateContent?key=${apiKey}`,
      {
        body: JSON.stringify({
          contents: [{ parts: [{ text: JSON.stringify(input.userPayload) }], role: "user" }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(input.schema),
            temperature: 0
          },
          systemInstruction: { parts: [{ text: input.systemPrompt }] }
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`gemini_request_failed_${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const body = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };
    const candidate = body.candidates?.[0];

    if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
      throw new Error(`gemini_blocked: ${candidate.finishReason}`);
    }

    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("gemini_empty_response");
    }

    return JSON.parse(text) as T;
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") {
      throw new Error("gemini_request_timeout");
    }
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}
