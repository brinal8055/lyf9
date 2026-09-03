-- Restrict workflow RPCs to the backend service role and recover stale step locks.

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
  ),
  released as (
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
    returning job.*
  ),
  released_steps as (
    update public.processing_job_steps step
    set
      status = case
        when released.status = 'failed' then 'failed'
        else 'retry_scheduled'
      end,
      locked_by = null,
      locked_until = null,
      error_code = released.error_code,
      error_message = released.error_message,
      failed_at = case
        when released.status = 'failed' then p_now
        else step.failed_at
      end,
      updated_at = p_now
    from released
    where coalesce(step.job_id, step.processing_job_id) = released.id
      and step.status = 'running'
    returning step.id
  )
  select released.* from released;
end;
$$;

revoke execute on function public.claim_next_processing_job(text, integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.release_expired_processing_locks(timestamptz)
  from public, anon, authenticated;

grant execute on function public.claim_next_processing_job(text, integer, timestamptz)
  to service_role;
grant execute on function public.release_expired_processing_locks(timestamptz)
  to service_role;
