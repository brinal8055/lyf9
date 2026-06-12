# lyf9.ai Database Schema

## Principles

- Use PostgreSQL.
- Use UUID primary keys.
- Add `created_at` and `updated_at` to mutable tables.
- Store `deleted_at` where records need lifecycle control.
- Keep source values from lab reports even when normalized values are added.
- Prefer typed columns for core medical data; use JSONB for versioned AI payloads and flexible metadata.
- Every user-facing insight must be traceable to a report, biomarker source, model run, and optional doctor review.

## Common Enums

```txt
user_role:
  user, support, admin, doctor, superadmin

report_file_status:
  uploaded, scan_pending, scan_passed, scan_failed, unsupported, processing,
  manual_review_required, published, failed, archived, deleted

processing_job_status:
  queued, running, succeeded, failed, cancelled

processing_job_state:
  uploaded, scan_pending, scan_passed, scan_failed, classified, unsupported,
  text_extraction_pending, text_extracted, ocr_required,
  biomarker_extraction_pending, biomarker_extracted, normalized, validated,
  low_confidence_review_required, critical_review_required,
  insight_generation_pending, insight_generated, doctor_review_required,
  doctor_reviewed, published, failed, archived, deleted

biomarker_flag:
  low, high, normal, borderline, critical, unknown

insight_status:
  draft, ai_only_ready, doctor_review_required, doctor_reviewed, published,
  rejected, archived

doctor_review_status:
  requested, assigned, in_review, approved, edited_approved, rejected,
  more_info_requested, cancelled

reminder_status:
  scheduled, sent, dismissed, completed, cancelled

feedback_status:
  new, triaged, resolved, archived
```

## users

Stores account-level identity and role.

```txt
id uuid primary key
auth_provider text not null
auth_provider_user_id text not null unique
email text not null unique
phone text null
full_name text null
role user_role not null default 'user'
is_active boolean not null default true
last_login_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

Indexes:

- `users(email)`
- `users(auth_provider, auth_provider_user_id)`

## user_profiles

Stores non-clinical profile data and beta preferences.

```txt
id uuid primary key
user_id uuid not null references users(id)
display_name text null
preferred_name text null
phone_verified boolean not null default false
country text not null default 'IN'
city text null
timezone text not null default 'Asia/Kolkata'
preferred_language text null
beta_segment text null
onboarding_status text not null default 'started'
marketing_opt_in boolean not null default false
metadata jsonb not null default '{}'
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

Indexes:

- `user_profiles(user_id)`
- `user_profiles(beta_segment)`

## user_health_profiles

Stores health context used for safer explanations.

```txt
id uuid primary key
user_id uuid not null references users(id)
date_of_birth date null
age_years int null
sex_at_birth text null
gender_identity text null
height_cm numeric(5,2) null
weight_kg numeric(5,2) null
city text null
known_conditions text[] not null default '{}'
surgeries text[] not null default '{}'
allergies text[] not null default '{}'
family_history text[] not null default '{}'
current_medications jsonb not null default '[]'
symptoms text[] not null default '{}'
lifestyle jsonb not null default '{}'
goals text[] not null default '{}'
notes text null
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

Notes:

- `current_medications` may contain name, dose, duration, and reason, but AI must not recommend medicine changes.
- Use explicit consent before using this context in AI analysis.

## user_consents

Purpose-wise consent history.

```txt
id uuid primary key
user_id uuid not null references users(id)
consent_type text not null
granted boolean not null
version text not null
purpose text not null
legal_text_hash text not null
granted_at timestamptz null
revoked_at timestamptz null
ip_address inet null
user_agent text null
created_at timestamptz not null
```

Consent types:

```txt
lab_report_processing
ai_analysis
doctor_review
reminders_notifications
payment_processing
marketing_communication
lab_partner_sharing
pharmacy_partner_sharing
wearable_data_processing
genetics_data_processing
abdm_record_fetch
```

Indexes:

- `user_consents(user_id, consent_type, created_at desc)`

## questionnaire_responses

Stores versioned questionnaire answers for medical history, symptoms, lifestyle, and goals.

```txt
id uuid primary key
user_id uuid not null references users(id)
questionnaire_key text not null
questionnaire_version text not null
response_json jsonb not null
completed boolean not null default false
completed_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

Rules:

- Keep the questionnaire key stable, for example `beta_health_intake_v1`.
- Store answers as JSONB for form iteration, but migrate durable clinical fields into `user_health_profiles` when they affect AI safety.
- Do not use questionnaire data in AI analysis unless the relevant consent is granted.

Indexes:

- `questionnaire_responses(user_id, questionnaire_key, questionnaire_version)`

## report_files

Stores private uploaded file metadata.

```txt
id uuid primary key
user_id uuid not null references users(id)
original_filename text not null
mime_type text not null
file_size_bytes bigint not null
checksum_sha256 text not null
storage_bucket text not null
storage_key text not null
status report_file_status not null default 'uploaded'
unsupported_reason text null
uploaded_at timestamptz not null
scan_status text null
scan_completed_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

Constraints:

- Supported MIME types: PDF, JPG, PNG.
- Unique optional idempotency: `(user_id, checksum_sha256)` can prevent accidental duplicate uploads.

## lab_reports

Represents a parsed report object derived from a file.

```txt
id uuid primary key
user_id uuid not null references users(id)
report_file_id uuid not null references report_files(id)
report_type text null
supported_panels text[] not null default '{}'
unsupported_sections text[] not null default '{}'
lab_name text null
patient_name_from_report text null
sample_date date null
report_date date null
detected_language text null
parser_version text not null
extraction_version int not null default 1
raw_extracted_text text null
raw_extracted_tables jsonb null
classification_confidence numeric(4,3) null
status text not null default 'draft'
published_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

Notes:

- Store raw extraction only as needed and protect it as PHI.
- If a full-body report contains unsupported panels, list them in `unsupported_sections`.

## extracted_documents

Stores Phase 3A parser output before biomarker extraction. Treat extracted text as PHI.

```txt
id uuid primary key
report_id uuid not null references lab_reports(id)
report_file_id uuid not null references report_files(id)
extraction_version int not null default 1
parser_name text not null
parser_version text not null
extracted_text text null
extracted_tables_json jsonb null
page_count int null
status text not null
error text null
created_at timestamptz not null
```

Statuses:

```txt
text_extracted
ocr_required
unsupported
extraction_failed
```

Rules:

- Do not expose raw extracted text in public user UI.
- Admin raw text access must be operationally justified and audited.
- `ocr_required` means the file appears scanned or low quality and real OCR is not available.
- Unsupported reports may have no extracted text if blocked by filename/type classification.

## biomarker_catalog

Canonical catalog of supported biomarkers and deterministic interpretation metadata.

```txt
id uuid primary key
canonical_key text not null unique
canonical_name text not null
category text not null
supported_report_types text[] not null default '{}'
default_unit text null
allowed_units text[] not null default '{}'
normal_range_rules jsonb not null default '{}'
critical_rules jsonb not null default '{}'
is_supported boolean not null default true
requires_doctor_review_when_abnormal boolean not null default false
description_for_admin text null
catalog_version text not null
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

Rules:

- Start with common CBC, lipid, thyroid, liver, kidney, HbA1c/glucose, Vitamin D, B12, and ferritin markers.
- Critical rules must be reviewed by a qualified doctor before production use.
- Never use catalog text as a substitute for user-facing AI safety rules.

Indexes:

- `biomarker_catalog(canonical_key)`
- `biomarker_catalog(category)`

## biomarker_aliases

Maps lab-specific names to canonical biomarker keys.

```txt
id uuid primary key
biomarker_catalog_id uuid not null references biomarker_catalog(id)
alias text not null
normalized_alias text not null
lab_name text null
locale text null
confidence_weight numeric(4,3) not null default 1.000
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

Indexes:

- `biomarker_aliases(normalized_alias)`
- `biomarker_aliases(biomarker_catalog_id)`

## biomarker_results

Most important clinical data table.

```txt
id uuid primary key
user_id uuid not null references users(id)
lab_report_id uuid not null references lab_reports(id)
extraction_version int not null default 1
raw_name text not null
canonical_name text null
canonical_biomarker_key text null
value_numeric numeric null
value_text text null
unit text null
original_unit text null
reference_range_text text null
reference_low numeric null
reference_high numeric null
lab_flag biomarker_flag not null default 'unknown'
system_flag biomarker_flag not null default 'unknown'
confidence_score numeric(4,3) not null
page_number int null
source_text text not null
source_bbox jsonb null
is_supported boolean not null default true
is_critical boolean not null default false
is_manually_corrected boolean not null default false
corrected_by uuid null references users(id)
corrected_at timestamptz null
report_date date null
lab_name text null
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

Indexes:

- `biomarker_results(user_id, canonical_biomarker_key, report_date)`
- `biomarker_results(lab_report_id)`
- `biomarker_results(system_flag)`

## processing_jobs

Tracks report processing state machine.

```txt
id uuid primary key
user_id uuid not null references users(id)
report_file_id uuid not null references report_files(id)
lab_report_id uuid null references lab_reports(id)
job_type text not null
status processing_job_status not null default 'queued'
current_state processing_job_state not null default 'uploaded'
idempotency_key text not null unique
attempt_count int not null default 0
max_attempts int not null default 3
queued_at timestamptz not null
started_at timestamptz null
completed_at timestamptz null
failed_at timestamptz null
error_code text null
error_message text null
worker_id text null
metadata jsonb not null default '{}'
created_at timestamptz not null
updated_at timestamptz not null
```

## processing_job_steps

Tracks step-level execution for debugging, retries, and admin visibility.

```txt
id uuid primary key
processing_job_id uuid not null references processing_jobs(id)
step_key text not null
state processing_job_state not null
status processing_job_status not null default 'queued'
attempt_number int not null default 1
started_at timestamptz null
completed_at timestamptz null
failed_at timestamptz null
duration_ms int null
error_code text null
error_message text null
safe_input_summary jsonb not null default '{}'
safe_output_summary jsonb not null default '{}'
created_at timestamptz not null
updated_at timestamptz not null
```

Rules:

- Store summaries only; do not store raw report text or full PHI-heavy model prompts in step records.
- Use one row per worker step such as scan, classify, extract_text, extract_biomarkers, normalize, generate_explanation, safety_filter, and publish.

Indexes:

- `processing_job_steps(processing_job_id, step_key)`
- `processing_job_steps(status, created_at)`

## model_runs

Auditable AI task metadata.

```txt
id uuid primary key
user_id uuid null references users(id)
lab_report_id uuid null references lab_reports(id)
processing_job_id uuid null references processing_jobs(id)
task_type text not null
model_name text not null
prompt_version text not null
schema_version text not null
input_hash text not null
output_hash text null
output_json jsonb null
token_input_count int null
token_output_count int null
cost_estimate_minor_units int null
latency_ms int null
safety_filter_status text null
created_at timestamptz not null
```

Rules:

- Do not store unnecessary raw PHI in `output_json`.
- If output contains PHI, treat this table with the same access controls as report data.

## health_insights

Stores AI-only or doctor-reviewed user-facing report explanations.

```txt
id uuid primary key
user_id uuid not null references users(id)
lab_report_id uuid not null references lab_reports(id)
model_run_id uuid null references model_runs(id)
doctor_review_id uuid null
status insight_status not null default 'draft'
summary text not null
normal_summary text null
attention_summary text null
critical_summary text null
questions_for_doctor jsonb not null default '[]'
general_next_steps jsonb not null default '[]'
retest_suggestions jsonb not null default '[]'
disclaimer_text text not null
source_biomarker_ids uuid[] not null default '{}'
safety_flags jsonb not null default '[]'
published_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

Notes:

- `general_next_steps` must not include prescriptions, medicine changes, or supplement treatment protocols unless doctor-reviewed and legally cleared.

## health_risk_flags

Stores deterministic safety routing flags generated before insight publication.

```txt
id uuid primary key
user_id uuid not null references users(id)
lab_report_id uuid not null references lab_reports(id)
biomarker_result_id uuid null references biomarker_results(id)
flag_type text not null
severity text not null
reason text not null
created_at timestamptz not null
```

Flag types:

```txt
critical_value
low_confidence
unsafe_language
```

Rules:

- Critical-value and low-confidence flags must be created by deterministic code.
- Unsafe-language flags must be created before a user-facing insight is considered publishable.
- Critical values route to doctor/admin review regardless of extraction confidence.
- These flags are routing records, not diagnoses.

## doctor_reviews

Review workflow for optional or required doctor review.

```txt
id uuid primary key
user_id uuid not null references users(id)
lab_report_id uuid not null references lab_reports(id)
health_insight_id uuid null references health_insights(id)
assigned_doctor_id uuid null references users(id)
requested_by uuid null references users(id)
status doctor_review_status not null default 'requested'
priority text not null default 'standard'
ai_draft_snapshot jsonb null
doctor_edited_summary text null
doctor_notes text null
request_more_info_message text null
rejection_reason text null
approved_at timestamptz null
rejected_at timestamptz null
requested_at timestamptz not null
assigned_at timestamptz null
completed_at timestamptz null
sla_due_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
```

Actions:

- Approve.
- Edit and approve.
- Reject.
- Request more info.

## audit_logs

Immutable log of sensitive events.

```txt
id uuid primary key
actor_user_id uuid null references users(id)
actor_role user_role null
action text not null
entity_type text not null
entity_id uuid null
request_id text null
ip_address inet null
user_agent text null
safe_metadata jsonb not null default '{}'
created_at timestamptz not null
```

Rules:

- Do not store raw report text, diagnosis-like content, phone numbers, addresses, or full AI prompts in audit metadata.
- Restrict audit log access to admin/superadmin.

## reminders

Retest and follow-up reminders.

```txt
id uuid primary key
user_id uuid not null references users(id)
lab_report_id uuid null references lab_reports(id)
biomarker_result_id uuid null references biomarker_results(id)
reminder_type text not null
title text not null
body text null
scheduled_for timestamptz not null
status reminder_status not null default 'scheduled'
channel text not null default 'email'
sent_at timestamptz null
dismissed_at timestamptz null
completed_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

## payments

Private beta payment, pricing placeholder, or Razorpay sandbox records.

```txt
id uuid primary key
user_id uuid references users(id)
lab_report_id uuid null references lab_reports(id)
doctor_review_id uuid null references doctor_reviews(id)
provider text not null
provider_payment_id text null
provider_order_id text null
product_type text not null
amount_minor_units int not null
currency text not null default 'INR'
status text not null
metadata jsonb not null default '{}'
created_at timestamptz not null
updated_at timestamptz not null
deleted_at timestamptz null
```

Product types:

```txt
ai_report_explanation
doctor_review
private_beta_plan
manual_beta_override
```

Rules:

- Phase 6 may use placeholder records before live payment collection.
- Do not publicly launch paid doctor-reviewed flows before legal review.

Indexes:

- `payments(user_id, created_at desc)`
- `payments(provider, provider_payment_id)`

## feedback_events

Private beta feedback from users, admins, and doctors.

```txt
id uuid primary key
user_id uuid null references users(id)
lab_report_id uuid null references lab_reports(id)
doctor_review_id uuid null references doctor_reviews(id)
feedback_type text not null
rating int null
message text null
metadata jsonb not null default '{}'
status feedback_status not null default 'new'
triaged_by uuid null references users(id)
triaged_at timestamptz null
created_at timestamptz not null
updated_at timestamptz not null
```

Feedback types:

```txt
explanation_helpfulness
extraction_error
unsafe_language
doctor_review_experience
upload_problem
general_beta_feedback
```

Indexes:

- `feedback_events(user_id, created_at desc)`
- `feedback_events(status, created_at)`
