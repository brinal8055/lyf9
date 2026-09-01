# Supabase Staging Verification

## Status

Current status: **core Auth/RLS live verification passed; remaining provider gates blocked**.

The Lyf9 AI Supabase Auth/Postgres/RLS foundation is applied to the dedicated staging project. The live JWT-backed RLS harness and deployed Auth/API consent smoke test pass with synthetic fixtures and cleanup. Signup email delivery still needs custom SMTP or an approved Supabase Auth rate-limit configuration.

## 1. Project Setup

1. Create a dedicated Supabase project for Lyf9 AI staging.
2. Use a staging-only project name and staging-only secrets.
3. Disable public signups unless the private beta invite flow is ready for that environment.
4. Configure email templates with Lyf9 AI / lyf9.ai naming only.
5. Store secrets only in deployment secret managers. Do not commit them.

Recommended region: choose the closest available Supabase region to the first beta users in India. If India is not available for the selected Supabase plan, prefer Singapore/ap-southeast, then another nearby APAC region, and document the decision.

## 2. Required Env Vars

Frontend public env:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_BASE_URL=
```

Web server/BFF env when Next.js route handlers perform privileged operations:

```txt
APP_ENV=staging
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
BETA_INVITE_REQUIRED=true
```

FastAPI backend env:

```txt
APP_ENV=staging
APP_BASE_URL=
ADMIN_ALLOWLIST=
BETA_INVITE_REQUIRED=true
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

Worker env:

```txt
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
PROCESSING_VERSION=
```

Local-only scaffold auth:

```txt
APP_ENV=local
ENABLE_LOCAL_AUTH_FALLBACK=true
```

`ENABLE_LOCAL_AUTH_FALLBACK=true` must not be used in staging or production. If Supabase env is missing in staging/production, web auth must return a setup/configuration error and API auth must return 503.

## 3. Apply Migrations

Apply migrations in repository order. Staging is currently applied through:

```txt
supabase/migrations/202609010002_consent_rpc_rls_guard.sql
```

Recommended commands:

```bash
supabase link --project-ref <staging-project-ref>
supabase db push
```

If using SQL editor, paste and run each migration in order. Confirm both complete without errors.

Rollback if migration fails:

1. Stop app deploys pointing at the failed staging DB.
2. Capture the exact SQL error and migration line.
3. Restore from the pre-migration Supabase backup if any partial schema changes are unsafe.
4. Otherwise reverse only the failed change in a new migration; do not hand-edit production/staging state without recording it.
5. Re-run migrations on a fresh staging branch/project before retrying the main staging project.

## 4. Seed Test Users And Roles

Create Supabase Auth users:

```txt
user_a
user_b
doctor_a
doctor_b
admin_a
superadmin_a
```

Insert `user_profiles` rows for each user. Insert active `user_roles` rows:

```txt
user_a -> user
user_b -> user
doctor_a -> doctor
doctor_b -> doctor
admin_a -> admin
superadmin_a -> superadmin
```

Roles must be resolved from `public.user_roles`, not from client-provided metadata or UI state.

## 5. Seed Reports And Jobs

Create:

- `user_a` profile and `user_b` profile.
- `user_a` report file, lab report, and processing job.
- `user_b` report file, lab report, and processing job.
- `doctor_a` assigned to `user_a` report through `doctor_reviews`.
- `doctor_b` not assigned to `user_a` report.

Use staging-only dummy filenames and safe metadata. Do not seed real PHI.

## 6. Run Automated RLS Tests

Local command, skipped unless live env is explicitly enabled:

```bash
npm run test:rls
```

Live staging command:

```bash
RUN_LIVE_SUPABASE_RLS=true \
APP_ENV=staging \
STAGING_SUPABASE_PROJECT_REF=<staging-project-ref> \
NEXT_PUBLIC_SUPABASE_URL=<staging-url> \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key> \
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key> \
npm run test:rls
```

Deployed Auth/API command:

```bash
RUN_LIVE_STAGING_AUTH_API=true \
APP_ENV=staging \
STAGING_SUPABASE_PROJECT_REF=<staging-project-ref> \
STAGING_APP_ORIGIN=<staging-app-origin> \
APP_BASE_URL=<staging-app-origin> \
NEXT_PUBLIC_SUPABASE_URL=<staging-url> \
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key> \
LYF9_BETA_INVITE_CODE=<staging-invite-code> \
npm run test:auth-live
```

The live harness seeds temporary users, report metadata, processing jobs, consent rows, doctor assignments, and audit rows, then signs in with real Supabase Auth JWTs to verify RLS.

Required scenarios covered by the live harness:

- User can read own profile/report/job.
- User cannot read another user's profile/report/job.
- User can grant own consent and cannot grant consent for another user.
- Upload consent RPC is false with only `lab_report_processing` and true only after `ai_analysis` is also granted.
- Assigned doctor can read assigned lab report.
- Unassigned doctor cannot read another doctor's assigned report.
- Doctor/admin cannot grant roles through user JWT/RLS.
- Superadmin can grant roles.
- User cannot insert audit logs.
- Service role can insert safe audit metadata.

Remaining app-level scenarios to verify in staging after deployment:

- `upload-init` returns 403 without both required persisted consents.
- `upload-init` succeeds only after both required consents exist.
- `upload-init` blocked due to missing consent writes `report_upload_blocked` with only safe metadata.
- Admin operational queue is available only through authenticated backend/service-role routes.
- Backend privileged actions write audit logs.

## 7. Manual SQL Editor Checks

Use the Supabase SQL editor with `auth.uid()` simulation only for spot checks; automated JWT tests are the source of truth.

Check RLS is enabled:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'user_profiles',
    'user_roles',
    'user_consents',
    'report_files',
    'lab_reports',
    'processing_jobs',
    'doctor_reviews',
    'audit_logs'
  );
```

Check policy inventory:

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Check required consent RPC:

```sql
select public.has_required_report_upload_consent('<user-a-uuid>');
```

Check active roles:

```sql
select user_id, role, granted_at, revoked_at
from public.user_roles
where revoked_at is null
order by granted_at desc;
```

## 8. Migration Review Notes

`202606060002_auth_persistence_rls_hardening.sql` now uses `if not exists` for practical column/index additions and drops/recreates hardening policies before creating them, reducing rerun collisions.

Important review notes:

- RLS is enabled for core PHI-bearing tables in the base migration.
- User-owned reads are constrained by `user_id = auth.uid()`.
- Report/job inserts and updates are backend/service-role controlled after hardening.
- Doctor report access is assignment-based through `doctor_reviews`.
- Role management is intended for superadmin only.
- Audit log reads are admin-like only; user JWT inserts are denied, while service role bypasses RLS for controlled server-side audit writes.
- The first base migration is intended as a first-time migration and is not fully idempotent because it creates enum types/tables.
- `202609010002_consent_rpc_rls_guard.sql` makes the consent RPC `SECURITY INVOKER`, removes `anon` execution, and preserves authenticated/service-role execution.
- Live JWT-backed RLS verification passed on 2026-09-01 and must be rerun after any RLS migration.

## 9. Known Limitations

- Live staging Supabase is configured for the Vercel Preview `dev` branch only; Production was not changed.
- Normal local runs skip the RLS/Auth harnesses unless their explicit live flags and exact staging project reference are present.
- Supabase's default staging email sender reached its rate limit during repeated diagnostics; configure custom SMTP or an approved quota before beta invitation onboarding.
- Admin operational access currently depends on backend/server service-role routes rather than broad direct client RLS reads.
- Storage remains local/provider-shaped; S3 private storage is not part of this verification.
- Malware scanning, OCR/Marker, durable queue, and production OpenAI paths are intentionally out of scope.
- Do not treat local cookie auth or local JSON storage as PHI-safe.

## 10. Verification Status

| Area | Status | Evidence | Next Step |
| --- | --- | --- | --- |
| Migrations apply cleanly | Partially ready | Schema through `202609010002_consent_rpc_rls_guard.sql` applied via staging SQL editor | Reconcile Supabase CLI migration history before automated promotion. |
| Schema exists | Ready | Staging SQL inventory and deployed Postgres health pass | Recheck after migrations. |
| RLS enabled | Ready for checked core tables | RLS inventory plus live JWT harness passed | Re-run after policy changes. |
| Cross-user RLS | Ready | User A cannot read/update User B profile/report/job metadata | Keep synthetic harness in release gate. |
| Doctor assignment RLS | Ready | Assigned doctor can read; unassigned doctor cannot | Validate full doctor workflow separately. |
| Admin/superadmin controls | Ready for verified boundaries | Doctor/admin role grant denied; superadmin grant/revoke passed | Keep privileged app routes backend-controlled. |
| Frontend secret safety | Ready | Static tests and `.next/static` secret scan passed | Repeat on release build. |
| Backend service-role isolation | Ready for current deployment | Secret is Vercel Preview `dev` only; service-role paths verified | Keep Production unchanged until promotion review. |
| Consent gate | Ready for upload entry | Missing/partial/revoked consent returns 403; both required consents reach MIME validation | Repeat once real storage is configured. |
| Audit logs | Partially ready | Live audit writes and user denial passed | Define append-only/operator review procedure. |
| Signup email delivery | Partially ready | Invite gate reaches Supabase Auth, but default sender quota was exhausted | Configure custom SMTP or approved quota and rerun public signup. |
| Local fallback hardening | Ready in code | Fallback requires local/development plus explicit flag | Keep staging/prod env without fallback flag. |
