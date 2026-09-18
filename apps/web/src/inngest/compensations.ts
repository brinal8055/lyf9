import { createSupabaseServiceClient } from "@/lib/auth/providers/supabase-server";

async function deleteExtractedDocument(reportFileId: string) {
  const client = createSupabaseServiceClient();
  await client.from("extracted_documents").delete().eq("report_file_id", reportFileId);
}

async function deleteBiomarkerResults(reportFileId: string) {
  const client = createSupabaseServiceClient();
  const { data } = await client
    .from("lab_reports")
    .select("id")
    .eq("report_file_id", reportFileId)
    .maybeSingle();
  const labReportId = (data as { id?: string } | null)?.id;
  if (!labReportId) return;
  await client.from("biomarker_results").delete().eq("lab_report_id", labReportId);
}

async function markModelRunCompensated(reportFileId: string) {
  const client = createSupabaseServiceClient();
  await client
    .from("model_runs")
    .update({ status: "compensated" })
    .eq("report_file_id", reportFileId);
}

async function deleteHealthInsightAndFlags(reportFileId: string) {
  const client = createSupabaseServiceClient();
  const { data } = await client
    .from("lab_reports")
    .select("id")
    .eq("report_file_id", reportFileId)
    .maybeSingle();
  const labReportId = (data as { id?: string } | null)?.id;
  if (!labReportId) return;
  await client.from("health_insights").delete().eq("lab_report_id", labReportId);
  await client.from("health_risk_flags").delete().eq("lab_report_id", labReportId);
}

const STEPS: Record<string, (id: string) => Promise<void>> = {
  "malware-scan":         async () => { /* scan result has no DB side-effects to undo */ },
  "classify-report":      async () => { /* classification update is safe to leave for audit */ },
  "extract-document":     deleteExtractedDocument,
  "extract-biomarkers":   async (id) => {
    await deleteBiomarkerResults(id);
    await markModelRunCompensated(id);
  },
  "generate-explanation": deleteHealthInsightAndFlags,
};

export async function compensate(reportFileId: string, stepName: string) {
  const handler = STEPS[stepName];
  if (handler) await handler(reportFileId);
}
