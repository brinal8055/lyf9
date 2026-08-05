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

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 120_000;

export class OpenAiStructuredOutputsProvider implements AiProvider {
  name = "openai_structured_outputs";

  async extractBiomarkers(
    params: Parameters<AiProvider["extractBiomarkers"]>[0]
  ): Promise<BiomarkerExtractionOutput> {
    const model = this.assertConfigured("OPENAI_MODEL_EXTRACTION");
    const output = await callOpenAiStructured<BiomarkerExtractionOutput>({
      model,
      schema: BIOMARKER_EXTRACTION_JSON_SCHEMA,
      schemaName: "biomarker_extraction",
      systemPrompt: BIOMARKER_EXTRACTION_SYSTEM_PROMPT,
      userPayload: {
        extracted_tables_json: params.extractedTablesJson ?? null,
        extracted_text: params.extractedText,
        patient_context: params.patientContext ?? null
      }
    });

    const validation = validateBiomarkerExtractionSchema(output);
    if (!validation.ok) {
      throw new Error(`openai_extraction_schema_invalid: ${validation.errors.join("; ")}`);
    }
    return output;
  }

  async generatePatientExplanation(
    params: Parameters<AiProvider["generatePatientExplanation"]>[0]
  ): Promise<PatientExplanationOutput> {
    const model = this.assertConfigured("OPENAI_MODEL_EXPLANATION");
    const raw = await callOpenAiStructured<PatientExplanationOutput>({
      model,
      schema: PATIENT_EXPLANATION_JSON_SCHEMA,
      schemaName: "patient_explanation",
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
      throw new Error(`openai_explanation_schema_invalid: ${validation.errors.join("; ")}`);
    }
    return output;
  }

  async generateDoctorSummary(
    params: Parameters<AiProvider["generateDoctorSummary"]>[0]
  ): Promise<DoctorSummaryOutput> {
    const model = this.assertConfigured("OPENAI_MODEL_DOCTOR_SUMMARY");
    const output = await callOpenAiStructured<DoctorSummaryOutput>({
      model,
      schema: DOCTOR_SUMMARY_JSON_SCHEMA,
      schemaName: "doctor_summary",
      systemPrompt: DOCTOR_SUMMARY_SYSTEM_PROMPT,
      userPayload: {
        biomarkers: params.biomarkers,
        patient_context: params.patientContext ?? null,
        patient_explanation: params.patientExplanation ?? null
      }
    });

    const validation = validateDoctorSummarySchema(output);
    if (!validation.ok) {
      throw new Error(`openai_doctor_summary_schema_invalid: ${validation.errors.join("; ")}`);
    }
    return output;
  }

  async runSafetyCheck(params: Parameters<AiProvider["runSafetyCheck"]>[0]): Promise<SafetyCheckResult> {
    this.assertConfigured("OPENAI_MODEL_EXPLANATION");
    void params;
    return {
      blocked_terms: [],
      doctor_review_required: false,
      reasons: ["LLM-based safety is not enabled; deterministic safety is authoritative."],
      status: "review_required"
    };
  }

  private assertConfigured(modelEnvName: string) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const model = process.env[modelEnvName]?.trim();

    if (!apiKey || !model) {
      throw new Error(isLocalLikeAiEnv() ? "openai_configuration_required" : "ai_configuration_required");
    }
    return model;
  }
}

async function callOpenAiStructured<T>(input: {
  model: string;
  schema: Record<string, unknown>;
  schemaName: string;
  systemPrompt: string;
  userPayload: Record<string, unknown>;
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(isLocalLikeAiEnv() ? "openai_configuration_required" : "ai_configuration_required");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      body: JSON.stringify({
        messages: [
          { content: input.systemPrompt, role: "system" },
          { content: JSON.stringify(input.userPayload), role: "user" }
        ],
        model: input.model,
        response_format: {
          json_schema: {
            name: input.schemaName,
            schema: input.schema,
            strict: true
          },
          type: "json_schema"
        },
        temperature: 0
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`openai_request_failed_${response.status}: ${errorBody.slice(0, 500)}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string; refusal?: string } }>;
    };
    const choice = body.choices?.[0]?.message;

    if (choice?.refusal) {
      throw new Error(`openai_refused: ${choice.refusal.slice(0, 300)}`);
    }
    if (!choice?.content) {
      throw new Error("openai_empty_response");
    }

    return JSON.parse(choice.content) as T;
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") {
      throw new Error("openai_request_timeout");
    }
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}
