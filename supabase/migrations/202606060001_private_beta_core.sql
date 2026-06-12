create extension if not exists pgcrypto;

create type public.user_role as enum ('user', 'admin', 'doctor', 'superadmin');
create type public.report_file_status as enum (
  'upload_pending',
  'uploaded',
  'scan_pending',
  'scan_passed',
  'scan_failed',
  'rejected_file_type',
  'unsupported',
  'ocr_required',
  'processing',
  'extraction_failed',
  'failed',
  'deleted'
);
create type public.processing_job_state as enum (
  'uploaded',
  'scan_pending',
  'scan_passed',
  'classified',
  'unsupported',
  'text_extraction_pending',
  'text_extracted',
  'ocr_required',
  'ocr_completed',
  'extraction_failed',
  'biomarker_extraction_pending',
  'biomarker_extracted',
  'normalized',
  'validation_failed',
  'low_confidence_review_required',
  'critical_review_required',
  'insight_generation_pending',
  'insight_generated',
  'doctor_review_required',
  'doctor_reviewed',
  'published',
  'failed',
  'archived',
  'deleted'
);

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select role from public.user_roles where user_id = auth.uid() and revoked_at is null order by created_at desc limit 1),
    'user'::public.user_role
  );
$$;

create or replace function public.is_admin_like()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() in ('admin'::public.user_role, 'superadmin'::public.user_role);
$$;

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null default 'user',
  granted_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_health_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  date_of_birth date,
  gender text,
  height_cm numeric,
  weight_kg numeric,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null,
  consent_version text not null,
  granted boolean not null,
  legal_text_hash text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.report_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  checksum_sha256 text,
  storage_provider text not null,
  storage_bucket text not null,
  storage_key text not null,
  status public.report_file_status not null default 'upload_pending',
  scan_status text,
  unsupported_reason text,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lab_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_file_id uuid not null references public.report_files(id) on delete cascade,
  report_type text,
  supported_panels text[] not null default '{}',
  unsupported_sections text[] not null default '{}',
  status text not null default 'draft',
  classification_confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_file_id uuid not null references public.report_files(id) on delete cascade,
  lab_report_id uuid references public.lab_reports(id) on delete cascade,
  current_state public.processing_job_state not null default 'uploaded',
  status text not null default 'queued',
  idempotency_key text not null unique,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  error_code text,
  error_message text,
  worker_id text,
  metadata jsonb not null default '{}',
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.processing_job_steps (
  id uuid primary key default gen_random_uuid(),
  processing_job_id uuid not null references public.processing_jobs(id) on delete cascade,
  step_key text not null,
  state public.processing_job_state not null,
  status text not null,
  attempt_number integer not null default 1,
  safe_input_summary jsonb not null default '{}',
  safe_output_summary jsonb not null default '{}',
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.extracted_documents (
  id uuid primary key default gen_random_uuid(),
  report_file_id uuid not null references public.report_files(id) on delete cascade,
  lab_report_id uuid references public.lab_reports(id) on delete cascade,
  extraction_version integer not null,
  parser_name text not null,
  parser_version text not null,
  page_count integer,
  extracted_text text,
  extracted_tables_json jsonb,
  page_metadata_json jsonb not null default '{}',
  confidence_score numeric,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.biomarker_catalog (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  canonical_name text not null,
  category text not null,
  default_unit text,
  allowed_units text[] not null default '{}',
  normal_range_rules jsonb not null default '{}',
  critical_rules jsonb not null default '{}',
  is_supported boolean not null default true,
  requires_doctor_review_when_abnormal boolean not null default false,
  catalog_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.biomarker_aliases (
  id uuid primary key default gen_random_uuid(),
  biomarker_catalog_id uuid not null references public.biomarker_catalog(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  lab_name text,
  locale text,
  confidence_weight numeric not null default 1,
  created_at timestamptz not null default now()
);

create table public.biomarker_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lab_report_id uuid not null references public.lab_reports(id) on delete cascade,
  extraction_version integer not null,
  raw_name text not null,
  canonical_name text,
  canonical_biomarker_key text,
  value_numeric numeric,
  value_text text,
  unit text,
  original_unit text,
  reference_range_text text,
  reference_low numeric,
  reference_high numeric,
  lab_flag text not null default 'unknown',
  system_flag text not null default 'unknown',
  confidence_score numeric not null,
  page_number integer,
  source_text text not null,
  source_bbox jsonb,
  is_supported boolean not null default false,
  is_critical boolean not null default false,
  review_routing text not null,
  is_manually_corrected boolean not null default false,
  corrected_values jsonb,
  correction_reason text,
  corrected_by uuid references auth.users(id),
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.health_risk_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lab_report_id uuid not null references public.lab_reports(id) on delete cascade,
  biomarker_result_id uuid references public.biomarker_results(id) on delete set null,
  flag_type text not null,
  severity text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.model_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  lab_report_id uuid references public.lab_reports(id) on delete cascade,
  processing_job_id uuid references public.processing_jobs(id) on delete set null,
  task_type text not null,
  provider text not null,
  model_name text not null,
  prompt_version text not null,
  input_hash text not null,
  output_hash text,
  output_json jsonb,
  token_count integer,
  cost_estimate numeric,
  latency_ms integer,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.health_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lab_report_id uuid not null references public.lab_reports(id) on delete cascade,
  model_run_id uuid references public.model_runs(id) on delete set null,
  status text not null,
  summary text not null,
  output_json jsonb not null,
  disclaimer text not null,
  source_biomarker_ids uuid[] not null default '{}',
  safety_flags text[] not null default '{}',
  doctor_review_id uuid,
  doctor_reviewed_at timestamptz,
  doctor_reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.doctor_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lab_report_id uuid not null references public.lab_reports(id) on delete cascade,
  report_file_id uuid not null references public.report_files(id) on delete cascade,
  health_insight_id uuid not null references public.health_insights(id) on delete cascade,
  assigned_doctor_id uuid not null references auth.users(id),
  assigned_by uuid references auth.users(id),
  status text not null default 'assigned',
  priority text not null default 'standard',
  ai_draft_snapshot jsonb not null,
  doctor_edited_output jsonb,
  doctor_notes text,
  rejection_reason text,
  request_more_info_message text,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.doctor_review_comments (
  id uuid primary key default gen_random_uuid(),
  doctor_review_id uuid not null references public.doctor_reviews(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  actor_role public.user_role not null,
  comment text not null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role public.user_role,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  ip_address inet,
  user_agent text,
  safe_metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_file_id uuid references public.report_files(id) on delete set null,
  lab_report_id uuid references public.lab_reports(id) on delete set null,
  canonical_biomarker_key text,
  title text not null,
  reminder_date date not null,
  note text,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.report_files(id) on delete set null,
  product_type text not null,
  amount integer not null,
  currency text not null default 'INR',
  status text not null,
  provider text not null,
  provider_order_id text,
  provider_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_file_id uuid references public.report_files(id) on delete set null,
  lab_report_id uuid references public.lab_reports(id) on delete set null,
  doctor_review_id uuid references public.doctor_reviews(id) on delete set null,
  feedback_surface text not null,
  helpful text,
  confusing_text text,
  would_trust_doctor_review text,
  free_text text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  report_file_id uuid references public.report_files(id) on delete set null,
  lab_report_id uuid references public.lab_reports(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_health_profiles enable row level security;
alter table public.user_consents enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.report_files enable row level security;
alter table public.lab_reports enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.processing_job_steps enable row level security;
alter table public.extracted_documents enable row level security;
alter table public.biomarker_results enable row level security;
alter table public.health_risk_flags enable row level security;
alter table public.model_runs enable row level security;
alter table public.health_insights enable row level security;
alter table public.doctor_reviews enable row level security;
alter table public.doctor_review_comments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.reminders enable row level security;
alter table public.payments enable row level security;
alter table public.feedback_events enable row level security;
alter table public.analytics_events enable row level security;

create policy "Users manage own profile" on public.user_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users read own roles" on public.user_roles for select using (user_id = auth.uid() or public.is_admin_like());
create policy "Superadmin manages roles" on public.user_roles for all using (public.current_user_role() = 'superadmin') with check (public.current_user_role() = 'superadmin');
create policy "Users manage own health profile" on public.user_health_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own consent" on public.user_consents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own questionnaire" on public.questionnaire_responses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own report files" on public.report_files for all using (user_id = auth.uid() or public.is_admin_like()) with check (user_id = auth.uid() or public.is_admin_like());
create policy "Users read own lab reports" on public.lab_reports for select using (user_id = auth.uid() or public.is_admin_like());
create policy "Users read own processing jobs" on public.processing_jobs for select using (user_id = auth.uid() or public.is_admin_like());
create policy "Admins read job steps" on public.processing_job_steps for select using (public.is_admin_like());
create policy "Users read own extracted documents metadata" on public.extracted_documents for select using (
  exists (select 1 from public.report_files rf where rf.id = report_file_id and (rf.user_id = auth.uid() or public.is_admin_like()))
);
create policy "Users read own biomarkers" on public.biomarker_results for select using (user_id = auth.uid() or public.is_admin_like());
create policy "Users read own risk flags" on public.health_risk_flags for select using (user_id = auth.uid() or public.is_admin_like());
create policy "Admins read model runs" on public.model_runs for select using (public.is_admin_like());
create policy "Users read own insights" on public.health_insights for select using (user_id = auth.uid() or public.is_admin_like());
create policy "Doctors read assigned reviews" on public.doctor_reviews for select using (
  assigned_doctor_id = auth.uid() or user_id = auth.uid() or public.is_admin_like()
);
create policy "Doctors comment assigned reviews" on public.doctor_review_comments for insert with check (
  exists (select 1 from public.doctor_reviews dr where dr.id = doctor_review_id and (dr.assigned_doctor_id = auth.uid() or public.is_admin_like()))
);
create policy "Admins read audit logs" on public.audit_logs for select using (public.is_admin_like());
create policy "Users manage own reminders" on public.reminders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users read own payments" on public.payments for select using (user_id = auth.uid() or public.is_admin_like());
create policy "Users manage own feedback" on public.feedback_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users insert own analytics" on public.analytics_events for insert with check (user_id is null or user_id = auth.uid());
create policy "Admins read analytics" on public.analytics_events for select using (public.is_admin_like());

create index report_files_user_id_created_at_idx on public.report_files (user_id, created_at desc);
create index processing_jobs_state_idx on public.processing_jobs (current_state, status, created_at);
create unique index biomarker_aliases_normalized_scope_idx on public.biomarker_aliases (normalized_alias, coalesce(lab_name, ''), coalesce(locale, ''));
create index biomarker_results_lab_report_id_idx on public.biomarker_results (lab_report_id);
create index doctor_reviews_assigned_doctor_id_idx on public.doctor_reviews (assigned_doctor_id, status);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
