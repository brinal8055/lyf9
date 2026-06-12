import type { ReportType } from "./types";

export type ReportClassification = {
  confidence: number;
  reportType: ReportType;
  supported: boolean;
  supportedPanels: string[];
  unsupportedReason: string | null;
  unsupportedSections: string[];
};

type ClassificationInput = {
  extractedText?: string | null;
  filename: string;
};

const supportedPanelRules: Array<{
  panel: string;
  reportType: Exclude<ReportType, "full_body_supported" | "unsupported" | "unknown">;
  pattern: RegExp;
}> = [
  {
    panel: "CBC",
    pattern: /\b(cbc|complete blood count|hemoglobin|haemoglobin|platelet|wbc|rbc)\b/i,
    reportType: "cbc"
  },
  {
    panel: "lipid profile",
    pattern: /\b(lipid[- ]profile|cholesterol|triglycerides|hdl|ldl|vldl)\b/i,
    reportType: "lipid"
  },
  {
    panel: "basic urine routine",
    pattern: /\b(urine routine|urine examination|urinalysis|specific gravity|urine protein)\b/i,
    reportType: "urine_limited"
  },
  {
    panel: "thyroid profile",
    pattern: /\b(thyroid|tsh|t3|t4|free t3|free t4)\b/i,
    reportType: "thyroid"
  },
  {
    panel: "liver function test",
    pattern: /\b(liver function|lft|sgot|sgpt|alt|ast|bilirubin|alkaline phosphatase)\b/i,
    reportType: "lft"
  },
  {
    panel: "kidney function test",
    pattern: /\b(kidney function|kft|creatinine|urea|bun|egfr|uric acid)\b/i,
    reportType: "kft"
  },
  {
    panel: "HbA1c/glucose",
    pattern: /\b(hba1c|glycated hemoglobin|glucose|fasting blood sugar|fbs|ppbs)\b/i,
    reportType: "hba1c_glucose"
  },
  {
    panel: "Vitamin D/B12/ferritin",
    pattern: /\b(vitamin d|25[- ]?hydroxy|vitamin b12|ferritin)\b/i,
    reportType: "vitamin"
  }
];

const unsupportedRules: Array<{ reason: string; section: string; pattern: RegExp }> = [
  {
    pattern: /\b(radiology|x[- ]?ray|ct scan|mri|ultrasound|sonography|imaging)\b/i,
    reason: "Radiology reports are not supported for automated interpretation.",
    section: "radiology"
  },
  {
    pattern: /\b(ecg|eeg|electrocardiogram|electroencephalogram)\b/i,
    reason: "ECG/EEG reports are not supported for automated interpretation.",
    section: "ecg_eeg"
  },
  {
    pattern: /\b(biopsy|histopathology|histology|pathology specimen)\b/i,
    reason: "Biopsy and histopathology reports are not supported.",
    section: "biopsy_histopathology"
  },
  {
    pattern: /\b(pregnancy|fetal|foetal|antenatal|obstetric)\b/i,
    reason: "Pregnancy and fetal reports are not supported.",
    section: "pregnancy_fetal"
  },
  {
    pattern: /\b(pediatric|paediatric|child|infant|neonate)\b/i,
    reason: "Pediatric reports are not supported in private beta.",
    section: "pediatric"
  },
  {
    pattern: /\b(emergency|acute chest pain|stroke|trauma|critical care)\b/i,
    reason: "Emergency diagnosis is not supported.",
    section: "emergency"
  },
  {
    pattern: /\b(prescription|change\s+dose|increase\s+dose|decrease\s+dose|stop\s+medication)\b/i,
    reason: "Prescription change advice is not supported.",
    section: "prescription_change"
  }
];

const cancerMarkerPattern = /\b(ca[- ]?125|ca[- ]?19[- ]?9|cea|afp|psa|tumou?r marker)\b/i;

export function classifyReport(input: ClassificationInput): ReportClassification {
  const haystack = `${input.filename}\n${input.extractedText ?? ""}`;
  const unsupported = unsupportedRules.find((rule) => rule.pattern.test(haystack));

  if (unsupported) {
    return unsupportedClassification(unsupported.reason, unsupported.section, 0.96);
  }

  const supportedMatches = supportedPanelRules.filter((rule) => rule.pattern.test(haystack));

  if (cancerMarkerPattern.test(haystack) && supportedMatches.length === 0) {
    return unsupportedClassification(
      "Standalone cancer marker interpretation is not supported.",
      "cancer_marker_standalone",
      0.94
    );
  }

  if (supportedMatches.length >= 3 || /\b(full body|master health|annual health check)\b/i.test(haystack)) {
    return {
      confidence: 0.9,
      reportType: "full_body_supported",
      supported: true,
      supportedPanels: unique(supportedMatches.map((match) => match.panel)),
      unsupportedReason: null,
      unsupportedSections: []
    };
  }

  const first = supportedMatches[0];

  if (first) {
    return {
      confidence: first.reportType === "urine_limited" ? 0.82 : 0.88,
      reportType: first.reportType,
      supported: true,
      supportedPanels: [first.panel],
      unsupportedReason: null,
      unsupportedSections: []
    };
  }

  return unsupportedClassification(
    "Report type is unknown or outside the private beta supported panels.",
    "unknown_or_unsupported_report_type",
    0.55
  );
}

function unsupportedClassification(
  reason: string,
  section: string,
  confidence: number
): ReportClassification {
  return {
    confidence,
    reportType: "unsupported",
    supported: false,
    supportedPanels: [],
    unsupportedReason: reason,
    unsupportedSections: [section]
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
