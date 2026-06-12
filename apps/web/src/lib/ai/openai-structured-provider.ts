import type {
  BiomarkerExtractionOutput,
  DoctorSummaryOutput,
  PatientExplanationOutput,
  SafetyCheckResult
} from "./ai-schemas";
import { isLocalLikeAiEnv, type AiProvider } from "./ai-provider";

export class OpenAiStructuredOutputsProvider implements AiProvider {
  name = "openai_structured_outputs";

  async extractBiomarkers(): Promise<BiomarkerExtractionOutput> {
    this.assertConfigured("OPENAI_MODEL_EXTRACTION");
    throw new Error("openai_structured_outputs_runner_not_wired");
  }

  async generatePatientExplanation(): Promise<PatientExplanationOutput> {
    this.assertConfigured("OPENAI_MODEL_EXPLANATION");
    throw new Error("openai_structured_outputs_runner_not_wired");
  }

  async generateDoctorSummary(): Promise<DoctorSummaryOutput> {
    this.assertConfigured("OPENAI_MODEL_DOCTOR_SUMMARY");
    throw new Error("openai_structured_outputs_runner_not_wired");
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
  }
}
