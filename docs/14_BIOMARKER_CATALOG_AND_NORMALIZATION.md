# Biomarker Catalog And Normalization

## Current Status

The TypeScript catalog exists in `apps/web/src/lib/reports/catalog.ts` and seeds common CBC, lipid, thyroid, sugar, liver, kidney, vitamin, B12, and ferritin markers. The Supabase migration includes `biomarker_catalog` and `biomarker_aliases`.

## Required V1 Coverage

- CBC: Hemoglobin, WBC, RBC, Platelets, MCV, MCH, MCHC, RDW, Neutrophils, Lymphocytes.
- Lipid: Total Cholesterol, LDL, HDL, VLDL, Triglycerides, Cholesterol/HDL ratio if present.
- Thyroid: TSH, T3, T4, Free T3, Free T4.
- Sugar: HbA1c, Fasting Glucose, Postprandial Glucose, Random Glucose, Fasting Insulin if present.
- Liver: SGPT/ALT, SGOT/AST, Bilirubin total/direct/indirect, ALP, GGT, Albumin, Globulin.
- Kidney: Creatinine, Urea, BUN, Uric Acid, eGFR.
- Vitamins/minerals: Vitamin D, 25-OH Vitamin D, Vitamin B12, Ferritin, Iron, TIBC if present.

## Normalization Rules

- Preserve original `raw_name`.
- Preserve original value, unit, and reference range.
- Map aliases to canonical biomarkers.
- Normalize units only when safe and tested.
- Never overwrite original extracted data silently.
- Manual corrections must be separately marked and audited.
- Store lab-specific reference ranges per result.
- Do not use one global reference range for every user/lab.

## 2026-06-12 Implementation Update

Implemented:

- `apps/web/src/lib/biomarkers/` now exposes catalog, seed, confidence, normalization, and validation modules.
- `apps/web/src/lib/reports/catalog.ts` covers the requested v1 CBC, lipid, thyroid, sugar, liver, kidney, and vitamin/mineral markers.
- `supabase/migrations/202606120001_schema_first_ai_layer.sql` adds schema-first AI columns, indexes, and catalog seed coverage.
- Normalization preserves raw name, value, unit, source text, and reference range.
- Alias mapping is deterministic and case-insensitive.
- Unknown markers remain unmapped instead of being silently coerced.

Review routing:

- `>=0.95`: auto-accept unless critical.
- `0.80-0.95`: soft review.
- `<0.80`: manual/admin review.
- Critical values always route to doctor/admin review.

Remaining limitation:

- Critical thresholds are private-beta placeholders and need doctor review before real PHI beta.
