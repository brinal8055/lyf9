import { createSupabaseServiceClient } from "@/lib/auth/providers/supabase-server";
import type { NormalizedBiomarker } from "@/lib/biomarkers";
import type { ExtractedDocumentResult } from "@/lib/document-extraction";
import type { PatientExplanationOutput } from "@/lib/ai";
import type { ProcessingJobState, ReportScanStatus } from "@/lib/reports/types";

type DbRow = Record<string, unknown>;

function client() {
  return createSupabaseServiceClient();
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function fetchReportFileRow(reportFileId: string): Promise<DbRow> {
  const { data, error } = await client()
    .from("report_files")
    .select("*")
    .eq("id", reportFileId)
    .single();
  throwIfError(error);
  return data as DbRow;
}

// ── State updates ─────────────────────────────────────────────────────────────

export async function updateReportFileScan(
  reportFileId: string,
  scanStatus: ReportScanStatus,
  fileStatus: string
) {
  const now = new Date().toISOString();
  const { error } = await client()
    .from("report_files")
    .update({ scan_completed_at: now, scan_status: scanStatus, status: fileStatus, updated_at: now })
    .eq("id", reportFileId);
  throwIfError(error);
}

export async function updateReportFileStatus(reportFileId: string, status: string) {
  const { error } = await client()
    .from("report_files")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", reportFileId);
  throwIfError(error);
}

export async function updateJobState(jobId: string, state: ProcessingJobState) {
  const { error } = await client()
    .from("processing_jobs")
    .update({ current_state: state, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  throwIfError(error);
}

export async function updateLabReportClassification(
  labReportId: string,
  values: { reportType?: string; status: string; unsupportedReason?: string | null }
) {
  const { error } = await client()
    .from("lab_reports")
    .update({
      report_type: values.reportType,
      status: values.status,
      unsupported_reason: values.unsupportedReason ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", labReportId);
  throwIfError(error);
}

// ── Pipeline output inserts ───────────────────────────────────────────────────

export async function insertExtractedDocument(input: {
  extractionVersion: number;
  labReportId: string;
  ocrProviderName?: string | null;
  parserName: string;
  reportFileId: string;
  result: ExtractedDocumentResult;
  userId: string;
}): Promise<string> {
  const { data, error } = await client()
    .from("extracted_documents")
    .insert({
      confidence_score: input.result.confidenceScore ?? null,
      error_code: input.result.errorCode ?? null,
      error_message: input.result.errorMessage ?? null,
      extracted_tables_json: input.result.extractedTablesJson ?? null,
      extracted_text: input.result.extractedText ?? null,
      extraction_version: input.extractionVersion,
      lab_report_id: input.labReportId,
      page_count: input.result.pageCount ?? null,
      page_metadata_json: input.result.pageMetadataJson ?? {},
      parser_name: input.parserName,
      parser_provider: input.parserName,
      parser_version: input.result.parserVersion,
      ocr_provider: input.ocrProviderName ?? null,
      report_file_id: input.reportFileId,
      status: input.result.status,
      user_id: input.userId
    })
    .select("id")
    .single();
  throwIfError(error);
  return (data as DbRow).id as string;
}

export async function insertModelRun(input: {
  errorCode?: string | null;
  errorMessage?: string | null;
  extractedDocumentId?: string | null;
  inputHash: string;
  jobId: string;
  labReportId: string;
  latencyMs?: number | null;
  modelName: string;
  outputHash?: string | null;
  outputJson?: Record<string, unknown> | null;
  promptVersion: string;
  provider: string;
  reportFileId: string;
  safetyFilterStatus?: string | null;
  schemaVersion: string;
  status: "succeeded" | "failed";
  taskType: string;
  tokenInputCount?: number | null;
  tokenOutputCount?: number | null;
  userId: string;
}): Promise<string> {
  const { data, error } = await client()
    .from("model_runs")
    .insert({
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      extracted_document_id: input.extractedDocumentId ?? null,
      input_hash: input.inputHash,
      lab_report_id: input.labReportId,
      latency_ms: input.latencyMs ?? null,
      model_name: input.modelName,
      output_hash: input.outputHash ?? null,
      output_json: input.outputJson ?? null,
      processing_job_id: input.jobId,
      prompt_version: input.promptVersion,
      provider: input.provider,
      report_file_id: input.reportFileId,
      safety_filter_status: input.safetyFilterStatus ?? null,
      schema_version: input.schemaVersion,
      status: input.status,
      task_type: input.taskType,
      token_input_count: input.tokenInputCount ?? null,
      token_output_count: input.tokenOutputCount ?? null,
      user_id: input.userId
    })
    .select("id")
    .single();
  throwIfError(error);
  return (data as DbRow).id as string;
}

export async function insertBiomarkerResults(input: {
  aiModelRunId: string;
  biomarkers: NormalizedBiomarker[];
  extractionVersion: number;
  labReportId: string;
  userId: string;
}): Promise<Array<{ id: string; reviewRouting: string; isCritical: boolean }>> {
  if (input.biomarkers.length === 0) {
    return [];
  }

  const rows = input.biomarkers.map((marker) => ({
    ai_model_run_id: input.aiModelRunId,
    canonical_biomarker_key: marker.canonicalBiomarkerKey ?? null,
    canonical_name: marker.canonicalName ?? null,
    confidence_score: marker.confidenceScore,
    extraction_version: input.extractionVersion,
    is_critical: marker.isCritical ?? false,
    is_supported: marker.isSupported ?? Boolean(marker.canonicalBiomarkerKey),
    lab_flag: marker.labFlag ?? "unknown",
    lab_report_id: input.labReportId,
    original_unit: marker.originalUnit ?? null,
    page_number: marker.pageNumber ?? null,
    raw_name: marker.rawName,
    reference_high: marker.referenceHigh ?? null,
    reference_low: marker.referenceLow ?? null,
    reference_range_text: marker.referenceRangeText ?? null,
    review_routing: marker.reviewRouting ?? marker.reviewStatus ?? "soft_review",
    source_text: marker.sourceText,
    system_flag: marker.systemFlag ?? "unknown",
    unit: marker.unit ?? null,
    user_id: input.userId,
    value_numeric: marker.valueNumeric ?? null,
    value_text: marker.valueText ?? null
  }));

  const { data, error } = await client()
    .from("biomarker_results")
    .insert(rows)
    .select("id, review_routing, is_critical");
  throwIfError(error);

  return ((data ?? []) as DbRow[]).map((row) => ({
    id: row.id as string,
    isCritical: Boolean(row.is_critical),
    reviewRouting: String(row.review_routing)
  }));
}

export async function insertHealthInsight(input: {
  aiModelRunId: string;
  disclaimer: string;
  labReportId: string;
  output: PatientExplanationOutput;
  safetyFlags: string[];
  sourceBiomarkerIds: string[];
  status: "ai_only_published" | "doctor_review_pending" | "admin_review_pending";
  userId: string;
}): Promise<string> {
  const { data, error } = await client()
    .from("health_insights")
    .insert({
      ai_model_run_id: input.aiModelRunId,
      disclaimer: input.disclaimer,
      lab_report_id: input.labReportId,
      model_run_id: input.aiModelRunId,
      output_json: input.output,
      safety_flags: input.safetyFlags,
      source_biomarker_ids: input.sourceBiomarkerIds,
      status: input.status,
      summary: input.output.summary,
      user_id: input.userId
    })
    .select("id")
    .single();
  throwIfError(error);
  return (data as DbRow).id as string;
}

export async function insertHealthRiskFlags(input: {
  flags: Array<{
    biomarkerResultId: string | null;
    flagType: string;
    reason: string;
    severity: string;
  }>;
  labReportId: string;
  reportFileId: string;
  userId: string;
}) {
  if (input.flags.length === 0) {
    return;
  }

  const rows = input.flags.map((flag) => ({
    biomarker_result_id: flag.biomarkerResultId,
    flag_type: flag.flagType,
    lab_report_id: input.labReportId,
    reason: flag.reason,
    report_file_id: input.reportFileId,
    severity: flag.severity,
    source: "deterministic_rules",
    status: "open",
    user_id: input.userId
  }));

  const { error } = await client().from("health_risk_flags").insert(rows);
  throwIfError(error);
}
