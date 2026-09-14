-- Restrict catalog tables to authenticated reads. All writes remain backend/service-role only.

alter table public.biomarker_catalog enable row level security;
alter table public.biomarker_aliases enable row level security;

drop policy if exists "Authenticated users read biomarker catalog" on public.biomarker_catalog;
create policy "Authenticated users read biomarker catalog"
  on public.biomarker_catalog
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users read biomarker aliases" on public.biomarker_aliases;
create policy "Authenticated users read biomarker aliases"
  on public.biomarker_aliases
  for select
  to authenticated
  using (true);
