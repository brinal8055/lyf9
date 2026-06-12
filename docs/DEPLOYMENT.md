# Lyf9 AI Private Beta Deployment Notes

This is a 30-50 user private beta plan, not a public launch plan.

## Required Services

- Web: Next.js app in `apps/web`.
- API: FastAPI app in `apps/api`.
- Worker: Python worker in `apps/worker`.
- Database: PostgreSQL with migrations before real users.
- Queue: Redis for report-processing jobs.
- Storage: private S3-compatible bucket for report files.
- AI: OpenAI Structured Outputs once credentials and prompts are production reviewed.
- Payments: Razorpay sandbox only until legal review is complete.
- Email: provider-replaceable email service for operational notifications.
- Analytics: privacy-reviewed analytics provider or local event store.

## Environment Variables

Use:

```txt
apps/web/.env.example
apps/api/.env.example
apps/worker/.env.example
```

Production secrets must be set in the deployment platform secret manager. Do not commit `.env`, `.env.local`, private keys, bucket credentials, payment secrets, OpenAI keys, or email provider keys.

Minimum production values:

```txt
DATABASE_URL
REDIS_URL
APP_ENV
APP_BASE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
BETA_INVITE_REQUIRED
ADMIN_ALLOWLIST
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
S3_REPORT_BUCKET
LYF9_AUTH_SECRET
LYF9_REPORT_URL_SECRET
LYF9_BETA_ACCESS_MODE
OPENAI_API_KEY
OPENAI_MODEL_EXTRACTION
OPENAI_MODEL_EXPLANATION
OPENAI_MODEL_DOCTOR_SUMMARY
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
EMAIL_PROVIDER
SENTRY_DSN
```

## Web Deployment

Recommended private beta target: Vercel or equivalent Node hosting.

Commands:

```txt
npm install
npm run lint
npm run typecheck
npm run build:web
```

Health check:

```txt
GET /api/health
```

Private beta controls:

```txt
BETA_INVITE_REQUIRED=true
ADMIN_ALLOWLIST=<comma-separated admin emails>
LYF9_BETA_ACCESS_MODE=invite_code
LYF9_BETA_INVITE_CODE=<shared fallback code, optional>
LYF9_BETA_ALLOWLIST_EMAILS=<comma-separated admin/test emails, optional>
```

Web browser code may use only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_BASE_URL`. If Next.js route handlers are deployed as a backend-for-frontend, `SUPABASE_SERVICE_ROLE_KEY` must be configured only as a server-side secret and must never be prefixed with `NEXT_PUBLIC_`.

## API Deployment

Recommended private beta target: Render, Fly.io, Railway, or ECS.

Commands:

```txt
cd apps/api
python3 -m pytest
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Health checks:

```txt
GET /health
GET /health/deep
```

`/health/deep` reports whether database, Redis, and storage targets are configured. It does not replace real connectivity checks after PostgreSQL/S3/Redis are wired.

## Worker Deployment

Recommended private beta target: same provider as API, with one always-on worker.

Commands:

```txt
cd apps/worker
python3 -m app.worker health
python3 -m app.worker process-once
```

Private beta requirement:

- One worker can process reports sequentially for 30-50 users.
- Queue visibility must show stuck jobs.
- Worker logs must not include raw report text or PHI.

## Database Migrations

Before real users:

- Create PostgreSQL schema from `docs/03_DATABASE_SCHEMA.md`.
- Apply Supabase migration `supabase/migrations/202606060001_private_beta_core.sql`.
- Apply Supabase hardening migration `supabase/migrations/202606060002_auth_persistence_rls_hardening.sql`.
- Enable RLS policies and test them with user, doctor, admin, and superadmin accounts.
- Store users, consents, report metadata, jobs, biomarkers, insights, doctor reviews, payments, feedback, analytics events, notifications, audit logs, and beta invites in PostgreSQL.
- Keep UUID primary keys and timestamps.
- Run migrations before deploying app code that expects new columns.

Current blocker:

- The Supabase Auth/Postgres/RLS foundation exists in code, but migrations and JWT-backed RLS tests have not been run in a live staging Supabase project.

## Storage Bucket

Before real users:

- Create a private bucket.
- Disable public object access.
- Configure `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `S3_REPORT_BUCKET`.
- Use short-lived signed URLs only.
- Restrict upload MIME types to PDF, JPG, JPEG, PNG.
- Add malware scanning before processing.
- Add retention/deletion policy reviewed for DPDP compliance.

Current blocker:

- Local storage is used for scaffold verification.

## Queue And Redis

Before real users:

- Create Redis instance.
- Configure `REDIS_URL`.
- Move report processing from synchronous local route execution to queued worker processing.
- Add retry and dead-letter visibility for failed reports.

Current blocker:

- Worker command is a health/process stub; Next.js upload currently runs local processing synchronously.

## Go/No-Go Deployment Gates

Required before inviting 30-50 users:

- Production auth and RBAC configured.
- PostgreSQL migration complete.
- Private S3-compatible storage configured.
- Redis queue configured.
- Malware scanning configured.
- Upload, unsupported report, low-confidence, critical, admin correction, doctor review, feedback, export/delete, and audit paths tested.
- Legal review started for consent, privacy, disclaimers, doctor review, payments, refunds, and DPDP obligations.

Public launch remains blocked until legal review is complete.
