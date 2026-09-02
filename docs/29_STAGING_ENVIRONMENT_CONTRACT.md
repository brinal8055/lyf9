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
- Migrations through `202609010002_consent_rpc_rls_guard.sql` must be applied before verification.
- `supabase/.temp/` is machine-local state and must never be committed or used as evidence of the target environment.
- Verify the project reference immediately before every migration. Staging is `wjjwdakfyigwwohbntyv`; production is a separate project.

## App And Security

```txt
APP_BASE_URL=
NEXT_PUBLIC_APP_BASE_URL=
ADMIN_ALLOWLIST=
```

Rules:

- Staging must fail closed if Supabase or service-role env is missing.
- Local cookie fallback is not allowed in staging.
- All staging test users must use synthetic addresses under the Lyf9 test pattern, such as `lyf9-staging-auth-<timestamp>@lyf9.ai`; Supabase rejects reserved `example.com` addresses.
- Configure custom SMTP or an approved Supabase Auth email quota before relying on signup email delivery for beta invitations.

## Storage And S3

```txt
STORAGE_PROVIDER=s3
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_REPORT_BUCKET=
STAGING_S3_BUCKET=
PRODUCTION_S3_BUCKET=
S3_UPLOAD_URL_EXPIRY_SECONDS=900
S3_DOWNLOAD_URL_EXPIRY_SECONDS=300
MAX_REPORT_FILE_SIZE_BYTES=20971520
```

Rules:

- Bucket public access must be blocked.
- Object keys must not contain names, emails, phone numbers, or lab identifiers.
- Verification uses only synthetic files.
- `S3_REPORT_BUCKET` must exactly equal `STAGING_S3_BUCKET`; `PRODUCTION_S3_BUCKET` is required and must be different.
- The staging bucket name must be staging-specific; the verifier refuses production-named buckets.

## Malware Scanner

```txt
MALWARE_SCANNER_PROVIDER=guardduty-s3
MALWARE_SCANNER_MODE=
MALWARE_SCAN_TIMEOUT_SECONDS=20
MALWARE_SCAN_POLL_INTERVAL_MS=2000
```

GuardDuty Malware Protection for S3 must be Active in `ap-south-1` for `S3_REPORT_BUCKET`, limited to `reports/`, with object tagging enabled. The application IAM principal needs `s3:GetObjectTagging` on the staging report prefix. Setup details are in `docs/34_GUARDDUTY_S3_MALWARE_SETUP.md`.

If no real scanner exists, staging must return `scan_configuration_required`, block processing, and keep the release gate blocked.

`MALWARE_SCANNER_PROVIDER=mock` is never acceptable for real PHI, and Production ignores the mock override. A missing GuardDuty result is retryable and must remain `scan_pending`; only `NO_THREATS_FOUND` may advance.

## Workflow

```txt
WORKFLOW_PROVIDER=database
WORKER_ID=staging-worker
WORKER_CONCURRENCY=1
WORKER_LEASE_SECONDS=300
WORKER_MAX_ATTEMPTS=3
PROCESSING_VERSION=v1
```

The live workflow harness is self-seeding and uses synthetic records only. It requires the staging Supabase URL, service-role key, and exact staging project reference already listed above; no anon key or persistent fixture job ID is required. The service key is used only by the test process, while an ordinary authenticated session verifies that worker RPC execution is denied.

## Inngest Saga

Vercel Preview branch `dev` only:

```txt
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
INNGEST_DEV=
```

Both keys are server-only. `INNGEST_DEV=1` is local-only and does not satisfy staging/production configuration. Sync `https://lyf9-dev.vercel.app/api/inngest` in the same non-Production Inngest environment as the event key. The local verifier calls the deployed authenticated upload flow and therefore does not require either Inngest key in the developer shell. Setup details are in `docs/36_INNGEST_STAGING_SETUP.md`.

## Document Extraction

```txt
DOCUMENT_PARSER_PROVIDER=textract
MARKER_COMMAND=
MARKER_API_URL=
MARKER_TIMEOUT_SECONDS=120
MIN_EXTRACTED_TEXT_CHARS=500
```

The controlled beta default is `textract`, which uses the same private S3 report object and is live-verified on a synthetic PDF. Marker remains an optional provider; when `DOCUMENT_PARSER_PROVIDER=marker`, at least one of `MARKER_COMMAND` or `MARKER_API_URL` must be configured and separately verified.

## OCR

```txt
OCR_PROVIDER=textract
AWS_TEXTRACT_REGION=ap-south-1
OCR_TIMEOUT_SECONDS=180
OCR_POLL_INTERVAL_MS=2000
```

The application IAM principal needs only `textract:StartDocumentTextDetection` and `textract:GetDocumentTextDetection` in `ap-south-1`, plus its existing private staging S3 access. Setup and verification are documented in `docs/35_TEXTRACT_STAGING_SETUP.md`. Missing configuration, access denial, unsupported documents, timeouts, and empty extraction fail closed.

## AI

```txt
AI_PROVIDER=gemini
AI_REQUEST_TIMEOUT_SECONDS=120
AI_PROVIDER_MAX_ATTEMPTS=3
AI_PROVIDER_RETRY_BASE_MS=1000
GEMINI_API_KEY=
GEMINI_MODEL_EXTRACTION=gemini-3.5-flash
GEMINI_MODEL_EXPLANATION=gemini-3.5-flash
GEMINI_MODEL_DOCTOR_SUMMARY=gemini-3.5-flash
```

Only transient 429/5xx provider failures are retried inline, with bounded exponential backoff. Configuration, authentication, model availability, exhausted quota, timeout, schema, source-trace, refusal, and safety failures remain fail-closed. Provider fallback is never automatic.

Prompt/model versions:

```txt
BIOMARKER_EXTRACTION_PROMPT_VERSION=v1
PATIENT_EXPLANATION_PROMPT_VERSION=v1
DOCTOR_SUMMARY_PROMPT_VERSION=v1
SAFETY_RULES_VERSION=v1
RUN_LIVE_STAGING_AI=true
RUN_LIVE_AI_EVAL=true
```

Rules:

- Live eval is opt-in only.
- Only synthetic extracted text may be sent.
- Unsupported reports must be blocked before the selected AI adapter.
- Do not configure automatic fallback between providers for private beta.

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
npm run verify:staging:auth
npm run verify:staging:workflow
npm run verify:staging:s3
npm run verify:staging:malware
npm run verify:staging:marker
npm run verify:staging:textract
npm run verify:staging:ai
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
auth.json
workflow.json
s3.json
malware.json
marker.json
textract.json
ai.json
e2e.json
golden-live.json
```

Any missing env, contract-only provider, failed live check, or production-mode attempt keeps the release gate at no-go.

The S3 verifier provisions one synthetic staging user, grants required consent, requests an app-signed upload URL, uploads a synthetic PDF, verifies metadata/encryption/private access, requests an app-signed download URL, deletes the object through the app, verifies audit events, and cleans up the Auth/Postgres/S3 fixture.
