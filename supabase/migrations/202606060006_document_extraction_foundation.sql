-- Lyf9 AI document extraction foundation hardening.

alter table public.extracted_documents add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.extracted_documents add column if not exists parser_provider text;
alter table public.extracted_documents add column if not exists ocr_provider text;
alter table public.extracted_documents add column if not exists error_code text;
alter table public.extracted_documents add column if not exists updated_at timestamptz not null default now();

update public.extracted_documents ed
set user_id = rf.user_id
from public.report_files rf
where ed.report_file_id = rf.id
  and ed.user_id is null;

update public.extracted_documents
set parser_provider = coalesce(parser_provider, parser_name)
where parser_provider is null;

alter table public.lab_reports add column if not exists extraction_status text;
alter table public.lab_reports add column if not exists unsupported_reason text;

create index if not exists extracted_documents_user_id_idx on public.extracted_documents (user_id);
create index if not exists extracted_documents_report_file_id_idx on public.extracted_documents (report_file_id);
create index if not exists extracted_documents_lab_report_id_idx on public.extracted_documents (lab_report_id);
create index if not exists extracted_documents_status_idx on public.extracted_documents (status);
create index if not exists extracted_documents_extraction_version_idx on public.extracted_documents (extraction_version);

drop policy if exists "Users read own extracted documents metadata" on public.extracted_documents;
create policy "Users read own extracted documents metadata" on public.extracted_documents
  for select using (
    exists (
      select 1
      from public.report_files rf
      where rf.id = extracted_documents.report_file_id
        and (rf.user_id = auth.uid() or public.is_admin_like())
    )
  );
