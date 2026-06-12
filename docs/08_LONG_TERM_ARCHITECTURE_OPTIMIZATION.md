# Long-Term Architecture Optimization

## Current Architecture Discovered

The repository is a monorepo:

- `apps/web`: Next.js, TypeScript, Tailwind, shadcn-style local UI primitives, local cookie auth scaffold, local JSON report store.
- `apps/api`: FastAPI health scaffold for privileged backend responsibilities.
- `apps/worker`: Python worker CLI scaffold with health and process-once commands.
- `packages/shared`: product constants, supported report lists, disclaimers, shared design tokens.
- `infra`: local Docker Compose for Postgres/Redis.
- `supabase/migrations`: production-shaped Supabase Postgres schema and RLS migration.
- `docs`: product, safety, architecture, deployment, and runbook documents.

## Local-Only Scaffold Pieces

- Auth sessions are signed local cookies.
- Roles are inferred from configured email allowlists.
- Report metadata is stored in `.local/reports/store.json`.
- Report files are stored in local private disk storage.
- Processing runs synchronously after local upload completion.
- Parser, OCR, malware scanning, AI extraction, payment, email, analytics, and observability are local/mock/provider-ready scaffolds.

## Production-Suitable Already

- Product boundaries and branding rules are documented.
- Supported and unsupported report scope is explicit.
- Upload validation accepts PDF/JPG/JPEG/PNG only.
- Required consent gate exists before upload.
- Processing jobs and steps are modeled as source of truth.
- Unsupported reports do not receive AI-only interpretation.
- Biomarker extraction and explanation are schema-first.
- Low-confidence and critical cases route to review.
- Admin correction preserves original extracted values.
- Doctor review is assignment-scoped in the scaffold.
- Audit logs exist for sensitive local actions.
- Beta invite control exists.

## Must Migrate Before Real PHI

- Replace local cookie auth with Supabase Auth.
- Replace email-inferred roles with database-backed `user_roles`.
- Replace `.local` JSON persistence with Supabase Postgres migrations.
- Enable and test RLS for all user-owned tables.
- Replace local private files with private S3 object storage.
- Add real malware scanning before extraction.
- Replace synchronous processing with durable workflow/queue.
- Integrate Marker and OCR fallback for real documents.
- Enable OpenAI Structured Outputs behind schema validation and safety checks.
- Add Sentry/PostHog or privacy-reviewed equivalents.
- Complete DPDP, consent, doctor, telemedicine, payment, refund, and disclaimer legal review.

## Target Architecture

- Frontend: Next.js, TypeScript, Tailwind, shadcn-style components.
- Auth: Supabase Auth with email/password, magic link, or OAuth.
- Database: Supabase Postgres with migrations and RLS.
- Backend: FastAPI service using service role only server-side.
- Worker: Python worker for parsing, OCR, AI, safety, retries, review routing.
- Storage: private AWS S3 bucket in `ap-south-1` where possible.
- Workflow: `processing_jobs` as source of truth with Redis/Celery or Inngest-compatible provider.
- AI: OpenAI Structured Outputs, strict schemas, model run logging, safety gate before publication.
- Observability: Sentry for errors, PostHog or internal analytics for beta funnel, structured logs without raw PHI.
- Payments: Razorpay sandbox only until legal approval.
- Email: Resend or SES provider abstraction; no sensitive report contents in email bodies.

## Chosen Vendors

| Area | Choice | Why |
| --- | --- | --- |
| Auth | Supabase Auth | Good private beta velocity, JWT support, Postgres adjacency. |
| Database | Supabase Postgres | Managed Postgres, migrations, RLS, operational simplicity. |
| Storage | AWS S3 | Private buckets, lifecycle policy, KMS-ready, malware scan integration, India-region control. |
| Backend | FastAPI | Clear privileged boundary for service-role operations. |
| Worker | Python | Best fit for document parsing, OCR, Pydantic validation, AI orchestration. |
| Workflow | Redis/Celery or Inngest abstraction | Retries, resumability, failure visibility without in-memory queues. |
| Parser | Marker | Strong PDF-to-structured-text foundation. |
| OCR | AWS Textract fallback | Scanned PDF/image path with production OCR option. |
| AI | OpenAI Structured Outputs | Schema-constrained extraction/explanation. |
| Errors | Sentry | Mature error grouping with PII filtering options. |
| Analytics | PostHog/internal table | Privacy-reviewable beta funnel tracking. |
| Payments | Razorpay sandbox | India-ready payment path, disabled for public launch. |

## Migration Sequence

1. Run Supabase migration in `supabase/migrations/202606060001_private_beta_core.sql`.
2. Enable Supabase Auth and move signup/login/session validation behind AuthProvider.
3. Migrate roles into `user_roles`; remove email-inferred role trust from production.
4. Move local report store records into Postgres tables.
5. Configure private S3 bucket and replace local upload URLs with presigned S3 URLs.
6. Add malware scanner provider before extraction.
7. Replace synchronous processing with durable workflow provider.
8. Wire Marker provider and OCR fallback.
9. Wire OpenAI Structured Outputs with Pydantic validation and model run logging.
10. Run internal report fixture set, then 25 human-reviewed internal reports.
11. Invite 30-50 users only after go/no-go checklist is green or explicitly accepted by owners.

## Risks

- RLS mistakes could expose user health data.
- Service-role leakage would be severe; service role must never reach browser code.
- OCR/parser errors can cause biomarker extraction errors.
- Critical false negatives are the highest clinical safety risk.
- AI wording drift could create diagnosis/prescription claims.
- Payment or doctor-reviewed public launch before legal review creates regulatory risk.

## Rollback Strategy

- Keep local scaffold operational for development only.
- Run migrations in staging before production.
- Keep upload pause switch operational through `LYF9_BETA_ACCESS_MODE=allowlist` plus disabled invites.
- Prefer append-only/corrected fields for medical data changes.
- Store processing version on jobs so reprocessing can be isolated.
- Disable AI publication if schema validation, safety filter, or model-run logging fails.

## What Not To Build Yet

No public launch, autonomous diagnosis, prescriptions, medicine change advice, supplement protocols, pharmacy commerce, full doctor marketplace, lab booking, mobile app, ABDM/ABHA, wearables, genetics, employer, or insurance flows.
