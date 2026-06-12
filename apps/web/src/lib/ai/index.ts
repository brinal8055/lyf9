import { isLocalLikeAiEnv, type AiProvider } from "./ai-provider";
import { MockAiProvider } from "./mock-ai-provider";
import { OpenAiStructuredOutputsProvider } from "./openai-structured-provider";

export type { AiProvider } from "./ai-provider";
export { MockAiProvider } from "./mock-ai-provider";
export { OpenAiStructuredOutputsProvider } from "./openai-structured-provider";
export * from "./ai-schemas";
export * from "./model-runs";
export * from "./prompt-versions";

export function getAiProvider(): AiProvider {
  const provider = (process.env.AI_PROVIDER ?? (process.env.OPENAI_API_KEY ? "openai" : "mock")).toLowerCase();

  if (provider === "mock") {
    if (!isLocalLikeAiEnv() && process.env.ALLOW_MOCK_AI_IN_DEPLOYED_ENV !== "true") {
      throw new Error("Mock AI provider is disabled outside local/development/test environments.");
    }
    return new MockAiProvider();
  }

  return new OpenAiStructuredOutputsProvider();
}
