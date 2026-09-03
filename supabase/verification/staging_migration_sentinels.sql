with migration_checks(version, name, schema_present) as (
  select '202606060001', 'private_beta_core',
    to_regtype('public.user_role') is not null
    and to_regclass('public.user_profiles') is not null
    and to_regclass('public.user_consents') is not null
    and to_regclass('public.report_files') is not null
    and to_regclass('public.processing_jobs') is not null
    and to_regclass('public.audit_logs') is not null
  union all
  select '202606060002', 'auth_persistence_rls_hardening',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'phone')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_health_profiles' and column_name = 'goals')
    and to_regprocedure('public.user_has_active_role(public.user_role)') is not null
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'report_files' and policyname = 'Backend only writes report files')
  union all
  select '202606060003', 'private_storage_scan_status',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'report_files' and column_name = 'scan_completed_at')
  union all
  select '202606060004', 'durable_processing_workflow',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'processing_jobs' and column_name = 'current_step')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'processing_jobs' and column_name = 'locked_until')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'processing_job_steps' and column_name = 'max_attempts')
  union all
  select '202606060005', 'atomic_processing_job_claim',
    to_regprocedure('public.claim_next_processing_job(text,integer,timestamp with time zone)') is not null
    and to_regprocedure('public.release_expired_processing_locks(timestamp with time zone)') is not null
  union all
  select '202606060006', 'document_extraction_foundation',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'extracted_documents' and column_name = 'parser_provider')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lab_reports' and column_name = 'extraction_status')
  union all
  select '202606120001', 'schema_first_ai_layer',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'model_runs' and column_name = 'schema_version')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'health_insights' and column_name = 'explanation_json')
  union all
  select '202608160001', 'doctor_onboarding_and_assignment',
    to_regclass('public.doctor_profiles') is not null
    and to_regclass('public.doctor_credential_documents') is not null
    and to_regclass('public.doctor_invites') is not null
    and to_regclass('public.doctor_capacity') is not null
    and to_regprocedure('public.claim_doctor_for_review(text,text,uuid)') is not null
  union all
  select '202609010001', 'biomarker_catalog_rls',
    exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'biomarker_catalog' and c.relrowsecurity
    )
    and exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'biomarker_aliases' and c.relrowsecurity
    )
    and (
      select count(*) from pg_policies
      where schemaname = 'public'
        and policyname in ('Authenticated users read biomarker catalog', 'Authenticated users read biomarker aliases')
    ) = 2
  union all
  select '202609010002', 'consent_rpc_rls_guard',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'has_required_report_upload_consent' and not p.prosecdef
    )
    and has_function_privilege('authenticated', 'public.has_required_report_upload_consent(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.has_required_report_upload_consent(uuid)', 'EXECUTE')
  union all
  select '202609020001', 'workflow_rpc_hardening',
    has_function_privilege('service_role', 'public.claim_next_processing_job(text,integer,timestamp with time zone)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.release_expired_processing_locks(timestamp with time zone)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.claim_next_processing_job(text,integer,timestamp with time zone)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.release_expired_processing_locks(timestamp with time zone)', 'EXECUTE')
)
select version, name, schema_present
from migration_checks
order by version;
