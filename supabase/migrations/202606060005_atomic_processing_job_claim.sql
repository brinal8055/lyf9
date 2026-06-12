-- Lyf9 AI atomic processing job claim RPCs.

create or replace function public.claim_next_processing_job(
  p_worker_id text,
  p_lease_seconds integer,
  p_now timestamptz
)
returns public.processing_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.processing_jobs%rowtype;
begin
  with candidate as (
    select id
    from public.processing_jobs
    where status in ('queued', 'retry_scheduled')
      and (next_run_at is null or next_run_at <= p_now)
      and (locked_until is null or locked_until < p_now)
    order by priority desc, created_at asc
    for update skip locked
    limit 1
  )
  update public.processing_jobs job
  set
    status = 'running',
    locked_by = p_worker_id,
    locked_until = p_now + make_interval(secs => greatest(coalesce(p_lease_seconds, 300), 1)),
    started_at = coalesce(job.started_at, p_now),
    updated_at = p_now,
    attempt_count = coalesce(job.attempt_count, 0) + 1,
    worker_id = p_worker_id
  from candidate
  where job.id = candidate.id
  returning job.* into v_job;

  if not found then
    return null;
  end if;

  return v_job;
end;
$$;

create or replace function public.release_expired_processing_locks(
  p_now timestamptz
)
returns setof public.processing_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with expired as (
    select id
    from public.processing_jobs
    where status = 'running'
      and locked_until is not null
      and locked_until < p_now
    for update skip locked
  )
  update public.processing_jobs job
  set
    status = case
      when coalesce(job.attempt_count, 0) >= coalesce(job.max_attempts, 3) then 'failed'
      else 'retry_scheduled'
    end,
    next_run_at = case
      when coalesce(job.attempt_count, 0) >= coalesce(job.max_attempts, 3) then null
      else p_now
    end,
    locked_by = null,
    locked_until = null,
    worker_id = null,
    error_code = case
      when coalesce(job.attempt_count, 0) >= coalesce(job.max_attempts, 3) then 'lock_expired_max_attempts'
      else 'lock_expired'
    end,
    error_message = case
      when coalesce(job.attempt_count, 0) >= coalesce(job.max_attempts, 3)
        then 'Processing job lock expired and max attempts were reached.'
      else 'Processing job lock expired and was scheduled for retry.'
    end,
    failed_at = case
      when coalesce(job.attempt_count, 0) >= coalesce(job.max_attempts, 3) then p_now
      else job.failed_at
    end,
    updated_at = p_now
  from expired
  where job.id = expired.id
  returning job.*;
end;
$$;

grant execute on function public.claim_next_processing_job(text, integer, timestamptz) to service_role;
grant execute on function public.release_expired_processing_locks(timestamptz) to service_role;
