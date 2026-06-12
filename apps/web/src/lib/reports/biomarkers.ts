import { randomUUID } from "crypto";

import { findCatalogByAlias } from "./catalog";
import type {
  BiomarkerCatalogRecord,
  BiomarkerFlag,
  BiomarkerResultRecord,
  ReportType,
  ReviewRouting
} from "./types";

export type StrictBiomarkerExtractionItem = {
  raw_name: string;
  canonical_name: string | null;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  reference_range_text: string | null;
  reference_low: number | null;
  reference_high: number | null;
  lab_flag: BiomarkerFlag;
  system_flag: BiomarkerFlag;
  page_number: number | null;
  source_text: string;
  confidence: number;
};

export type StrictBiomarkerExtractionOutput = {
  report_id: string;
  report_type: ReportType;
  biomarkers: StrictBiomarkerExtractionItem[];
  extraction_warnings: string[];
};

export type ExtractionSource = {
  extractedTablesJson: string[][][] | null;
  extractedText: string;
  reportId: string;
  reportType: ReportType;
};

export function extractBiomarkersFromDocument(source: ExtractionSource): StrictBiomarkerExtractionOutput {
  const items = rowsFromSource(source).map((row) => rowToBiomarker(row));
  const biomarkers = items.filter((item): item is StrictBiomarkerExtractionItem => item !== null);

  return {
    biomarkers,
    extraction_warnings: biomarkers.length === 0 ? ["No supported biomarkers were extracted."] : [],
    report_id: source.reportId,
    report_type: source.reportType
  };
}

export function validateBiomarkerExtractionOutput(output: StrictBiomarkerExtractionOutput) {
  const errors: string[] = [];

  if (!output.report_id) {
    errors.push("report_id is required");
  }

  if (!output.report_type) {
    errors.push("report_type is required");
  }

  output.biomarkers.forEach((marker, index) => {
    const prefix = `biomarkers[${index}]`;
    if (!marker.raw_name) errors.push(`${prefix}.raw_name is required`);
    if (!marker.source_text) errors.push(`${prefix}.source_text is required`);
    if (typeof marker.confidence !== "number") errors.push(`${prefix}.confidence is required`);
    if (marker.confidence < 0 || marker.confidence > 1) errors.push(`${prefix}.confidence must be 0-1`);
    if (marker.value_numeric === null && marker.value_text === null) {
      errors.push(`${prefix} must include value_numeric or value_text`);
    }
    if (!isBiomarkerFlag(marker.lab_flag)) errors.push(`${prefix}.lab_flag is invalid`);
    if (!isBiomarkerFlag(marker.system_flag)) errors.push(`${prefix}.system_flag is invalid`);
  });

  return { errors, ok: errors.length === 0 };
}

export function toBiomarkerResult(input: {
  item: StrictBiomarkerExtractionItem;
  labName: string | null;
  labReportId: string;
  now: string;
  reportDate: string | null;
  userId: string;
}): BiomarkerResultRecord {
  const catalog = input.item.canonical_name ? findCatalogByAlias(input.item.raw_name) : null;
  const isCritical = isCriticalValue(input.item, catalog);
  const systemFlag = isCritical ? "critical" : input.item.system_flag;

  return {
    canonicalBiomarkerKey: catalog?.canonicalKey ?? null,
    canonicalName: catalog?.canonicalName ?? input.item.canonical_name,
    confidenceScore: input.item.confidence,
    correctedAt: null,
    correctedCanonicalName: null,
    correctedConfidenceScore: null,
    correctedBy: null,
    correctedRawName: null,
    correctedReferenceHigh: null,
    correctedReferenceLow: null,
    correctedReferenceRangeText: null,
    correctedReviewRouting: null,
    correctedSourceText: null,
    correctedSystemFlag: null,
    correctedUnit: null,
    correctedValueNumeric: null,
    correctedValueText: null,
    correctionReason: null,
    createdAt: input.now,
    extractionVersion: 1,
    id: randomUUID(),
    isCritical,
    isManuallyCorrected: false,
    isSupported: Boolean(catalog?.isSupported),
    labFlag: input.item.lab_flag,
    labName: input.labName,
    labReportId: input.labReportId,
    originalUnit: input.item.unit,
    pageNumber: input.item.page_number,
    rawName: input.item.raw_name,
    referenceHigh: input.item.reference_high,
    referenceLow: input.item.reference_low,
    referenceRangeText: input.item.reference_range_text,
    reportDate: input.reportDate,
    reviewRouting: routeBiomarkerReview(input.item.confidence, isCritical, systemFlag, catalog),
    sourceBbox: null,
    sourceText: input.item.source_text,
    systemFlag,
    unit: input.item.unit,
    updatedAt: input.now,
    userId: input.userId,
    valueNumeric: input.item.value_numeric,
    valueText: input.item.value_text
  };
}

export function routeBiomarkerReview(
  confidence: number,
  isCritical: boolean,
  systemFlag: BiomarkerFlag,
  catalog: BiomarkerCatalogRecord | null
): ReviewRouting {
  if (isCritical) {
    return "critical_review_required";
  }

  if (confidence < 0.8) {
    return "manual_review_required";
  }

  if (
    confidence < 0.95 ||
    (catalog?.requiresDoctorReviewWhenAbnormal && systemFlag !== "normal" && systemFlag !== "unknown")
  ) {
    return "soft_review";
  }

  return "auto_accept";
}

export function isCriticalValue(
  marker: StrictBiomarkerExtractionItem,
  catalog: BiomarkerCatalogRecord | null
) {
  if (marker.value_numeric === null || !catalog) {
    return false;
  }

  const criticalHigh = catalog.criticalRules.criticalHigh;
  const criticalLow = catalog.criticalRules.criticalLow;

  if (typeof criticalHigh === "number" && marker.value_numeric >= criticalHigh) {
    return true;
  }

  if (typeof criticalLow === "number" && marker.value_numeric <= criticalLow) {
    return true;
  }

  return false;
}

function rowsFromSource(source: ExtractionSource) {
  const tableRows = source.extractedTablesJson?.flat() ?? [];
  const textRows = source.extractedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean));

  const seen = new Set<string>();
  return [...tableRows, ...textRows].filter((row) => {
    if (row.length < 2) {
      return false;
    }
    const key = row.join("|").toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function rowToBiomarker(row: string[]): StrictBiomarkerExtractionItem | null {
  const rawName = row[0]?.trim();
  const value = row[1]?.trim();

  if (!rawName || !value || /^test$/i.test(rawName)) {
    return null;
  }

  const catalog = findCatalogByAlias(rawName);

  if (!catalog) {
    return null;
  }

  const valueNumeric = parseNumber(value);
  const referenceRangeText = getReferenceRangeText(row);
  const parsedRange = parseReferenceRange(referenceRangeText);
  const systemFlag = getSystemFlag(valueNumeric, parsedRange.low, parsedRange.high);
  const unit = row[2]?.trim() && !row[2].match(/[<>-]?\d/) ? row[2].trim() : catalog.defaultUnit;

  return {
    canonical_name: catalog.canonicalName,
    confidence: confidenceForRow(row, catalog),
    lab_flag: "unknown",
    page_number: 1,
    raw_name: rawName,
    reference_high: parsedRange.high,
    reference_low: parsedRange.low,
    reference_range_text: referenceRangeText,
    source_text: row.join(" | "),
    system_flag: systemFlag,
    unit,
    value_numeric: valueNumeric,
    value_text: valueNumeric === null ? value : null
  } satisfies StrictBiomarkerExtractionItem;
}

function getReferenceRangeText(row: string[]) {
  if (row[3]?.trim()) {
    return row[3].trim();
  }

  if (row[2]?.match(/[<>-]\s*\d/)) {
    return row[2].trim();
  }

  return null;
}

function parseNumber(value: string) {
  const match = value.replace(/,/g, "").match(/[-+]?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseReferenceRange(value: string | null) {
  if (!value) {
    return { high: null, low: null };
  }

  const cleaned = value.replace(/,/g, "");
  const rangeMatch = cleaned.match(/([-+]?\d+(\.\d+)?)\s*-\s*([-+]?\d+(\.\d+)?)/);
  if (rangeMatch) {
    return { high: Number(rangeMatch[3]), low: Number(rangeMatch[1]) };
  }

  const lessThan = cleaned.match(/<\s*([-+]?\d+(\.\d+)?)/);
  if (lessThan) {
    return { high: Number(lessThan[1]), low: null };
  }

  const greaterThan = cleaned.match(/>\s*([-+]?\d+(\.\d+)?)/);
  if (greaterThan) {
    return { high: null, low: Number(greaterThan[1]) };
  }

  return { high: null, low: null };
}

function getSystemFlag(value: number | null, low: number | null, high: number | null): BiomarkerFlag {
  if (value === null) {
    return "unknown";
  }

  if (low !== null && value < low) {
    return "low";
  }

  if (high !== null && value > high) {
    return "high";
  }

  if (low !== null || high !== null) {
    return "normal";
  }

  return "unknown";
}

function confidenceForRow(row: string[], catalog: BiomarkerCatalogRecord) {
  const hasRange = row.some((cell) => /[-<>]\s*\d/.test(cell));
  const hasUnit = row.some((cell) => catalog.allowedUnits.includes(cell.trim()));
  return hasRange && hasUnit ? 0.96 : hasRange ? 0.9 : 0.78;
}

function isBiomarkerFlag(value: string): value is BiomarkerFlag {
  return ["low", "high", "normal", "borderline", "critical", "unknown"].includes(value);
}
