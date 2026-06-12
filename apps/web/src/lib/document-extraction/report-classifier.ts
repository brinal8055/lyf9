import { classifyReport } from "../reports/classification";

export type ReportClassificationResult = {
  confidenceScore: number;
  reportType?: string;
  status: "supported" | "limited_beta" | "unsupported" | "unknown";
  supportedPanels?: string[];
  unsupportedReason?: string;
};

export async function classifyExtractedReport(params: {
  extractedTablesJson?: unknown;
  extractedText: string;
  filename?: string;
  mimeType?: string;
}): Promise<ReportClassificationResult> {
  const classification = classifyReport({
    extractedText: params.extractedText,
    filename: params.filename ?? ""
  });

  if (classification.reportType === "urine_limited") {
    return {
      confidenceScore: classification.confidence,
      reportType: classification.reportType,
      status: "limited_beta",
      supportedPanels: classification.supportedPanels
    };
  }

  if (classification.reportType === "unsupported") {
    const unknown = classification.unsupportedSections.includes("unknown_or_unsupported_report_type");
    return {
      confidenceScore: classification.confidence,
      reportType: classification.reportType,
      status: unknown ? "unknown" : "unsupported",
      supportedPanels: [],
      unsupportedReason: classification.unsupportedReason ?? undefined
    };
  }

  return {
    confidenceScore: classification.confidence,
    reportType: classification.reportType,
    status: "supported",
    supportedPanels: classification.supportedPanels
  };
}
