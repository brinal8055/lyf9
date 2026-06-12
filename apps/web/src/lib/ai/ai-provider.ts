import type {
  BiomarkerExtractionOutput,
  DoctorSummaryOutput,
  PatientExplanationOutput,
  SafetyCheckResult
} from "./ai-schemas";
import type { NormalizedBiomarker } from "../biomarkers";

export type AiProvider = {
  name: string;
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
