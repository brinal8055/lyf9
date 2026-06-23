# CLAUDE.md — Lyf9 AI Codebase Guide

> This file is the single source of truth for Claude (and other AI assistants) working on this
> codebase. Read it fully before writing any code.

---

## 1. What Is This Project?

**Lyf9 AI** (`lyf9.ai`) is a **private, doctor-reviewed personal health graph** built for India.
It lets users upload lab reports (blood tests, etc.), understand biomarkers in plain language,
track trends over time, get AI-assisted explanations, and optionally request doctor review.

**Core principle → AI can explain and organize. Doctors diagnose and prescribe.**

Private beta target: 30–50 early users, 25–100 real lab reports processed safely.

---

## 2. Monorepo Structure at a Glance

```
lyf9/
├── apps/
│   ├── web/          ← Next.js 14 App Router (TypeScript + Tailwind)  [PRIMARY UI]
│   ├── api/          ← FastAPI Python service  [REST + health endpoints]
│   └── worker/       ← Python report-processing worker  [state-machine pipeline]
├── packages/
│   └── shared/       ← Shared TypeScript constants, copy, design tokens
├── infra/
│   └── docker-compose.yml   ← Local Postgres 16 + Redis 7
├── supabase/
│   └── migrations/   ← 7 SQL migration files (full schema)
├── docs/             ← 33 product/architecture/safety documentation files
├── scripts/
│   ├── copy-scan.mjs        ← Scans source for banned medical copy
│   └── verify-staging.mjs  ← Staging environment verification script
├── tests/            ← (root-level test placeholder)
├── package.json      ← Root workspace + npm scripts
└── CLAUDE.md         ← This file
```

---

## 3. Technology Stack

| Layer | Technology |
|-------|-----------|
| **Web Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| **UI Components** | Custom design system (see `src/components/ui/`) |
| **Icons** | Lucide React |
| **Backend API** | FastAPI 0.115.6 (Python 3.x) |
| **Worker** | Python with argparse, async-ready |
| **Database** | PostgreSQL 16 (Supabase-hosted in production) |
| **Auth** | Supabase Auth (+ legacy HttpOnly cookie scaffold) |
| **Storage** | Supabase Storage private bucket (or local `.local/`) |
| **Queue** | Redis 7 (local), SQS-ready architecture |
| **AI/ML** | OpenAI Structured Outputs (`OPENAI_API_KEY`) |
| **Error monitoring** | Sentry (`SENTRY_DSN`) |
| **Analytics** | PostHog |
| **Deployment** | Vercel (web) + Render/Fly (API/worker) + Supabase (DB) |

---

## 4. Quick Start — Installation

### Prerequisites
- Node.js ≥ 18
- Python ≥ 3.11
- Docker Desktop (for local Postgres + Redis)

### Step 1 — JavaScript dependencies
```bash
npm install
```
This installs all workspaces: `apps/web` + `packages/shared`.

### Step 2 — Python dependencies (API)
```bash
python3 -m pip install -r apps/api/requirements.txt
# fastapi, httpx, uvicorn[standard], pytest
```

### Step 3 — Python dependencies (Worker)
```bash
python3 -m pip install -r apps/worker/requirements.txt
# rq or celery + redis
```

### Step 4 — Local infrastructure (Postgres + Redis)
```bash
npm run infra:up
# Postgres on :5432  (lyf9 / lyf9_local)
# Redis on :6379
```

### Step 5 — Environment Variables
Create `.env.local` in `apps/web/` and `.env` in `apps/api/` and `apps/worker/`:

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Database
DATABASE_URL=postgresql://lyf9:lyf9_local@localhost:5432/lyf9

# Redis
REDIS_URL=redis://localhost:6379

# Storage
STORAGE_PROVIDER=local          # or 's3'
S3_REPORT_BUCKET=...            # if using S3

# AI
OPENAI_API_KEY=...

# App
APP_ENV=development
BETA_INVITE_REQUIRED=false       # set to true in production
ADMIN_ALLOWLIST=your@email.com

# Optional
SENTRY_DSN=...
EMAIL_PROVIDER=...
```

### Step 6 — Run services
```bash
# Web app (http://localhost:3000)
npm run dev:web

# API server (http://localhost:8000)
npm run api:dev

# Health checks
npm run api:health
npm run worker:health
```

---

## 5. All npm Scripts

| Script | What it does |
|--------|-------------|
| `npm run dev:web` | Start Next.js dev server (port 3000) |
| `npm run build:web` | Production build of web app |
| `npm run lint` | ESLint on web app |
| `npm run typecheck` | TypeScript check on web app |
| `npm run test` | Run all tests (shared + web) |
| `npm run test:safety` | Run medical safety copy tests |
| `npm run test:rls` | Run Supabase RLS policy tests |
| `npm run test:e2e:mock` | End-to-end mock tests |
| `npm run test:golden` | Golden dataset evaluation |
| `npm run eval:golden` | Golden eval runner |
| `npm run api:dev` | Start FastAPI (uvicorn --reload, port 8000) |
| `npm run api:health` | Check API health |
| `npm run api:test` | Run Python API tests (pytest) |
| `npm run worker:health` | Check worker health |
| `npm run worker:process-once` | Run one processing cycle |
| `npm run infra:up` | Start local Postgres + Redis via Docker |
| `npm run infra:down` | Stop local infrastructure |
| `npm run copy:scan` | Scan for banned medical copy in source |
| `npm run verify:staging` | Full staging environment verification |

---

## 6. Route Map (Next.js App Router)

### Public Routes (`apps/web/src/app/`)
```
/                      → page.tsx          (Landing page)
/login                 → login/page.tsx    (Login)
/signup                → signup/page.tsx   (Signup + beta invite)
/pricing               → pricing/page.tsx  (Pricing placeholder)
```

### Protected User Routes (`/app/*`) — require auth cookie
```
/app                   → app/page.tsx            (Dashboard)
/app/profile           → app/profile/page.tsx    (Health profile)
/app/consent           → app/consent/page.tsx    (Consent flow)
/app/questionnaire     → app/questionnaire/...   (Health questionnaire)
/app/reports           → app/reports/page.tsx    (Reports list)
/app/reports/new       → app/reports/new/...     (Upload — ALSO requires consent cookie)
/app/reports/[id]      → app/reports/[id]/...    (Report result view)
/app/timeline          → app/timeline/...        (Health timeline)
/app/pricing           → app/pricing/...         (User-facing pricing)
```

### Admin Routes (`/admin/*`) — require admin role
```
/admin                 → admin/page.tsx            (Admin dashboard)
/admin/reports         → admin reports queue
/admin/reports/[id]    → admin report detail
```

### Doctor Routes (`/doctor/*`) — require doctor role
```
/doctor                → doctor/page.tsx           (Doctor dashboard)
/doctor/reviews        → review queue
/doctor/reviews/[id]   → review detail + actions
```

### API Routes (`apps/web/src/app/api/`)
```
/api/auth/*            → Auth handlers (signup, login, logout, session)
/api/reports/*         → Report CRUD + upload init + signed URLs
/api/timeline          → Health timeline
/api/reminders         → Retest reminders
/api/feedback          → User feedback submission
/api/admin/*           → Admin operations
/api/doctor/*          → Doctor review actions
/api/consent/*         → Consent persistence
/api/questionnaire/*   → Questionnaire responses
/api/profile/*         → User profile
/api/payments/*        → Payment placeholder
/api/analytics/*       → Event tracking
/api/health            → Health check
```

---

## 7. Key Library Files (`apps/web/src/lib/`)

### `auth/`
| File | Purpose |
|------|---------|
| `constants.ts` | Cookie names: `AUTH_COOKIE_NAME`, `SUPABASE_ACCESS_TOKEN_COOKIE_NAME`, `REQUIRED_CONSENT_COOKIE_NAME` |
| `session.ts` | Session validation helpers |
| `supabase-auth.ts` | Supabase Auth integration |
| `request.ts` | Authenticated request utilities |
| `roles.ts` | RBAC role checks (`user`, `admin`, `doctor`, `superadmin`) |
| `providers/` | Auth provider adapters |

### `reports/`
| File | Purpose |
|------|---------|
| `types.ts` | **All TypeScript types** — ReportFileRecord, BiomarkerResultRecord, HealthInsightRecord, etc. (707 lines) |
| `catalog.ts` | Biomarker catalog (v1) — canonical names, keys, categories |
| `biomarkers.ts` | Extraction schema validation + biomarker normalization |
| `safety.ts` | AI output safety rules — blocks unsafe medical language |
| `classification.ts` | Report type classification (supported / limited-beta / unsupported) |
| `parser.ts` | `DocumentParser` interface — plug Marker or other parsers here |
| `presentation.ts` | Report presentation helpers (marker card formatting) |
| `validation.ts` | Upload validation (MIME, size, checksum) |
| `signed-url.ts` | Short-lived signed URL generation |
| `repository.ts` | Local file-system based data store (140KB — Phase 2 scaffold) |
| `supabase-repository.ts` | Supabase-backed repository (35KB — production path) |
| `fixtures/` | Test fixtures for local development |
| `providers/` | Storage/parser provider adapters |

### `ai/`
AI structured output schemas and prompt utilities.

### `workflow/`
Processing state machine utilities.

### `storage/`
File storage adapters (local vs. S3 vs. Supabase).

### `malware/`
Malware scanning integration.

### `observability/`
Sentry + structured logging setup.

### `safety/`
Medical safety rules and copy validation.

### `onboarding/`
Onboarding flow state helpers.

### `biomarkers/`
Biomarker utilities (separate from `reports/biomarkers.ts`).

### `document-extraction/`
Document parsing + OCR utilities.

### `evaluation/`
Golden dataset evaluation runner.

### `utils.ts`
Generic utility functions.

---

## 8. Shared Package (`packages/shared/src/index.ts`)

This is imported as `@lyf9/shared` in web code. Contains:

```typescript
PRODUCT_NAME            = "Lyf9 AI"
PRODUCT_DOMAIN          = "lyf9.ai"
PRODUCT_SHORT_NAME      = "Lyf9"

REQUIRED_DISCLAIMER     // Medical disclaimer copy
ENTRY_FLOW_DISCLAIMER   // Entry/consent screen copy
CRITICAL_VALUE_DISCLAIMER
UNSUPPORTED_REPORT_FALLBACK

SUPPORTED_REPORT_TYPES  // ["CBC", "Lipid profile", "Thyroid profile", ...]
UNSUPPORTED_REPORT_TYPES // ["Radiology scans", "ECG/EEG", ...]

CONSENT_VERSION         = "private_beta_v1"
REQUIRED_CONSENT_TYPES  = ["lab_report_processing", "ai_analysis"]
OPTIONAL_CONSENT_TYPES  = ["doctor_review", "reminders_notifications", ...]

DESIGN_TOKENS           // Colors, radius, layout tokens
```

---

## 9. Design System (Tailwind + Design Tokens)

### Color Palette
| Token | Value | Use |
|-------|-------|-----|
| `ink` | `#050505` | Background (near-black) |
| `charcoal` | `#101010` | Card backgrounds |
| `card` | `#171717` | Elevated cards |
| `ivory` | `#F7F4ED` | Primary text |
| `muted` | `#A7A29A` | Secondary text |
| `dim` | `#6F6A63` | Tertiary text |
| `orange` | `#FF6A3D` | Brand / CTA accent |
| `green` | `#45D6A2` | Success / normal |
| `blue` | `#5B7CFA` | Info |
| `yellow` | `#F5B65A` | Warning |
| `danger` | `#FF4D4D` | Error / critical |
| `cream` | `#F6F1E8` | Light section backgrounds |

### Border Radius
| Token | Value |
|-------|-------|
| `rounded-ui` | `12px` |
| `rounded-card` | `20px` |
| `rounded-panel` | `36px` |

### Layout
- Max container: `1280px` (class `max-w-shell`)
- Navbar height: `72px`

---

## 10. Processing Pipeline — State Machine

Reports flow through these states (defined in `apps/web/src/lib/reports/types.ts` + worker):

```
uploaded
  → malware_scan → scan_pending → scan_passed / scan_failed / scan_configuration_required
  → classified / unsupported
  → text_extraction_pending → text_extracted / ocr_required → ocr_completed
  → extraction_failed
  → biomarker_extraction_pending → biomarker_extracted
  → normalized → validated / validation_failed
  → low_confidence_review_required / critical_review_required
  → insight_generation_pending → insight_generated
  → doctor_review_required → doctor_reviewed
  → published
  → failed / archived / deleted
```

**Processing steps** (in order):
1. `malware_scan`
2. `classify_report`
3. `extract_document` (text/tables)
4. `ocr_fallback` (if image/low-text)
5. `extract_biomarkers` (AI structured output)
6. `normalize_biomarkers`
7. `validate_biomarkers`
8. `run_safety_rules`
9. `generate_patient_explanation`
10. `route_review`
11. `publish_result`

---

## 11. Database Schema (Supabase PostgreSQL)

Migrations in `supabase/migrations/` (apply in order):

| File | Contents |
|------|---------|
| `202606060001_private_beta_core.sql` | Core tables: users, profiles, consents, report_files, lab_reports, biomarker_results, health_insights, doctor_reviews, audit_logs, processing_jobs |
| `202606060002_auth_persistence_rls_hardening.sql` | RLS policies, auth persistence |
| `202606060003_private_storage_scan_status.sql` | scan_status column |
| `202606060004_durable_processing_workflow.sql` | processing_job_steps table |
| `202606060005_atomic_processing_job_claim.sql` | Atomic job claiming (prevents double-processing) |
| `202606060006_document_extraction_foundation.sql` | extracted_documents table |
| `202606120001_schema_first_ai_layer.sql` | model_runs, biomarker_catalog, biomarker_aliases, health_risk_flags, notifications, analytics_events, data_rights_requests, beta_invites |

**Key RLS rule**: Users see ONLY their own data. Doctors see only assigned reviews. Admins have elevated access but every raw report view is audit-logged.

---

## 12. Middleware & Auth Flow

`apps/web/src/middleware.ts` protects `/app/*`, `/admin/*`, `/doctor/*`:
1. Checks for `sb-access-token` cookie (Supabase) OR legacy `auth` cookie.
2. Redirects unauthenticated → `/login?next=<path>`.
3. For `/app/reports/new`: additionally requires `required-consent=true` cookie.

---

## 13. Medical Safety Rules — NEVER BREAK THESE

### AI Output MUST include:
- `REQUIRED_DISCLAIMER` copy on every result
- Source biomarker values (not just AI interpretation)
- Doctor review routing for critical/high-risk values

### AI Output MUST NOT:
- Diagnose disease as a final statement
- Prescribe medicines or supplements as treatment
- Say a doctor is not needed
- Interpret unsupported report types (radiology, ECG, biopsy, etc.)
- Publish insights without passing the `safety.ts` filter

### Language to USE:
- "may indicate", "can be associated with"
- "please discuss with a doctor"
- "doctor review is recommended"

### Language to NEVER USE:
- Direct disease assertions ("You have X")
- Direct medication instructions
- Supplement-as-treatment claims

### Safety utilities:
- `apps/web/src/lib/reports/safety.ts` — validates AI output
- `scripts/copy-scan.mjs` — scans ALL source files for banned copy
- `apps/web/src/lib/safety/` — additional safety rules

---

## 14. Biomarker Catalog

Defined in `apps/web/src/lib/reports/catalog.ts`. V1 covers:
- CBC markers (Hemoglobin, WBC, RBC, Platelets, etc.)
- Lipid (LDL, HDL, Triglycerides, Total Cholesterol)
- Thyroid (TSH, T3, T4, Free T3, Free T4)
- Liver (ALT, AST, Bilirubin, etc.)
- Kidney (Creatinine, BUN, GFR, Uric Acid)
- HbA1c + Glucose
- Vitamins (D, B12, Ferritin, Iron)

Each entry has: `canonicalKey`, `canonicalName`, `category`, `defaultUnit`, `allowedUnits`, `normalRangeRules`, `criticalRules`, `requiresDoctorReviewWhenAbnormal`.

Aliases are stored per-lab, per-locale with `confidenceWeight` for fuzzy matching.

---

## 15. Key Components (`apps/web/src/components/`)

```
ui/
  alert.tsx       ← Alert/disclaimer box
  badge.tsx       ← Status/label badge
  button.tsx      ← buttonClassName() helper
  card.tsx        ← Card, CardHeader, CardContent, CardTitle

layout/
  section-container.tsx  ← Centered max-width section wrapper

auth/              ← Login/signup form components
onboarding/        ← Profile, consent, questionnaire components
reports/           ← Marker cards, report status, timeline items
admin/             ← Admin-specific UI
doctor/            ← Doctor review UI
feedback/          ← Feedback form
payments/          ← Payment placeholder UI
app/               ← App dashboard layout components
```

---

## 16. FastAPI (`apps/api/`)

Entry: `apps/api/app/main.py`

```python
GET /health        → {"status": "ok", "service": "api"}
GET /health/deep   → Checks all env vars (DB, Redis, S3, Supabase, OpenAI, etc.)
```

Auth module: `apps/api/app/auth.py` — JWT validation, role checks.

To add new routes: create a new module in `apps/api/app/`, import in `main.py`.

---

## 17. Worker (`apps/worker/`)

Entry: `apps/worker/app/worker.py`

```bash
python3 -m app.worker health        # Check config
python3 -m app.worker process-once  # Run one processing cycle (stub)
```

Provider adapters live in `apps/worker/app/providers/`.
The `DocumentParser` interface (from `apps/web/src/lib/reports/parser.ts`) has a matching Python contract here.

---

## 18. Testing

```bash
# All tests
npm run test

# Specific suites
npm run test:safety          # Medical safety copy rules
npm run test:rls             # Supabase RLS policy tests
npm run test:e2e:mock        # End-to-end (mock backend)
npm run test:golden          # Golden dataset evaluation
npm run api:test             # Python pytest (apps/api/)
```

Test files follow the pattern `*.test.ts` co-located with source.

Key test files:
- `apps/web/src/lib/reports/reports.test.ts` (73KB — comprehensive)
- `apps/web/src/lib/auth/session.test.ts`
- `apps/web/src/lib/auth/supabase-foundation.test.ts`
- `apps/web/src/lib/auth/supabase-live-rls.test.ts`

---

## 19. Documentation Index (`docs/`)

| File | Topic |
|------|-------|
| `00_PRODUCT_CONTEXT.md` | Vision, ICP, MVP scope, medical safety rules |
| `01_BRAND_AND_DESIGN_DNA.md` | Brand identity, design system |
| `02_TECH_ARCHITECTURE.md` | Full architecture, deployment |
| `03_DATABASE_SCHEMA.md` | Detailed schema reference |
| `04_AI_AND_SAFETY_RULES.md` | AI pipeline safety |
| `05_PHASED_IMPLEMENTATION_PLAN.md` | Phase 0–6 roadmap |
| `06_PRIVATE_BETA_LAUNCH_CHECKLIST.md` | Launch gate checklist |
| `11_WORKFLOW_AND_PROCESSING_PIPELINE.md` | Processing pipeline detail |
| `12_DOCUMENT_EXTRACTION_PROVIDERS.md` | Marker / Textract integration |
| `13_AI_STRUCTURED_OUTPUTS_AND_MODEL_RUNS.md` | OpenAI schema design |
| `14_BIOMARKER_CATALOG_AND_NORMALIZATION.md` | Catalog spec |
| `15_MEDICAL_SAFETY_AND_CLINICAL_BOUNDARIES.md` | Clinical safety rules |
| `18_END_TO_END_CODEBASE_AUDIT.md` | Audit findings |
| `19_PRIVATE_BETA_GAP_ANALYSIS.md` | What's built vs. needed |
| `DEPLOYMENT.md` | Deployment runbook |
| `PRIVATE_BETA_RUNBOOK.md` | Beta ops runbook |
| `PROGRESS.md` | Detailed progress log (38KB) |

---

## 20. Implementation Phases

| Phase | Status | What was built |
|-------|--------|---------------|
| **Phase 0** | ✅ Done | Monorepo scaffold, health endpoints, shared constants |
| **Phase 1** | ✅ Done | Auth (Supabase), profile, consent, questionnaire, cookies |
| **Phase 2** | ✅ Done | Upload init, local private storage, processing job creation |
| **Phase 3A** | ✅ Done | Document extraction interface (`DocumentParser`), classification |
| **Phase 3B** | ✅ Done | Biomarker catalog, extraction schema, safety validation, mock extractor |
| **Phase 4** | ✅ Done | Report result page, timeline, reminders, feedback |
| **Phase 5** | 🔄 Staging | Supabase wiring, RLS, real storage, Textract/OpenAI integration |
| **Phase 6** | 🔲 Pending | Payments (Razorpay sandbox), doctor marketplace v1 |

---

## 21. What NOT to Build (MVP Exclusions)

- Mobile app
- Wearable integrations (Fitbit, Apple Health, etc.)
- ABDM/ABHA government health ID
- Genetics / genomics
- Pharmacy integration
- Supplement marketplace
- Full doctor marketplace (v1 review only)
- Automated prescriptions
- Lab booking API
- Insurance / employer workflows

**Unsupported reports** (never auto-interpret):
Radiology, X-ray, CT, MRI, Ultrasound, ECG/EEG, Biopsy, Pregnancy, Pediatric, Cancer markers as standalone, Emergency diagnosis, Prescription change advice.

---

## 22. Common Patterns & Conventions

### TypeScript
- All types in `apps/web/src/lib/reports/types.ts`
- Use `@lyf9/shared` for product constants — never hardcode product name
- Import shared via `@lyf9/shared` (workspace package)
- Import within web via `@/` (root of `apps/web/src/`)

### Adding a new API route (Next.js)
Create `apps/web/src/app/api/<name>/route.ts` using Next.js App Router conventions.
Always validate auth via `apps/web/src/lib/auth/session.ts` first.

### Adding a new page
Create `apps/web/src/app/<path>/page.tsx`.
Protected pages go under `/app/`, `/admin/`, or `/doctor/`.

### Adding a new biomarker
1. Add to `apps/web/src/lib/reports/catalog.ts`
2. Add aliases to the catalog seed
3. Add to the DB migration if persisting

### Processing state transitions
Follow the state machine in `apps/worker/app/worker.py` (`PHASE3B_STATES`).
Every transition writes to `processing_job_steps` and `audit_logs`.

### Safety check before any AI output
Always run through `apps/web/src/lib/reports/safety.ts` `validateSafeExplanation()` before storing or showing AI output.

---

## 23. Environment Checklist (Before Going Live)

- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set
- [ ] `DATABASE_URL` points to production Postgres
- [ ] `REDIS_URL` configured
- [ ] `OPENAI_API_KEY` set (required for Phase 3B+)
- [ ] `STORAGE_PROVIDER=s3` with `S3_REPORT_BUCKET`
- [ ] `BETA_INVITE_REQUIRED=true`
- [ ] `ADMIN_ALLOWLIST` configured
- [ ] `SENTRY_DSN` for error tracking
- [ ] `APP_ENV=production`
- [ ] Supabase RLS policies applied (all 7 migrations run)
- [ ] Backups enabled on Supabase
- [ ] Malware scanner configured (`MALWARE_SCANNER_PROVIDER`)
- [ ] `EMAIL_PROVIDER` set for notifications

---

*Last updated: June 2026. Refer to `docs/PROGRESS.md` for the most current implementation status.*
