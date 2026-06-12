-- Lyf9 AI private beta hardening: auth-owned identity, durable profile/consent/report metadata,
-- and explicit RLS boundaries for Supabase Auth + Postgres.

create extension if not exists pgcrypto;

alter table public.user_profiles add column if not exists id uuid default gen_random_uuid();
alter table public.user_profiles add column if not exists phone text;
alter table public.user_profiles add column if not exists city text;
alter table public.user_profiles add constraint user_profiles_id_unique unique (id);
create unique index if not exists user_profiles_user_id_unique_idx on public.user_profiles (user_id);

alter table public.user_roles add column if not exists granted_at timestamptz not null default now();
alter table public.user_roles add column if not exists updated_at timestamptz not null default now();
create unique index if not exists user_roles_one_active_role_idx
  on public.user_roles (user_id, role)
  where revoked_at is null;

alter table public.user_health_profiles add column if not exists id uuid default gen_random_uuid();
alter table public.user_health_profiles add column if not exists age integer;
alter table public.user_health_profiles add column if not exists known_conditions jsonb not null default '[]';
alter table public.user_health_profiles add column if not exists allergies jsonb not null default '[]';
alter table public.user_health_profiles add column if not exists surgeries jsonb not null default '[]';
alter table public.user_health_profiles add column if not exists current_medicines jsonb not null default '[]';
alter table public.user_health_profiles add column if not exists family_history jsonb not null default '[]';
alter table public.user_health_profiles add column if not exists lifestyle jsonb not null default '{}';
alter table public.user_health_profiles add column if not exists goals jsonb not null default '[]';
alter table public.user_health_profiles add constraint user_health_profiles_id_unique unique (id);
create unique index if not exists user_health_profiles_user_id_unique_idx on public.user_health_profiles (user_id);

alter table public.questionnaire_responses add column if not exists questionnaire_version text not null default 'beta_health_intake_v1';
alter table public.questionnaire_responses add column if not exists completed_at timestamptz;

alter table public.user_consents add column if not exists version text;
alter table public.user_consents add column if not exists purpose text not null default '';
alter table public.user_consents add column if not exists granted_at timestamptz;
alter table public.user_consents add column if not exists revoked_at timestamptz;
alter table public.user_consents add column if not exists updated_at timestamptz not null default now();
update public.user_consents set version = consent_version where version is null;
alter table public.user_consents alter column version set not null;

alter table public.report_files add column if not exists size_bytes bigint;
alter table public.report_files add column if not exists checksum text;
alter table public.report_files add column if not exists upload_status text;
alter table public.report_files add column if not exists deleted_at timestamptz;
update public.report_files
set
  size_bytes = coalesce(size_bytes, file_size_bytes),
  checksum = coalesce(checksum, checksum_sha256),
  upload_status = coalesce(upload_status, status::text);

alter table public.lab_reports add column if not exists lab_name text;
alter table public.lab_reports add column if not exists report_date date;
alter table public.lab_reports add column if not exists sample_date date;
alter table public.lab_reports add column if not exists unsupported_reason text;

alter table public.processing_jobs add column if not exists job_type text not null default 'report_processing';
alter table public.processing_jobs add column if not exists processing_version text not null default 'private_beta_v1';

alter table public.processing_job_steps add column if not exists job_id uuid references public.processing_jobs(id) on delete cascade;
alter table public.processing_job_steps add column if not exists step_name text;
alter table public.processing_job_steps add column if not exists attempt_count integer not null default 0;
update public.processing_job_steps
set
  job_id = coalesce(job_id, processing_job_id),
  step_name = coalesce(step_name, step_key),
  attempt_count = greatest(attempt_count, attempt_number);

alter table public.audit_logs add column if not exists resource_type text;
alter table public.audit_logs add column if not exists resource_id uuid;
alter table public.audit_logs add column if not exists metadata jsonb not null default '{}';
update public.audit_logs
set
  resource_type = coalesce(resource_type, entity_type),
  resource_id = coalesce(resource_id, entity_id),
  metadata = case when metadata = '{}'::jsonb then safe_metadata else metadata end;

alter table public.feedback_events add column if not exists report_id uuid references public.lab_reports(id) on delete set null;
alter table public.feedback_events add column if not exists event_type text;
alter table public.feedback_events add column if not exists rating integer;
alter table public.feedback_events add column if not exists message text;
alter table public.feedback_events add column if not exists metadata jsonb not null default '{}';

alter table public.analytics_events add column if not exists properties jsonb not null default '{}';
update public.analytics_events
set properties = case when properties = '{}'::jsonb then metadata else properties end;

create or replace function public.user_has_active_role(required_role public.user_role)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = required_role
      and revoked_at is null
  );
$$;

create or replace function public.user_has_any_active_role(required_roles public.user_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = any(required_roles)
      and revoked_at is null
  );
$$;

create or replace function public.has_required_report_upload_consent(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((
      select granted
      from public.user_consents
      where user_id = target_user_id
        and consent_type = 'lab_report_processing'
      order by created_at desc
      limit 1
    ), false)
    and
    coalesce((
      select granted
      from public.user_consents
      where user_id = target_user_id
        and consent_type = 'ai_analysis'
      order by created_at desc
      limit 1
    ), false);
$$;

drop policy if exists "Users manage own report files" on public.report_files;
drop policy if exists "Users read own report files" on public.report_files;
drop policy if exists "Backend only writes report files" on public.report_files;
drop policy if exists "Backend only updates report files" on public.report_files;
create policy "Users read own report files" on public.report_files
  for select using (user_id = auth.uid());
create policy "Backend only writes report files" on public.report_files
  for insert with check (false);
create policy "Backend only updates report files" on public.report_files
  for update using (false) with check (false);

drop policy if exists "Users read own processing jobs" on public.processing_jobs;
drop policy if exists "Backend only writes processing jobs" on public.processing_jobs;
drop policy if exists "Backend only updates processing jobs" on public.processing_jobs;
create policy "Users read own processing jobs" on public.processing_jobs
  for select using (user_id = auth.uid());
create policy "Backend only writes processing jobs" on public.processing_jobs
  for insert with check (false);
create policy "Backend only updates processing jobs" on public.processing_jobs
  for update using (false) with check (false);

drop policy if exists "Admins read job steps" on public.processing_job_steps;
drop policy if exists "Users read own processing job steps" on public.processing_job_steps;
drop policy if exists "Admins read processing job steps" on public.processing_job_steps;
create policy "Users read own processing job steps" on public.processing_job_steps
  for select using (
    exists (
      select 1
      from public.processing_jobs pj
      where pj.id = processing_job_steps.processing_job_id
        and pj.user_id = auth.uid()
    )
  );
create policy "Admins read processing job steps" on public.processing_job_steps
  for select using (public.is_admin_like());

drop policy if exists "Doctors read assigned lab reports" on public.lab_reports;
create policy "Doctors read assigned lab reports" on public.lab_reports
  for select using (
    exists (
      select 1
      from public.doctor_reviews dr
      where dr.lab_report_id = lab_reports.id
        and dr.assigned_doctor_id = auth.uid()
    )
  );

drop policy if exists "Doctors read assigned report files" on public.report_files;
create policy "Doctors read assigned report files" on public.report_files
  for select using (
    exists (
      select 1
      from public.doctor_reviews dr
      where dr.report_file_id = report_files.id
        and dr.assigned_doctor_id = auth.uid()
    )
  );

drop policy if exists "Service inserts audit logs only" on public.audit_logs;
create policy "Service inserts audit logs only" on public.audit_logs
  for insert with check (false);

create index if not exists user_profiles_user_id_idx on public.user_profiles (user_id);
create index if not exists user_roles_user_id_role_idx on public.user_roles (user_id, role);
create index if not exists user_health_profiles_user_id_idx on public.user_health_profiles (user_id);
create index if not exists questionnaire_responses_user_id_idx on public.questionnaire_responses (user_id);
create index if not exists user_consents_user_id_type_idx on public.user_consents (user_id, consent_type);
create index if not exists report_files_user_id_idx on public.report_files (user_id);
create index if not exists lab_reports_user_id_idx on public.lab_reports (user_id);
create index if not exists lab_reports_report_file_id_idx on public.lab_reports (report_file_id);
create index if not exists processing_jobs_user_id_idx on public.processing_jobs (user_id);
create index if not exists processing_jobs_report_file_id_idx on public.processing_jobs (report_file_id);
create index if not exists processing_jobs_status_idx on public.processing_jobs (status);
create index if not exists processing_job_steps_job_id_idx on public.processing_job_steps (processing_job_id);
create index if not exists audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);
create index if not exists audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);
create index if not exists feedback_events_user_id_idx on public.feedback_events (user_id);
create index if not exists analytics_events_user_id_idx on public.analytics_events (user_id);
create index if not exists analytics_events_event_name_idx on public.analytics_events (event_name);
