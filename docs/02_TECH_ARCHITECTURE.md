# lyf9.ai Technical Architecture

## Current Repo State

The workspace currently contains no app code, no package files, and no Git metadata. There is no existing tech stack to preserve.

Recommended Phase 0 action:

Create a clean private-beta monorepo after this documentation pack is approved:

```txt
apps/
  web/          Next.js app: landing, user app, admin, doctor dashboard
  api/          FastAPI service: product API, auth webhooks, report workflow
  worker/       Python workers: parsing, OCR, extraction, AI, reminders
packages/
  shared/       Shared TypeScript types generated from API schemas where useful
docs/
  ...
infra/
  docker/       Local Postgres/Redis/services
  migrations/   Database migration files
```

## Architecture Goal

Use a pragmatic private-beta architecture that is production capable for 30-50 users and can process 25-100 reports safely without forcing premature microservices.

Recommendation:

```txt
Frontend:        Next.js + TypeScript + Tailwind + shadcn/ui
Backend API:     FastAPI + Python
Database:        PostgreSQL
Storage:         S3-compatible private object storage
Queue:           Redis Queue/Celery initially, SQS later if on AWS
Workers:         Python report-processing workers
Cache:           Redis
AI:              OpenAI Structured Outputs
Admin:           Protected Next.js admin routes
Doctor portal:   Protected Next.js doctor routes
Observability:   Sentry + structured logs + OpenTelemetry-ready traces
Deployment:      Vercel for web; Render/Fly/AWS ECS for API/worker; Supabase/RDS for Postgres
```

If the team wants fewer moving pieces for the first two weeks, use Supabase for Postgres, Auth, and private storage, while keeping FastAPI and the worker as the report-processing backend. Do not put medical pipeline logic only in Next.js routes.

## Why Modular Monolith + Workers

The core private-beta risk is not simple CRUD. The risk is safe handling of medical documents:

- File validation.
- Private storage.
- OCR/document parsing.
- Structured biomarker extraction.
- Critical value rules.
- AI safety constraints.
- Doctor review.
- Auditability.

A modular monolith with async workers keeps implementation fast while still making the processing pipeline explicit and testable.

## Frontend

Use Next.js App Router with TypeScript.

Public routes:

- `/`
- `/login`
- `/signup`
- `/pricing` or beta pricing section
- `/privacy`
- `/terms`

User app routes:

- `/app`
- `/app/profile`
- `/app/consent`
- `/app/questionnaire`
- `/app/reports`
- `/app/reports/new`
- `/app/reports/[id]`
- `/app/timeline`
- `/app/reminders`
- `/app/feedback`

Admin routes:

- `/admin`
- `/admin/reports`
- `/admin/reports/[id]`
- `/admin/jobs`
- `/admin/corrections`
- `/admin/audit`

Doctor routes:

- `/doctor`
- `/doctor/reviews`
- `/doctor/reviews/[id]`

Frontend rules:

- Use typed API contracts.
- Show explicit loading, processing, failed, unsupported, manual review, AI-only, and doctor-reviewed states.
- Keep medical disclaimers visible on upload and result pages.
- Never expose private file URLs directly; use short-lived signed URLs.

## Backend API

Use FastAPI with typed Pydantic schemas.

Core modules:

```txt
auth
users
user_profiles
user_health_profiles
consents
questionnaires
report_files
lab_reports
biomarkers
processing_jobs
processing_job_steps
model_runs
health_insights
doctor_reviews
reminders
payments
feedback_events
audit_logs
admin
```

API responsibilities:

- Enforce auth and RBAC.
- Validate upload metadata and supported file types.
- Create report file records.
- Generate private upload/download signed URLs.
- Create processing jobs.
- Serve report and insight data.
- Persist consent and audit logs.
- Manage doctor review actions.
- Manage admin corrections.
- Expose feedback event and reminder endpoints.

## Authentication And RBAC

Private beta roles:

```txt
user
support
admin
doctor
superadmin
```

Minimum access rules:

- Users can see only their own reports.
- Doctors can see only assigned reports.
- Admins can see report metadata and raw files only when needed for operations.
- Every raw report view must create an audit log.
- Support should not see raw PHI unless explicitly elevated.

Auth choices:

- Private beta fast path: Supabase Auth or Clerk.
- Self-hosted path: Auth.js for web plus API JWT validation.

Whichever is chosen, store role and profile data in the application database.

## Database

Use PostgreSQL with migrations.

Required characteristics:

- UUID primary keys.
- Timestamps on every table.
- Soft delete or lifecycle fields where deletion must be audited.
- Row-level ownership fields for user-scoped records.
- JSONB only where schema flexibility is useful, not as a substitute for core columns.
- Enum-like constrained states for processing and review workflows.

See [03_DATABASE_SCHEMA.md](./03_DATABASE_SCHEMA.md).

## Private File Storage

Use S3-compatible private object storage.

Rules:

- Private bucket only.
- Presigned uploads with file size and MIME restrictions.
- Supported upload types: PDF, JPG, PNG.
- Store checksum, size, MIME type, original filename, and storage key.
- Never render long-lived public URLs.
- Short-lived signed download URLs for user/admin/doctor views.
- Malware scan before automated processing.
- Unsupported files can be stored only if user consent allows storage without interpretation.

## Queue And Worker

Use a queue for all report processing. Never process reports synchronously in the request that uploads a file.

Private beta options:

- Redis Queue or Celery with Redis for local/simple hosted setup.
- AWS SQS if deploying API/worker on AWS.

Worker responsibilities:

- Scan file.
- Classify report type.
- Extract text/tables.
- Run OCR fallback when needed.
- Run structured biomarker extraction.
- Normalize biomarkers.
- Apply critical value rules.
- Generate AI explanation.
- Create doctor-review task when needed.
- Update processing job state.
- Write model run and audit records.

## Processing State Machine

Use explicit states:

```txt
uploaded
scan_pending
scan_passed
scan_failed
classified
unsupported
text_extraction_pending
text_extracted
ocr_required
biomarker_extraction_pending
biomarker_extracted
normalized
validated
low_confidence_review_required
critical_review_required
insight_generation_pending
insight_generated
doctor_review_required
doctor_reviewed
published
failed
archived
deleted
```

Each state transition should be logged in `processing_jobs` and `audit_logs`.

## AI Pipeline

Pipeline:

```txt
File uploaded
-> malware scan
-> report classification
-> text/table extraction
-> OCR fallback if needed
-> structured biomarker extraction
-> biomarker normalization
-> deterministic validation and critical rules
-> confidence scoring
-> manual correction if required
-> AI explanation generation
-> doctor review if requested/required
-> publish to user dashboard
```

AI rules:

- Use OpenAI Structured Outputs for extraction and explanation schemas.
- Do not pass full raw reports to AI if extracted/cleaned text is enough.
- Remove phone, address, email, and identifiers before model calls when not needed.
- Store model, prompt version, input hash, output hash, token estimate, latency, and task type.
- Do not store unnecessary PHI in logs.
- Route invalid structured output to failed/manual review, not user publication.

## Admin Panel

Admin v1 must include:

- Uploaded reports list.
- Processing state and error details.
- Unsupported report queue.
- Low-confidence extraction queue.
- Manual biomarker correction.
- Failed AI/model run inspection.
- Doctor review queue overview.
- Audit log viewer.
- User feedback event viewer.

Admin must not become a broad CRM. Keep it focused on safety, extraction quality, and beta operations.

## Doctor Review Workflow

Doctor v1 must include:

- Assigned review queue.
- User basic profile, symptoms, goals, medicines, and relevant history.
- Original report viewer through signed URL.
- Extracted biomarker table.
- Abnormal/critical markers.
- AI explanation draft.
- Actions: approve, edit and approve, reject, request more info.
- Doctor notes.
- Published doctor-reviewed badge.

Doctor review is required for critical values, high-risk contexts, diagnosis, treatment plans, prescription changes, and supplement protocols as treatment.

## Audit Logs

Audit every sensitive event:

- Login and role changes.
- Consent grant/revoke.
- Report upload/delete.
- Signed URL creation.
- Raw report view.
- Processing state transition.
- Biomarker correction.
- AI model run.
- Insight publication.
- Doctor review action.
- Admin access.
- Data export/delete request.

Audit logs must include actor, role, action, entity type, entity id, timestamp, request id, IP/user agent where available, and safe metadata. Do not store raw PHI in audit metadata.

## Payments

Private beta can start with a placeholder:

- Pricing page or beta plan cards.
- `payments` table.
- Sandbox payment state.
- Manual "paid" override for admin.

If integrating payment in Phase 6, use Razorpay sandbox for India. Do not enable paid doctor-reviewed plans publicly before legal review of telemedicine, refund, doctor contracts, and disclaimers.

## Deployment

Pragmatic private-beta setup:

```txt
Web:       Vercel
API:       Render/Fly/AWS ECS
Worker:    Render worker/Fly machine/AWS ECS service
Database:  Supabase Postgres or AWS RDS Postgres
Redis:     Upstash/Render Redis/AWS ElastiCache
Storage:   Supabase Storage private bucket or AWS S3
Email:     Resend/Postmark
Errors:    Sentry
Analytics: PostHog
```

Required environments:

- Local.
- Staging.
- Production private beta.

Launch guardrails:

- Staging must have separate storage, database, and API keys.
- Production AI prompts and schemas must be versioned.
- Production logs must redact PHI.
- Backups must be enabled before beta users upload reports.
