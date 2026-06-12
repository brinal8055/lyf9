# lyf9.ai Private Beta

Phase 0 scaffold for Lyf9 AI.

## Structure

```txt
apps/web       Next.js + TypeScript + Tailwind app shell
apps/api       FastAPI service with /health
apps/worker    Python worker skeleton with health command
packages/shared Shared constants and safety copy
infra          Local Postgres/Redis helpers
docs           Product, safety, architecture, and progress docs
```

## Local Commands

Install JavaScript dependencies:

```sh
npm install
```

Run the web app:

```sh
npm run dev:web
```

Run web checks:

```sh
npm run typecheck
npm run lint
npm run build:web
```

Install Python dependencies for API checks:

```sh
python3 -m pip install -r apps/api/requirements.txt
```

Run the API:

```sh
npm run api:dev
```

Check API and worker health:

```sh
npm run api:health
npm run worker:health
```

Run local Postgres and Redis:

```sh
npm run infra:up
```

Phase 0 intentionally does not include auth, uploads, AI processing, report pages, doctor review, or payments.

## Phase 1 Auth And Storage Note

Phase 1 includes a minimal onboarding auth skeleton:

- Signup/login route handlers set a signed HttpOnly session cookie.
- Protected `/app/*` routes require the session cookie.
- `/app/reports/new` also requires the required-consent cookie.
- Profile, questionnaire, and consent records use local browser storage for the scaffold.
- Consent POSTs enrich records with timestamp, version, user-agent, and IP when headers provide it.

Before real private beta users, replace this scaffold with:

- Clerk, Supabase Auth, or Auth.js-backed authentication.
- PostgreSQL persistence for users, profiles, questionnaire responses, and consent history.
- Server-side authorization checks for all product APIs.

## Phase 2 Upload And Storage Note

Phase 2 includes a local private-storage equivalent:

- Upload init validates auth, required consent, MIME type, file size, and SHA-256 checksum.
- Supported MIME types are PDF, JPG/JPEG, and PNG.
- Uploaded bytes are stored under ignored `.local/reports/private/`.
- Table-shaped JSON metadata is stored under ignored `.local/reports/store.json`.
- Signed upload/download URLs are short-lived API routes, not public file URLs.
- Each upload creates one report file, lab report placeholder, processing job, processing job steps, and audit logs.
- Processing is simulated through safe Phase 2 states only; no AI interpretation runs.

Before real private beta users, replace this scaffold with:

- PostgreSQL migrations for report files, lab reports, processing jobs, processing job steps, and audit logs.
- S3-compatible private object storage.
- A real queue-backed worker.
- Malware scanning before processing.

## Phase 3A Document Extraction Note

Phase 3A adds the document extraction foundation without medical interpretation:

- `apps/web/src/lib/reports/parser.ts` defines a `DocumentParser` interface.
- The current `local_text_parser` extracts readable text/tables from local text-bearing fixtures.
- Marker should plug in behind the same parser interface when dependencies and worker deployment are ready.
- Image uploads or scanned/low-readable files move to `ocr_required` because real OCR is not configured yet.
- `apps/web/src/lib/reports/classification.ts` gates supported, limited-beta, and unsupported report types.
- Raw extracted text is available only in the authenticated admin reports view for operations.

No final biomarker extraction, medical explanation, doctor review, or payments run in Phase 3A.

## Phase 3B Biomarker And Safety Note

Phase 3B adds schema-first biomarker extraction and safe explanation draft plumbing:

- `apps/web/src/lib/reports/catalog.ts` seeds the v1 biomarker catalog and aliases.
- `apps/web/src/lib/reports/biomarkers.ts` validates the strict extraction schema and normalizes markers.
- `apps/web/src/lib/reports/safety.ts` validates safe explanation output and blocks unsafe medical language.
- Local development uses a schema-valid mock extractor from parsed text/tables.
- When `OPENAI_API_KEY` and a worker deployment are ready, OpenAI Structured Outputs should plug in before the same schema validator.
- Critical and low-confidence values create review flags.
- Unsupported reports do not receive AI-only insights.
- Generated explanation drafts include the required disclaimer and avoid diagnosis, prescription, medicine-change advice, emergency diagnosis, and supplement protocols.

Phase 3B still does not build doctor marketplace, prescriptions, supplement protocols, emergency diagnosis, lab booking, or payments.

## Phase 4 Report Result And Timeline Note

Phase 4 adds user-facing report surfaces:

- `/app/reports/[reportFileId]` shows processing status, source-linked marker groups, safe explanation draft status, review routing, reminders, and feedback.
- `/app/timeline` shows report history, repeated-marker trend charts, and scheduled retest reminders.
- `/api/reports/[reportFileId]`, `/api/timeline`, `/api/reminders`, and `/api/feedback` expose authenticated local scaffold APIs.
- Marker cards always preserve source value, unit, reference range, confidence, review status, and source text where available.
- Retest reminders are planning aids only, not diagnosis or treatment recommendations.

Phase 4 still does not build wearable timelines, ABDM/ABHA timelines, lab booking reminders, supplement protocols, or doctor marketplace behavior.
