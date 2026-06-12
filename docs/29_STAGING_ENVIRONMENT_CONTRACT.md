# Staging Environment Contract

This contract defines the minimum Lyf9 AI staging configuration required before live verification can run. Use synthetic data only. Do not commit secrets, real reports, real patient identifiers, or provider outputs that contain PHI.

## Required Mode

```txt
APP_ENV=staging
ENABLE_LOCAL_AUTH_FALLBACK=false
BETA_INVITE_REQUIRED=true
```

Live verification refuses `APP_ENV=production`. Mock providers must not be used in staging except for an explicitly documented fail-closed test.

## Supabase

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
```

Rules:

- `SUPABASE_SERVICE_ROLE_KEY` is server/worker only.
- `NEXT_PUBLIC_*` values must contain only public anon configuration.
- Migrations through `202606120001_schema_first_ai_layer.sql` must be applied before verification.

## App And Security

```txt
APP_BASE_URL=
NEXT_PUBLIC_APP_BASE_URL=
ADMIN_ALLOWLIST=
```

Rules:

- Staging must fail closed if Supabase or service-role env is missing.
- Local cookie fallback is not allowed in staging.
- All staging test users must use synthetic email prefixes such as `lyf9-staging-test+<timestamp>@example.com`.

## Storage And S3

```txt
STORAGE_PROVIDER=s3
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_REPORT_BUCKET=
S3_UPLOAD_URL_EXPIRY_SECONDS=900
S3_DOWNLOAD_URL_EXPIRY_SECONDS=300
MAX_REPORT_FILE_SIZE_BYTES=20971520
```

Rules:

- Bucket public access must be blocked.
- Object keys must not contain names, emails, phone numbers, or lab identifiers.
- Verification uses only synthetic files.

## Malware Scanner

```txt
MALWARE_SCANNER_PROVIDER=
MALWARE_SCANNER_MODE=
CLAMAV_ENDPOINT=
```

Equivalent scanner-specific env is acceptable if documented in `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md`.

If no real scanner exists, staging must return `scan_configuration_required`, block processing, and keep the release gate blocked.

## Workflow

```txt
WORKFLOW_PROVIDER=database
WORKER_ID=staging-worker
WORKER_CONCURRENCY=1
WORKER_LEASE_SECONDS=300
WORKER_MAX_ATTEMPTS=3
PROCESSING_VERSION=v1
LIVE_SUPABASE_WORKFLOW_JOB_ID=
```

`LIVE_SUPABASE_WORKFLOW_JOB_ID` is required only for the live workflow concurrency harness.

## Document Extraction

```txt
DOCUMENT_PARSER_PROVIDER=marker
MARKER_COMMAND=
MARKER_API_URL=
MARKER_TIMEOUT_SECONDS=120
MIN_EXTRACTED_TEXT_CHARS=500
```

At least one of `MARKER_COMMAND` or `MARKER_API_URL` must be configured for real Marker verification. Current code still treats live Marker execution as a contract until the runner is wired.

## OCR

```txt
OCR_PROVIDER=textract
AWS_TEXTRACT_REGION=ap-south-1
OCR_TIMEOUT_SECONDS=180
```

If Textract is not configured or the runner is not wired, OCR verification must fail closed and the release gate remains blocked.

## AI

```txt
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL_EXTRACTION=
OPENAI_MODEL_EXPLANATION=
OPENAI_MODEL_DOCTOR_SUMMARY=
OPENAI_TIMEOUT_SECONDS=120
```

Prompt/model versions:

```txt
BIOMARKER_EXTRACTION_PROMPT_VERSION=v1
PATIENT_EXPLANATION_PROMPT_VERSION=v1
DOCTOR_SUMMARY_PROMPT_VERSION=v1
SAFETY_RULES_VERSION=v1
RUN_LIVE_OPENAI_EVAL=true
```

Rules:

- Live eval is opt-in only.
- Only synthetic extracted text may be sent.
- Unsupported reports must be blocked before OpenAI.

## Observability

```txt
SENTRY_DSN=
POSTHOG_KEY=
POSTHOG_HOST=
```

Observability must be configured with PHI scrubbing before real user testing.

## Optional Payment Sandbox

```txt
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

Payment remains sandbox/optional for staging verification and must not be used as a reason to mark PHI beta ready.

## Verification Commands

```bash
npm run verify:staging
npm run verify:staging:supabase
npm run verify:staging:rls
npm run verify:staging:workflow
npm run verify:staging:s3
npm run verify:staging:malware
npm run verify:staging:marker
npm run verify:staging:textract
npm run verify:staging:openai
npm run verify:staging:e2e
npm run eval:golden:live
```

Artifacts are written to:

```txt
artifacts/staging-verification/
```

Expected files:

```txt
latest.json
latest.md
supabase.json
rls.json
workflow.json
s3.json
malware.json
marker.json
textract.json
openai.json
e2e.json
golden-live.json
```

Any missing env, contract-only provider, failed live check, or production-mode attempt keeps the release gate at no-go.
