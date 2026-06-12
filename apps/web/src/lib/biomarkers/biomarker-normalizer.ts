import { createHash, randomUUID } from "crypto";

import type { BiomarkerExtractionItem } from "../ai";
import { findCatalogByAlias } from "../reports/catalog";
import { isCriticalValue, type StrictBiomarkerExtractionItem } from "../reports/biomarkers";
import type { BiomarkerFlag, BiomarkerResultRecord, ReportType, ReviewRouting } from "../reports/types";
import { reviewStatusForConfidence } from "./biomarker-confidence";

export type NormalizedBiomarker = BiomarkerResultRecord & {
  aiModelRunId?: string | null;
  biomarkerCatalogId?: string | null;
  extractedDocumentId?: string | null;
  normalizationStatus?: "mapped" | "unmapped";
  reportFileId?: string | null;
  reviewStatus?: ReviewRouting;
  sourceHash?: string;
  validationStatus?: "pending" | "valid" | "invalid";
};

export function normalizeBiomarkerItems(input: {
  aiModelRunId: string;
  extractedDocumentId: string;
  items: BiomarkerExtractionItem[];
  labName: string | null;
  labReportId: string;
  now: string;
  reportDate: string | null;
  reportFileId: string;
  reportType: ReportType;
  userId: string;
}) {
  return input.items.map((item) => normalizeBiomarkerItem({ ...input, item }));
}

function normalizeBiomarkerItem(input: {
  aiModelRunId: string;
  extractedDocumentId: string;
  item: BiomarkerExtractionItem;
  labName: string | null;
  labReportId: string;
  now: string;
  reportDate: string | null;
  reportFileId: string;
  reportType: ReportType;
  userId: string;
}): NormalizedBiomarker {
  const catalog = findCatalogByAlias(input.item.raw_name);
  const strictItem = toStrictItem(input.item, catalog?.canonicalName ?? input.item.canonical_name ?? null);
  const isCritical = isCriticalValue(strictItem, catalog);
  const systemFlag = isCritical ? "critical" : strictItem.system_flag;
  const reviewStatus = reviewStatusForConfidence({
    confidenceScore: strictItem.confidence,
    isCritical,
    systemFlag
  });

  return {
    aiModelRunId: input.aiModelRunId,
    biomarkerCatalogId: catalog?.id ?? null,
    canonicalBiomarkerKey: catalog?.canonicalKey ?? null,
    canonicalName: catalog?.canonicalName ?? input.item.canonical_name ?? null,
    confidenceScore: strictItem.confidence,
    correctedAt: null,
    correctedBy: null,
    correctedCanonicalName: null,
    correctedConfidenceScore: null,
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
    extractedDocumentId: input.extractedDocumentId,
    extractionVersion: 1,
    id: cryptoRandomId(),
    isCritical,
    isManuallyCorrected: false,
    isSupported: Boolean(catalog?.isSupported),
    labFlag: strictItem.lab_flag,
    labName: input.labName,
    labReportId: input.labReportId,
    normalizationStatus: catalog ? "mapped" : "unmapped",
    originalUnit: input.item.original_unit ?? strictItem.unit,
    pageNumber: strictItem.page_number,
    rawName: strictItem.raw_name,
    referenceHigh: strictItem.reference_high,
    referenceLow: strictItem.reference_low,
    referenceRangeText: strictItem.reference_range_text,
    reportDate: input.reportDate,
    reportFileId: input.reportFileId,
    reviewRouting: reviewStatus,
    reviewStatus,
    sourceBbox: null,
    sourceHash: sourceHash(strictItem.source_text),
    sourceText: strictItem.source_text,
    systemFlag,
    unit: strictItem.unit,
    updatedAt: input.now,
    userId: input.userId,
    validationStatus: "pending",
    valueNumeric: strictItem.value_numeric,
    valueText: strictItem.value_text
  };
}

function toStrictItem(item: BiomarkerExtractionItem, canonicalName: string | null): StrictBiomarkerExtractionItem {
  return {
    canonical_name: canonicalName,
    confidence: item.confidence,
    lab_flag: item.lab_flag ?? "unknown",
    page_number: item.page_number ?? null,
    raw_name: item.raw_name,
    reference_high: item.reference_high ?? null,
    reference_low: item.reference_low ?? null,
    reference_range_text: item.reference_range_text ?? null,
    source_text: item.source_text,
    system_flag: item.system_flag ?? systemFlagFromRange(item.value_numeric ?? null, item.reference_low ?? null, item.reference_high ?? null),
    unit: item.unit ?? null,
    value_numeric: item.value_numeric ?? null,
    value_text: item.value_text ?? null
  };
}

function systemFlagFromRange(value: number | null, low: number | null, high: number | null): BiomarkerFlag {
  if (value === null || low === null || high === null) return "unknown";
  if (value < low) return "low";
  if (value > high) return "high";
  return "normal";
}

function sourceHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cryptoRandomId() {
  return randomUUID();
}
