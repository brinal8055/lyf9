-- Schema-first AI layer hardening for Lyf9 AI private beta.
-- Additive only: preserves existing rows and keeps worker writes service-role controlled.

alter table public.biomarker_catalog add column if not exists display_name text;
alter table public.biomarker_catalog add column if not exists common_units jsonb not null default '[]';
alter table public.biomarker_catalog add column if not exists description text;

update public.biomarker_catalog
set display_name = coalesce(display_name, canonical_name),
    common_units = case
      when common_units = '[]'::jsonb and allowed_units is not null then to_jsonb(allowed_units)
      else common_units
    end;

alter table public.biomarker_results add column if not exists report_file_id uuid references public.report_files(id) on delete cascade;
alter table public.biomarker_results add column if not exists extracted_document_id uuid references public.extracted_documents(id) on delete set null;
alter table public.biomarker_results add column if not exists biomarker_catalog_id uuid references public.biomarker_catalog(id) on delete set null;
alter table public.biomarker_results add column if not exists source_hash text;
alter table public.biomarker_results add column if not exists ai_model_run_id uuid references public.model_runs(id) on delete set null;
alter table public.biomarker_results add column if not exists normalization_status text;
alter table public.biomarker_results add column if not exists validation_status text;
alter table public.biomarker_results add column if not exists review_status text;
alter table public.biomarker_results add column if not exists corrected_value_numeric numeric;
alter table public.biomarker_results add column if not exists corrected_value_text text;
alter table public.biomarker_results add column if not exists corrected_unit text;

alter table public.health_insights add column if not exists report_file_id uuid references public.report_files(id) on delete cascade;
alter table public.health_insights add column if not exists insight_type text not null default 'patient_explanation';
alter table public.health_insights add column if not exists explanation_json jsonb not null default '{}';
alter table public.health_insights add column if not exists ai_model_run_id uuid references public.model_runs(id) on delete set null;
alter table public.health_insights add column if not exists safety_status text not null default 'review_required';
alter table public.health_insights add column if not exists doctor_review_required boolean not null default false;
alter table public.health_insights add column if not exists doctor_review_reason text;
alter table public.health_insights add column if not exists published_at timestamptz;

alter table public.health_risk_flags add column if not exists report_file_id uuid references public.report_files(id) on delete cascade;
alter table public.health_risk_flags add column if not exists source text not null default 'deterministic_rules';
alter table public.health_risk_flags add column if not exists rule_version text;
alter table public.health_risk_flags add column if not exists status text not null default 'open';
alter table public.health_risk_flags add column if not exists updated_at timestamptz not null default now();

alter table public.model_runs add column if not exists report_file_id uuid references public.report_files(id) on delete set null;
alter table public.model_runs add column if not exists extracted_document_id uuid references public.extracted_documents(id) on delete set null;
alter table public.model_runs add column if not exists schema_version text;
alter table public.model_runs add column if not exists error_code text;
alter table public.model_runs add column if not exists token_input_count integer;
alter table public.model_runs add column if not exists token_output_count integer;
alter table public.model_runs add column if not exists cost_estimate_minor_units integer;
alter table public.model_runs add column if not exists safety_filter_status text;

insert into public.biomarker_catalog (canonical_key, canonical_name, display_name, category, default_unit, allowed_units, common_units, is_supported, catalog_version)
values
  ('hemoglobin', 'Hemoglobin', 'Hemoglobin', 'cbc', 'g/dL', array['g/dL'], '["g/dL"]', true, 'biomarker_catalog_v1'),
  ('wbc', 'WBC', 'WBC', 'cbc', '/cumm', array['/cumm', 'cells/cumm'], '["/cumm","cells/cumm"]', true, 'biomarker_catalog_v1'),
  ('rbc', 'RBC', 'RBC', 'cbc', 'million/cumm', array['million/cumm'], '["million/cumm"]', true, 'biomarker_catalog_v1'),
  ('platelets', 'Platelets', 'Platelets', 'cbc', '/cumm', array['/cumm'], '["/cumm"]', true, 'biomarker_catalog_v1'),
  ('mcv', 'MCV', 'MCV', 'cbc', 'fL', array['fL'], '["fL"]', true, 'biomarker_catalog_v1'),
  ('mch', 'MCH', 'MCH', 'cbc', 'pg', array['pg'], '["pg"]', true, 'biomarker_catalog_v1'),
  ('mchc', 'MCHC', 'MCHC', 'cbc', 'g/dL', array['g/dL'], '["g/dL"]', true, 'biomarker_catalog_v1'),
  ('rdw', 'RDW', 'RDW', 'cbc', '%', array['%'], '["%"]', true, 'biomarker_catalog_v1'),
  ('neutrophils', 'Neutrophils', 'Neutrophils', 'cbc', '%', array['%'], '["%"]', true, 'biomarker_catalog_v1'),
  ('lymphocytes', 'Lymphocytes', 'Lymphocytes', 'cbc', '%', array['%'], '["%"]', true, 'biomarker_catalog_v1'),
  ('total_cholesterol', 'Total Cholesterol', 'Total Cholesterol', 'lipid', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('ldl', 'LDL', 'LDL', 'lipid', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('hdl', 'HDL', 'HDL', 'lipid', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('vldl', 'VLDL', 'VLDL', 'lipid', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('triglycerides', 'Triglycerides', 'Triglycerides', 'lipid', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('cholesterol_hdl_ratio', 'Cholesterol/HDL ratio', 'Cholesterol/HDL ratio', 'lipid', null, array['ratio'], '["ratio"]', true, 'biomarker_catalog_v1'),
  ('tsh', 'TSH', 'TSH', 'thyroid', 'uIU/mL', array['uIU/mL','mIU/L'], '["uIU/mL","mIU/L"]', true, 'biomarker_catalog_v1'),
  ('t3', 'T3', 'T3', 'thyroid', 'ng/dL', array['ng/dL'], '["ng/dL"]', true, 'biomarker_catalog_v1'),
  ('t4', 'T4', 'T4', 'thyroid', 'ug/dL', array['ug/dL'], '["ug/dL"]', true, 'biomarker_catalog_v1'),
  ('free_t3', 'Free T3', 'Free T3', 'thyroid', 'pg/mL', array['pg/mL'], '["pg/mL"]', true, 'biomarker_catalog_v1'),
  ('free_t4', 'Free T4', 'Free T4', 'thyroid', 'ng/dL', array['ng/dL'], '["ng/dL"]', true, 'biomarker_catalog_v1'),
  ('hba1c', 'HbA1c', 'HbA1c', 'hba1c_glucose', '%', array['%'], '["%"]', true, 'biomarker_catalog_v1'),
  ('fasting_glucose', 'Fasting glucose', 'Fasting glucose', 'hba1c_glucose', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('postprandial_glucose', 'Postprandial glucose', 'Postprandial glucose', 'hba1c_glucose', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('random_glucose', 'Random glucose', 'Random glucose', 'hba1c_glucose', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('fasting_insulin', 'Fasting insulin', 'Fasting insulin', 'hba1c_glucose', 'uIU/mL', array['uIU/mL'], '["uIU/mL"]', true, 'biomarker_catalog_v1'),
  ('sgpt_alt', 'SGPT/ALT', 'SGPT/ALT', 'lft', 'U/L', array['U/L'], '["U/L"]', true, 'biomarker_catalog_v1'),
  ('sgot_ast', 'SGOT/AST', 'SGOT/AST', 'lft', 'U/L', array['U/L'], '["U/L"]', true, 'biomarker_catalog_v1'),
  ('bilirubin', 'Bilirubin Total', 'Bilirubin Total', 'lft', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('bilirubin_direct', 'Bilirubin Direct', 'Bilirubin Direct', 'lft', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('bilirubin_indirect', 'Bilirubin Indirect', 'Bilirubin Indirect', 'lft', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('alp', 'ALP', 'ALP', 'lft', 'U/L', array['U/L'], '["U/L"]', true, 'biomarker_catalog_v1'),
  ('ggt', 'GGT', 'GGT', 'lft', 'U/L', array['U/L'], '["U/L"]', true, 'biomarker_catalog_v1'),
  ('albumin', 'Albumin', 'Albumin', 'lft', 'g/dL', array['g/dL'], '["g/dL"]', true, 'biomarker_catalog_v1'),
  ('globulin', 'Globulin', 'Globulin', 'lft', 'g/dL', array['g/dL'], '["g/dL"]', true, 'biomarker_catalog_v1'),
  ('creatinine', 'Creatinine', 'Creatinine', 'kft', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('urea', 'Urea', 'Urea', 'kft', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('bun', 'BUN', 'BUN', 'kft', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('uric_acid', 'Uric acid', 'Uric acid', 'kft', 'mg/dL', array['mg/dL'], '["mg/dL"]', true, 'biomarker_catalog_v1'),
  ('egfr', 'eGFR', 'eGFR', 'kft', 'mL/min/1.73m2', array['mL/min/1.73m2'], '["mL/min/1.73m2"]', true, 'biomarker_catalog_v1'),
  ('vitamin_d', 'Vitamin D', 'Vitamin D', 'vitamin', 'ng/mL', array['ng/mL'], '["ng/mL"]', true, 'biomarker_catalog_v1'),
  ('vitamin_b12', 'Vitamin B12', 'Vitamin B12', 'vitamin', 'pg/mL', array['pg/mL'], '["pg/mL"]', true, 'biomarker_catalog_v1'),
  ('ferritin', 'Ferritin', 'Ferritin', 'vitamin', 'ng/mL', array['ng/mL'], '["ng/mL"]', true, 'biomarker_catalog_v1'),
  ('iron', 'Iron', 'Iron', 'vitamin', 'ug/dL', array['ug/dL'], '["ug/dL"]', true, 'biomarker_catalog_v1'),
  ('tibc', 'TIBC', 'TIBC', 'vitamin', 'ug/dL', array['ug/dL'], '["ug/dL"]', true, 'biomarker_catalog_v1')
on conflict (canonical_key) do update
set canonical_name = excluded.canonical_name,
    display_name = excluded.display_name,
    category = excluded.category,
    allowed_units = excluded.allowed_units,
    common_units = excluded.common_units,
    is_supported = excluded.is_supported,
    catalog_version = excluded.catalog_version,
    updated_at = now();

insert into public.biomarker_aliases (biomarker_catalog_id, alias, normalized_alias, locale)
select c.id, alias_value, lower(regexp_replace(alias_value, '[^a-zA-Z0-9]+', ' ', 'g')), 'en-IN'
from public.biomarker_catalog c
join (
  values
    ('hemoglobin', 'Hb'), ('hemoglobin', 'Haemoglobin'),
    ('wbc', 'Total Leukocyte Count'), ('wbc', 'TLC'),
    ('platelets', 'Platelet Count'),
    ('cholesterol_hdl_ratio', 'TC/HDL Ratio'),
    ('free_t3', 'FT3'), ('free_t4', 'FT4'),
    ('fasting_glucose', 'FBS'), ('postprandial_glucose', 'PPBS'), ('random_glucose', 'RBS'),
    ('sgpt_alt', 'SGPT'), ('sgpt_alt', 'ALT'),
    ('sgot_ast', 'SGOT'), ('sgot_ast', 'AST'),
    ('bilirubin', 'Total Bilirubin'),
    ('bun', 'Blood Urea Nitrogen'),
    ('vitamin_d', '25 OH Vitamin D'),
    ('tibc', 'Total Iron Binding Capacity')
) as a(canonical_key, alias_value) on a.canonical_key = c.canonical_key
on conflict do nothing;

create index if not exists biomarker_catalog_canonical_name_idx on public.biomarker_catalog (canonical_name);
create index if not exists biomarker_aliases_normalized_alias_idx on public.biomarker_aliases (normalized_alias);
create index if not exists biomarker_results_user_id_idx on public.biomarker_results (user_id);
create index if not exists biomarker_results_report_file_id_idx on public.biomarker_results (report_file_id);
create index if not exists biomarker_results_canonical_name_idx on public.biomarker_results (canonical_name);
create index if not exists biomarker_results_confidence_score_idx on public.biomarker_results (confidence_score);
create index if not exists health_insights_user_id_idx on public.health_insights (user_id);
create index if not exists health_insights_lab_report_status_idx on public.health_insights (lab_report_id, status);
create index if not exists health_risk_flags_user_id_idx on public.health_risk_flags (user_id);
create index if not exists health_risk_flags_lab_report_severity_idx on public.health_risk_flags (lab_report_id, severity);
create index if not exists model_runs_user_id_idx on public.model_runs (user_id);
create index if not exists model_runs_report_file_id_idx on public.model_runs (report_file_id);
create index if not exists model_runs_lab_report_id_idx on public.model_runs (lab_report_id);
create index if not exists model_runs_task_type_idx on public.model_runs (task_type);
create index if not exists model_runs_status_idx on public.model_runs (status);
