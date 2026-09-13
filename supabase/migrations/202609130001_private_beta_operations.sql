-- Durable private-beta invitations for Lyf9 AI.
-- Raw invite codes are never stored; only their SHA-256 digest is persisted.

create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invite_code_hash text not null unique,
  role text not null default 'user' check (role in ('user', 'admin', 'doctor', 'superadmin')),
  status text not null default 'created' check (status in ('created', 'redeemed', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists beta_invites_active_email_idx
  on public.beta_invites (lower(email))
  where status = 'created';

create index if not exists beta_invites_status_expiry_idx
  on public.beta_invites (status, expires_at);

alter table public.beta_invites enable row level security;

-- Invitations are created and redeemed through server routes using service_role.
-- No anon/authenticated policy is intentional: raw client access stays denied.
revoke all on table public.beta_invites from anon, authenticated;
grant all on table public.beta_invites to service_role;
