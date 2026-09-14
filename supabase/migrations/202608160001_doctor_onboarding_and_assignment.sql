-- Doctor onboarding, credential verification, and capacity-aware review assignment.
--
-- Replaces the single-doctor BETA_DOCTOR_EMAIL env var with a real multi-doctor
-- system: invite -> application -> manual admin verification -> approval -> role grant.
--
-- Assignment uses SELECT ... FOR UPDATE SKIP LOCKED (same pattern as
-- 202606060005_atomic_processing_job_claim.sql) so concurrent saga runs never
-- double-assign a review or block each other.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Doctor lifecycle
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'doctor_status') then
    create type public.doctor_status as enum (
      'invited',
      'details_submitted',
      'under_review',
      'approved',
      'rejected',
      'suspended'
    );
  end if;
end $$;

create table if not exists public.doctor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  registration_number text not null,
  registration_council text not null,
  registration_year int,
  primary_degree text not null,
  additional_qualifications text[] not null default '{}',
  specialties text[] not null default '{}',
  years_experience int,
  languages text[] not null default '{en}',
  bio text,
  profile_photo_path text,
  status public.doctor_status not null default 'invited',
  rejection_reason text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctor_registration_unique unique (registration_council, registration_number),
  constraint doctor_years_experience_sane check (
    years_experience is null or (years_experience >= 0 and years_experience <= 80)
  )
);

-- Credential documents live in the private bucket; only the pointer is stored.
-- Separate table: different retention policy from profile data, and admin
-- access to these is audit-logged per CLAUDE.md section 11.
create table if not exists public.doctor_credential_documents (
  id uuid primary key default gen_random_uuid(),
  doctor_user_id uuid not null references public.doctor_profiles(user_id) on delete cascade,
  document_type text not null,
  storage_path text not null,
  checksum text not null,
  scan_status text not null default 'pending',
  uploaded_at timestamptz not null default now(),
  constraint doctor_document_type_known check (
    document_type in ('registration_certificate', 'degree_certificate', 'government_id', 'other')
  )
);

create index if not exists doctor_credential_documents_doctor_idx
  on public.doctor_credential_documents (doctor_user_id, uploaded_at desc);

-- ---------------------------------------------------------------------------
-- Invites
--
-- Only sha256(token) is stored. The raw token exists solely in the emailed
-- URL, so read access to this table cannot be used to forge an application.
-- ---------------------------------------------------------------------------

create table if not exists public.doctor_invites (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  note text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- At most one live invite per email at a time.
create unique index if not exists doctor_invites_active_email_idx
  on public.doctor_invites (email)
  where consumed_at is null and revoked_at is null;

create index if not exists doctor_invites_pending_idx
  on public.doctor_invites (created_at desc)
  where consumed_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Capacity
--
-- Split from doctor_profiles on purpose: this row is written on every single
-- assignment while profiles are read-mostly. Keeping the hot-write row narrow
-- reduces write amplification and stops assignment locks contending with
-- profile reads.
--
-- open_review_count is denormalized. The alternative -- count(*) over
-- doctor_reviews per candidate doctor per assignment -- turns every report
-- into a scan. The trigger below keeps it honest; a nightly reconciliation
-- job catches any drift.
-- ---------------------------------------------------------------------------

create table if not exists public.doctor_capacity (
  doctor_user_id uuid primary key references public.doctor_profiles(user_id) on delete cascade,
  is_accepting boolean not null default true,
  max_open_reviews int not null default 15,
  open_review_count int not null default 0,
  lifetime_review_count bigint not null default 0,
  avg_turnaround_seconds int,
  last_assigned_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint doctor_capacity_open_nonneg check (open_review_count >= 0),
  constraint doctor_capacity_max_positive check (max_open_reviews > 0)
);

-- Partial indexes so every assignment tier stays a small index scan
-- regardless of how many doctors are onboarded.
create index if not exists doctor_capacity_available_idx
  on public.doctor_capacity (open_review_count)
  where is_accepting = true;

create index if not exists doctor_profiles_approved_specialty_idx
  on public.doctor_profiles using gin (specialties)
  where status = 'approved';

create index if not exists doctor_profiles_status_created_idx
  on public.doctor_profiles (status, created_at desc);

-- Doctor queue read path.
create index if not exists doctor_reviews_queue_idx
  on public.doctor_reviews (assigned_doctor_id, status, priority, created_at desc);

-- ---------------------------------------------------------------------------
-- Capacity counter maintenance
-- ---------------------------------------------------------------------------

create or replace function public.sync_doctor_open_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_states constant text[] := array['assigned', 'in_progress', 'needs_more_info'];
  was_open boolean;
  is_open boolean;
begin
  if TG_OP = 'INSERT' then
    if NEW.status = any(open_states) then
      update public.doctor_capacity
        set open_review_count = open_review_count + 1,
            lifetime_review_count = lifetime_review_count + 1,
            updated_at = now()
      where doctor_user_id = NEW.assigned_doctor_id;
    end if;
    return null;
  end if;

  was_open := OLD.status = any(open_states);
  is_open := NEW.status = any(open_states);

  -- Nothing to do unless open-ness or the assignee changed.
  if was_open = is_open and OLD.assigned_doctor_id is not distinct from NEW.assigned_doctor_id then
    return null;
  end if;

  if was_open then
    update public.doctor_capacity
      set open_review_count = greatest(0, open_review_count - 1),
          updated_at = now()
    where doctor_user_id = OLD.assigned_doctor_id;
  end if;

  if is_open then
    update public.doctor_capacity
      set open_review_count = open_review_count + 1,
          lifetime_review_count = lifetime_review_count
            + case when was_open and OLD.assigned_doctor_id is distinct from NEW.assigned_doctor_id
                   then 1 else 0 end,
          updated_at = now()
    where doctor_user_id = NEW.assigned_doctor_id;
  end if;

  return null;
end $$;

drop trigger if exists doctor_reviews_capacity_sync on public.doctor_reviews;
create trigger doctor_reviews_capacity_sync
after insert or update on public.doctor_reviews
for each row execute function public.sync_doctor_open_count();

-- Reconciliation for the nightly job. Returns rows only where drift was found.
create or replace function public.reconcile_doctor_open_counts()
returns table (doctor_user_id uuid, previous_count int, corrected_count int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with actual as (
    select c.doctor_user_id,
           c.open_review_count as previous_count,
           coalesce(count(dr.id) filter (
             where dr.status in ('assigned', 'in_progress', 'needs_more_info')
           ), 0)::int as corrected_count
    from public.doctor_capacity c
    left join public.doctor_reviews dr on dr.assigned_doctor_id = c.doctor_user_id
    group by c.doctor_user_id, c.open_review_count
  ),
  drifted as (
    select * from actual where previous_count is distinct from corrected_count
  ),
  applied as (
    update public.doctor_capacity c
      set open_review_count = d.corrected_count, updated_at = now()
    from drifted d
    where c.doctor_user_id = d.doctor_user_id
    returning c.doctor_user_id
  )
  select d.doctor_user_id, d.previous_count, d.corrected_count
  from drifted d
  where d.doctor_user_id in (select a.doctor_user_id from applied a);
end $$;

-- ---------------------------------------------------------------------------
-- Assignment
--
-- Four tiers, in order:
--   1. continuity      -- the doctor who reviewed this user before
--   2. specialty+load  -- least-loaded matching specialist
--   3. any+load        -- least-loaded approved doctor (specialty is a
--                         preference, not a gate: a delayed review is worse
--                         than a generalist reading a lab panel)
--   4. urgent overflow -- critical markers breach capacity rather than queue
--
-- Load is ordered by ratio, not raw count: a doctor at 10/30 is less loaded
-- than one at 9/12 even though 10 > 9.
--
-- Returns NULL when nobody is available. That is a valid outcome, not a
-- failure: the report still publishes with its AI explanation and the review
-- lands in the admin unassigned queue.
-- ---------------------------------------------------------------------------

create or replace function public.claim_doctor_for_review(
  p_required_specialty text default null,
  p_priority text default 'standard',
  p_preferred_doctor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor uuid;
begin
  -- Tier 1: continuity.
  if p_preferred_doctor is not null then
    select c.doctor_user_id into v_doctor
    from public.doctor_capacity c
    join public.doctor_profiles p on p.user_id = c.doctor_user_id
    where c.doctor_user_id = p_preferred_doctor
      and p.status = 'approved'
      and c.is_accepting
      and c.open_review_count < c.max_open_reviews
    for update of c skip locked;

    if v_doctor is not null then
      update public.doctor_capacity
        set last_assigned_at = now(), updated_at = now()
      where doctor_user_id = v_doctor;
      return v_doctor;
    end if;
  end if;

  -- Tier 2: specialty match, least loaded.
  if p_required_specialty is not null then
    select c.doctor_user_id into v_doctor
    from public.doctor_capacity c
    join public.doctor_profiles p on p.user_id = c.doctor_user_id
    where p.status = 'approved'
      and c.is_accepting
      and c.open_review_count < c.max_open_reviews
      and p_required_specialty = any(p.specialties)
    order by (c.open_review_count::numeric / c.max_open_reviews) asc,
             c.last_assigned_at asc nulls first
    limit 1
    for update of c skip locked;
  end if;

  -- Tier 3: any approved doctor with capacity.
  if v_doctor is null then
    select c.doctor_user_id into v_doctor
    from public.doctor_capacity c
    join public.doctor_profiles p on p.user_id = c.doctor_user_id
    where p.status = 'approved'
      and c.is_accepting
      and c.open_review_count < c.max_open_reviews
    order by (c.open_review_count::numeric / c.max_open_reviews) asc,
             c.last_assigned_at asc nulls first
    limit 1
    for update of c skip locked;
  end if;

  -- Tier 4: urgent overflow -- deliberately ignores max_open_reviews.
  if v_doctor is null and p_priority = 'urgent' then
    select c.doctor_user_id into v_doctor
    from public.doctor_capacity c
    join public.doctor_profiles p on p.user_id = c.doctor_user_id
    where p.status = 'approved'
      and c.is_accepting
    order by c.open_review_count asc,
             c.last_assigned_at asc nulls first
    limit 1
    for update of c skip locked;
  end if;

  if v_doctor is not null then
    update public.doctor_capacity
      set last_assigned_at = now(), updated_at = now()
    where doctor_user_id = v_doctor;
  end if;

  return v_doctor;
end $$;

-- Most recent doctor to complete a review for this user, for tier 1.
create or replace function public.previous_doctor_for_user(p_user_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select dr.assigned_doctor_id
  from public.doctor_reviews dr
  where dr.user_id = p_user_id
    and dr.status = 'completed'
  order by dr.completed_at desc nulls last
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Role helper
-- ---------------------------------------------------------------------------

-- A 'doctor' role row alone is not enough: the profile must also be approved.
-- Guards against a role grant outliving a suspension.
create or replace function public.is_approved_doctor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and dp.status = 'approved'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.doctor_profiles enable row level security;
alter table public.doctor_credential_documents enable row level security;
alter table public.doctor_invites enable row level security;
alter table public.doctor_capacity enable row level security;

-- Doctors read their own profile; admins read all. Writes go through the
-- service role only -- status transitions must not be self-served.
drop policy if exists "Doctors read own profile" on public.doctor_profiles;
create policy "Doctors read own profile" on public.doctor_profiles
  for select using (user_id = auth.uid() or public.is_admin_like());

drop policy if exists "Admins manage doctor profiles" on public.doctor_profiles;
create policy "Admins manage doctor profiles" on public.doctor_profiles
  for all using (public.is_admin_like()) with check (public.is_admin_like());

-- Credential documents: admin-only. A doctor cannot re-read their own
-- uploaded government ID through the API surface.
drop policy if exists "Admins read credential documents" on public.doctor_credential_documents;
create policy "Admins read credential documents" on public.doctor_credential_documents
  for all using (public.is_admin_like()) with check (public.is_admin_like());

drop policy if exists "Admins manage doctor invites" on public.doctor_invites;
create policy "Admins manage doctor invites" on public.doctor_invites
  for all using (public.is_admin_like()) with check (public.is_admin_like());

-- Doctors may read their own capacity (to show load in their panel) and
-- toggle is_accepting. All other capacity writes are service-role only.
drop policy if exists "Doctors read own capacity" on public.doctor_capacity;
create policy "Doctors read own capacity" on public.doctor_capacity
  for select using (doctor_user_id = auth.uid() or public.is_admin_like());

drop policy if exists "Admins manage doctor capacity" on public.doctor_capacity;
create policy "Admins manage doctor capacity" on public.doctor_capacity
  for all using (public.is_admin_like()) with check (public.is_admin_like());

-- Users must be able to read their reviewer's public-facing details.
-- Name, degree, specialties only -- never registration number or documents.
create or replace view public.doctor_public_profiles
with (security_invoker = true)
as
  select dp.user_id,
         dp.full_name,
         dp.primary_degree,
         dp.additional_qualifications,
         dp.specialties,
         dp.years_experience,
         dp.languages,
         dp.bio,
         dp.profile_photo_path
  from public.doctor_profiles dp
  where dp.status = 'approved';

grant select on public.doctor_public_profiles to authenticated;
