import type {
  BiomarkerExtractionOutput,
  DoctorSummaryOutput,
  PatientExplanationOutput,
  SafetyCheckResult
} from "./ai-schemas";
import type { NormalizedBiomarker } from "../biomarkers";

export type AiProviderId = "gemini" | "mock" | "openai";
export type AiTask = "biomarker_extraction" | "doctor_summary" | "patient_explanation";

export type AiCapabilityStatus = {
  configured: boolean;
  model: string | null;
};

export type AiProviderConfiguration = {
  capabilities: Record<AiTask, AiCapabilityStatus>;
  providerId: AiProviderId;
  providerName: string;
  readyForReportPipeline: boolean;
};

export type AiProvider = {
  name: string;
  providerId: AiProviderId;
  getConfigurationStatus(): AiProviderConfiguration;
  getModelName(task: AiTask): string | null;
  extractBiomarkers(params: {
    userId: string;
    reportFileId: string;
    labReportId: string;
    extractedDocumentId: string;
    extractedText: string;
    extractedTablesJson?: unknown;
    patientContext?: Record<string, unknown>;
  }): Promise<BiomarkerExtractionOutput>;
  generatePatientExplanation(params: {
    userId: string;
    labReportId: string;
    biomarkers: NormalizedBiomarker[];
    patientContext?: Record<string, unknown>;
  }): Promise<PatientExplanationOutput>;
  generateDoctorSummary(params: {
    userId: string;
    labReportId: string;
    biomarkers: NormalizedBiomarker[];
    patientContext?: Record<string, unknown>;
    patientExplanation?: PatientExplanationOutput;
  }): Promise<DoctorSummaryOutput>;
  runSafetyCheck(params: {
    outputType: "biomarker_extraction" | "patient_explanation" | "doctor_summary";
    output: unknown;
  }): Promise<SafetyCheckResult>;
};

export function isLocalLikeAiEnv() {
  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  return ["local", "development", "test"].includes(appEnv);
}
