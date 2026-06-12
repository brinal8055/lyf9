import type { StrictBiomarkerExtractionOutput } from "../biomarkers";
import type { ExplanationOutput } from "../safety";
import type { BiomarkerResultRecord, ExtractedDocumentRecord } from "../types";

export type AiProvider = {
  extractBiomarkers(input: {
    extractedDocument: ExtractedDocumentRecord;
    patientContext: Record<string, unknown>;
  }): Promise<StrictBiomarkerExtractionOutput>;
  generateDoctorSummary(input: {
    biomarkers: BiomarkerResultRecord[];
    insight: ExplanationOutput;
    patientContext: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  generatePatientExplanation(input: {
    biomarkers: BiomarkerResultRecord[];
    patientContext: Record<string, unknown>;
  }): Promise<ExplanationOutput>;
  runSafetyCheck(output: unknown): Promise<{ blocked: boolean; reasons: string[] }>;
};

export function getAiProviderMode() {
  return process.env.OPENAI_API_KEY ? "openai_structured_outputs_ready" : "mock_schema_provider";
}
