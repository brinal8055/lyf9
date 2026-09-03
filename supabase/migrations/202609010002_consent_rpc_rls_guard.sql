-- Keep consent checks inside the caller's RLS boundary. Service-role callers
-- continue to bypass RLS for backend upload authorization.

create or replace function public.has_required_report_upload_consent(target_user_id uuid)
returns boolean
language sql
security invoker
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

revoke all on function public.has_required_report_upload_consent(uuid) from public;
revoke all on function public.has_required_report_upload_consent(uuid) from anon;
grant execute on function public.has_required_report_upload_consent(uuid) to authenticated;
grant execute on function public.has_required_report_upload_consent(uuid) to service_role;
