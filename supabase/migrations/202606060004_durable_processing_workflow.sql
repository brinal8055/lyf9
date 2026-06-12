-- Lyf9 AI durable processing workflow reliability foundation.

alter table public.processing_jobs add column if not exists current_step text not null default 'malware_scan';
alter table public.processing_jobs add column if not exists priority integer not null default 0;
alter table public.processing_jobs add column if not exists locked_by text;
alter table public.processing_jobs add column if not exists locked_until timestamptz;
alter table public.processing_jobs add column if not exists next_run_at timestamptz;

alter table public.processing_job_steps add column if not exists locked_by text;
alter table public.processing_job_steps add column if not exists locked_until timestamptz;
alter table public.processing_job_steps add column if not exists max_attempts integer not null default 3;
alter table public.processing_job_steps add column if not exists input_snapshot jsonb;
alter table public.processing_job_steps add column if not exists output_snapshot jsonb;

update public.processing_jobs
set current_step = 'malware_scan'
where current_step is null or current_step = '';

update public.processing_job_steps
set
  step_name = coalesce(step_name, step_key),
  attempt_count = greatest(attempt_count, attempt_number),
  max_attempts = greatest(max_attempts, 3)
where step_name is null or attempt_count is null or max_attempts is null;

create index if not exists processing_jobs_claim_idx
  on public.processing_jobs (status, priority desc, next_run_at, locked_until, created_at);

create index if not exists processing_jobs_current_step_idx
  on public.processing_jobs (current_step);

create index if not exists processing_job_steps_step_name_idx
  on public.processing_job_steps (job_id, step_name);
