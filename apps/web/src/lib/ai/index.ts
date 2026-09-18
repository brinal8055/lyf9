import { isLocalLikeAiEnv, type AiProvider, type AiProviderId } from "./ai-provider";
import { ClinicalAiGateway } from "./clinical-ai-gateway";
import { GeminiStructuredOutputsProvider } from "./gemini-structured-provider";
import { MockAiProvider } from "./mock-ai-provider";
import { OpenAiStructuredOutputsProvider } from "./openai-structured-provider";

export type { AiProvider, AiProviderConfiguration, AiProviderId, AiTask } from "./ai-provider";
export { AiGatewayError, ClinicalAiGateway, aiFailureDetails } from "./clinical-ai-gateway";
export { GeminiStructuredOutputsProvider } from "./gemini-structured-provider";
export { MockAiProvider } from "./mock-ai-provider";
export { OpenAiStructuredOutputsProvider } from "./openai-structured-provider";
export * from "./ai-schemas";
export * from "./model-runs";
export * from "./prompt-versions";

export function getAiProvider(): AiProvider {
  const provider = selectedProviderId();

  if (provider === "mock") {
    if (!isLocalLikeAiEnv() && process.env.ALLOW_MOCK_AI_IN_DEPLOYED_ENV !== "true") {
      throw new Error("Mock AI provider is disabled outside local/development/test environments.");
    }
    return new MockAiProvider();
  }

  if (provider === "gemini") {
    return new GeminiStructuredOutputsProvider();
  }

  if (provider === "openai") {
    return new OpenAiStructuredOutputsProvider();
  }

  throw new Error(`ai_provider_unsupported:${provider}`);
}

export function getClinicalAiGateway() {
  return new ClinicalAiGateway(getAiProvider());
}

export function getAiRuntimeStatus() {
  try {
    return getAiProvider().getConfigurationStatus();
  } catch {
    const provider = (process.env.AI_PROVIDER ?? "unconfigured").trim().toLowerCase();
    const capability = { configured: false, model: null };
    return {
      capabilities: {
        biomarker_extraction: capability,
        doctor_summary: capability,
        patient_explanation: capability
      },
      providerId: provider,
      providerName: "unconfigured",
      readyForReportPipeline: false
    };
  }
}

function selectedProviderId(): AiProviderId | string {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (configured) return configured;
  if (isLocalLikeAiEnv()) return "mock";
  throw new Error("ai_configuration_required");
}
