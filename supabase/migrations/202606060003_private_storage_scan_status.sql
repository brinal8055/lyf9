-- Lyf9 AI private report storage and malware scan status hardening.

alter type public.report_file_status add value if not exists 'upload_failed';
alter type public.report_file_status add value if not exists 'rejected_file_size';
alter type public.report_file_status add value if not exists 'scan_skipped_dev_only';
alter type public.report_file_status add value if not exists 'scan_configuration_required';

alter type public.processing_job_state add value if not exists 'malware_scan';

alter table public.report_files add column if not exists deleted_at timestamptz;
alter table public.report_files add column if not exists scan_completed_at timestamptz;

create index if not exists report_files_storage_key_idx on public.report_files (storage_key);
create index if not exists report_files_deleted_at_idx on public.report_files (deleted_at);
create index if not exists report_files_scan_status_idx on public.report_files (scan_status);

create index if not exists audit_logs_resource_type_id_idx
  on public.audit_logs (resource_type, resource_id);
