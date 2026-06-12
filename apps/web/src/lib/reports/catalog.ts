import type {
  BiomarkerAliasRecord,
  BiomarkerCatalogRecord,
  ReportType
} from "./types";

const createdAt = "2026-06-05T00:00:00.000Z";

type CatalogSeed = {
  aliases: string[];
  allowedUnits: string[];
  canonicalKey: string;
  canonicalName: string;
  category: string;
  criticalHigh?: number;
  criticalLow?: number;
  defaultUnit: string | null;
  requiresDoctorReviewWhenAbnormal?: boolean;
  supportedReportTypes: ReportType[];
};

const seeds: CatalogSeed[] = [
  marker("hemoglobin", "Hemoglobin", "cbc", "g/dL", ["Hemoglobin", "Haemoglobin", "Hb"], ["g/dL"], { criticalLow: 7 }),
  marker("wbc", "WBC", "cbc", "/cumm", ["WBC", "WBC Count", "Total Leukocyte Count", "TLC"], ["/cumm", "cells/cumm"]),
  marker("rbc", "RBC", "cbc", "million/cumm", ["RBC", "RBC Count"], ["million/cumm"]),
  marker("platelets", "Platelets", "cbc", "/cumm", ["Platelets", "Platelet Count"], ["/cumm"], { criticalLow: 20000 }),
  marker("mcv", "MCV", "cbc", "fL", ["MCV", "Mean Corpuscular Volume"], ["fL"]),
  marker("mch", "MCH", "cbc", "pg", ["MCH", "Mean Corpuscular Hemoglobin"], ["pg"]),
  marker("mchc", "MCHC", "cbc", "g/dL", ["MCHC", "Mean Corpuscular Hemoglobin Concentration"], ["g/dL"]),
  marker("rdw", "RDW", "cbc", "%", ["RDW", "RDW-CV", "Red Cell Distribution Width"], ["%"]),
  marker("neutrophils", "Neutrophils", "cbc", "%", ["Neutrophils", "Neutrophil Count", "Polymorphs"], ["%"]),
  marker("lymphocytes", "Lymphocytes", "cbc", "%", ["Lymphocytes", "Lymphocyte Count"], ["%"]),
  marker("ldl", "LDL", "lipid", "mg/dL", ["LDL", "LDL Cholesterol"], ["mg/dL"], { requiresDoctorReviewWhenAbnormal: true }),
  marker("hdl", "HDL", "lipid", "mg/dL", ["HDL", "HDL Cholesterol"], ["mg/dL"]),
  marker("vldl", "VLDL", "lipid", "mg/dL", ["VLDL", "VLDL Cholesterol"], ["mg/dL"]),
  marker("triglycerides", "Triglycerides", "lipid", "mg/dL", ["Triglycerides", "TG"], ["mg/dL"], { criticalHigh: 500 }),
  marker("total_cholesterol", "Total Cholesterol", "lipid", "mg/dL", ["Total Cholesterol", "Cholesterol"], ["mg/dL"]),
  marker("cholesterol_hdl_ratio", "Cholesterol/HDL ratio", "lipid", null, ["Cholesterol/HDL Ratio", "Total Cholesterol HDL Ratio", "TC/HDL Ratio"], ["ratio"]),
  marker("tsh", "TSH", "thyroid", "uIU/mL", ["TSH", "Thyroid Stimulating Hormone"], ["uIU/mL", "mIU/L"], { criticalHigh: 20, criticalLow: 0.01 }),
  marker("t3", "T3", "thyroid", "ng/dL", ["T3", "Triiodothyronine"], ["ng/dL"]),
  marker("t4", "T4", "thyroid", "ug/dL", ["T4", "Thyroxine"], ["ug/dL"]),
  marker("free_t3", "Free T3", "thyroid", "pg/mL", ["Free T3", "FT3"], ["pg/mL"]),
  marker("free_t4", "Free T4", "thyroid", "ng/dL", ["Free T4", "FT4"], ["ng/dL"]),
  marker("hba1c", "HbA1c", "hba1c_glucose", "%", ["HbA1c", "Glycated Hemoglobin"], ["%"], { criticalHigh: 10 }),
  marker("fasting_glucose", "Fasting glucose", "hba1c_glucose", "mg/dL", ["Fasting glucose", "Fasting Blood Sugar", "FBS", "Glucose"], ["mg/dL"], { criticalHigh: 300, criticalLow: 50 }),
  marker("postprandial_glucose", "Postprandial glucose", "hba1c_glucose", "mg/dL", ["Postprandial Glucose", "Post Prandial Blood Sugar", "PPBS"], ["mg/dL"], { criticalHigh: 300, criticalLow: 50 }),
  marker("random_glucose", "Random glucose", "hba1c_glucose", "mg/dL", ["Random Glucose", "Random Blood Sugar", "RBS"], ["mg/dL"], { criticalHigh: 300, criticalLow: 50 }),
  marker("fasting_insulin", "Fasting insulin", "hba1c_glucose", "uIU/mL", ["Fasting Insulin", "Insulin Fasting"], ["uIU/mL"]),
  marker("sgpt_alt", "SGPT/ALT", "lft", "U/L", ["SGPT", "ALT", "Alanine Transaminase"], ["U/L"], { criticalHigh: 500 }),
  marker("sgot_ast", "SGOT/AST", "lft", "U/L", ["SGOT", "AST", "Aspartate Transaminase"], ["U/L"], { criticalHigh: 500 }),
  marker("bilirubin", "Bilirubin Total", "lft", "mg/dL", ["Bilirubin", "Total Bilirubin", "Bilirubin Total"], ["mg/dL"], { criticalHigh: 5 }),
  marker("bilirubin_direct", "Bilirubin Direct", "lft", "mg/dL", ["Direct Bilirubin", "Bilirubin Direct"], ["mg/dL"]),
  marker("bilirubin_indirect", "Bilirubin Indirect", "lft", "mg/dL", ["Indirect Bilirubin", "Bilirubin Indirect"], ["mg/dL"]),
  marker("alp", "ALP", "lft", "U/L", ["ALP", "Alkaline Phosphatase"], ["U/L"]),
  marker("ggt", "GGT", "lft", "U/L", ["GGT", "Gamma GT", "Gamma Glutamyl Transferase"], ["U/L"]),
  marker("albumin", "Albumin", "lft", "g/dL", ["Albumin"], ["g/dL"]),
  marker("globulin", "Globulin", "lft", "g/dL", ["Globulin"], ["g/dL"]),
  marker("creatinine", "Creatinine", "kft", "mg/dL", ["Creatinine", "Serum Creatinine"], ["mg/dL"], { criticalHigh: 3 }),
  marker("urea", "Urea", "kft", "mg/dL", ["Urea", "Blood Urea"], ["mg/dL"]),
  marker("bun", "BUN", "kft", "mg/dL", ["BUN", "Blood Urea Nitrogen"], ["mg/dL"]),
  marker("uric_acid", "Uric acid", "kft", "mg/dL", ["Uric Acid"], ["mg/dL"]),
  marker("egfr", "eGFR", "kft", "mL/min/1.73m2", ["eGFR", "Estimated GFR"], ["mL/min/1.73m2"], { criticalLow: 30 }),
  marker("vitamin_d", "Vitamin D", "vitamin", "ng/mL", ["Vitamin D", "25-hydroxy Vitamin D", "25 OH Vitamin D"], ["ng/mL"]),
  marker("vitamin_b12", "Vitamin B12", "vitamin", "pg/mL", ["Vitamin B12", "B12"], ["pg/mL"]),
  marker("ferritin", "Ferritin", "vitamin", "ng/mL", ["Ferritin"], ["ng/mL"]),
  marker("iron", "Iron", "vitamin", "ug/dL", ["Iron", "Serum Iron"], ["ug/dL"]),
  marker("tibc", "TIBC", "vitamin", "ug/dL", ["TIBC", "Total Iron Binding Capacity"], ["ug/dL"])
];

export const BIOMARKER_CATALOG_V1: BiomarkerCatalogRecord[] = seeds.map((seed) => ({
  allowedUnits: seed.allowedUnits,
  canonicalKey: seed.canonicalKey,
  canonicalName: seed.canonicalName,
  catalogVersion: "biomarker_catalog_v1",
  category: seed.category,
  createdAt,
  criticalRules: {
    criticalHigh: seed.criticalHigh ?? null,
    criticalLow: seed.criticalLow ?? null,
    reviewedByDoctor: false,
    reviewNote: "Placeholder threshold for private-beta routing only."
  },
  defaultUnit: seed.defaultUnit,
  descriptionForAdmin: "Private beta v1 catalog seed.",
  id: `catalog_${seed.canonicalKey}`,
  isSupported: true,
  normalRangeRules: {},
  requiresDoctorReviewWhenAbnormal: seed.requiresDoctorReviewWhenAbnormal ?? false,
  supportedReportTypes: seed.supportedReportTypes,
  updatedAt: createdAt
}));

export const BIOMARKER_ALIASES_V1: BiomarkerAliasRecord[] = seeds.flatMap((seed) =>
  seed.aliases.map((alias) => ({
    alias,
    biomarkerCatalogId: `catalog_${seed.canonicalKey}`,
    confidenceWeight: 1,
    createdAt,
    id: `alias_${seed.canonicalKey}_${normalizeAlias(alias)}`,
    labName: null,
    locale: "en-IN",
    normalizedAlias: normalizeAlias(alias),
    updatedAt: createdAt
  }))
);

export function normalizeAlias(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findCatalogByAlias(rawName: string) {
  const normalized = normalizeAlias(rawName);
  const alias = BIOMARKER_ALIASES_V1.find(
    (candidate) => candidate.normalizedAlias === normalized
  );

  if (!alias) {
    return null;
  }

  return BIOMARKER_CATALOG_V1.find((marker) => marker.id === alias.biomarkerCatalogId) ?? null;
}

function marker(
  canonicalKey: string,
  canonicalName: string,
  reportType: ReportType,
  defaultUnit: string | null,
  aliases: string[],
  allowedUnits: string[],
  options: {
    criticalHigh?: number;
    criticalLow?: number;
    requiresDoctorReviewWhenAbnormal?: boolean;
  } = {}
): CatalogSeed {
  return {
    aliases,
    allowedUnits,
    canonicalKey,
    canonicalName,
    category: reportType,
    criticalHigh: options.criticalHigh,
    criticalLow: options.criticalLow,
    defaultUnit,
    requiresDoctorReviewWhenAbnormal: options.requiresDoctorReviewWhenAbnormal,
    supportedReportTypes: [reportType, "full_body_supported"]
  };
}
