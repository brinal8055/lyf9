# Live Staging Verification Plan

## Status

Current status: **harness added, live checks not run**.

This plan must be executed with synthetic fixtures first. Do not use real PHI until every P0 live check passes and the release gate is updated.

Environment contract: `docs/29_STAGING_ENVIRONMENT_CONTRACT.md`.

Latest live report: `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md`.

## Required Environment

```txt
APP_ENV=staging
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
STORAGE_PROVIDER=s3
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_REPORT_BUCKET=
MALWARE_SCANNER_PROVIDER=<real-provider>
DOCUMENT_PARSER_PROVIDER=marker
MARKER_COMMAND= or MARKER_API_URL=
OCR_PROVIDER=textract
AWS_TEXTRACT_REGION=ap-south-1
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL_EXTRACTION=
OPENAI_MODEL_EXPLANATION=
OPENAI_MODEL_DOCTOR_SUMMARY=
```

Do not place secrets in `NEXT_PUBLIC_*`.

## Command Orchestrator

All commands refuse `APP_ENV=production`, require `APP_ENV=staging`, use synthetic-only checks, and write artifacts under `artifacts/staging-verification/`.

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

`npm run verify:staging` runs every section. Individual section commands are safer while bringing up one provider at a time.

## Supabase/RLS

Command:

```bash
npm run verify:staging:rls
```

Required checks:

- User can read only own profile, reports, jobs, biomarkers, and insights.
- Doctor can read only assigned report context.
- Admin/superadmin access is server-verified.
- Service-role writes are server-only and audited.

Pass condition: all live RLS tests pass against staging JWTs.

## Workflow Concurrency

Command:

```bash
npm run verify:staging:workflow
```

Required checks:

- Atomic claim RPC claims one job once.
- A second worker cannot claim the same unexpired lock.
- Expired locks retry or fail according to max attempts.
- Audit rows are written.

Pass condition: no duplicate job processing in concurrent staging workers.

## S3 Smoke Test

Command:

```bash
npm run verify:staging:s3
```

Use only synthetic files.

Steps:

1. Configure private bucket with public access blocked.
2. Run upload-init for a synthetic PDF fixture.
3. Upload through the signed URL.
4. Run upload-complete.
5. Request signed download URL as owner.
6. Verify unauthorized user cannot mint a download URL.
7. Delete the report file.
8. Confirm object delete or configured retention behavior.
9. Confirm audit events for upload, download request/generated/denied, and delete.

Pass condition: no public URL path exists and every raw report access is audited.

## Malware Scanner

Command:

```bash
npm run verify:staging:malware
```

Use synthetic clean and scanner-test files only.

Required checks:

- Clean synthetic fixture returns `scan_passed`.
- Scanner-blocked synthetic pattern returns `scan_failed` if provider supports it.
- `scan_pending`, `scan_failed`, and `scan_configuration_required` do not advance to extraction.

Pass condition: extraction starts only after a passed real scan.

## Marker

Command:

```bash
npm run verify:staging:marker
```

Use synthetic digital PDFs derived from `tests/golden/reports`.

Required checks:

- Marker parses text and tables.
- `extracted_documents` row contains provider/version/status/page metadata.
- Audit metadata does not include full extracted text.

Pass condition: supported digital PDF fixtures produce expected extracted text/tables.

## Textract OCR

Command:

```bash
npm run verify:staging:textract
```

Use synthetic scanned/image fixtures only.

Required checks:

- OCR fallback runs only after low-text/scan-required extraction state.
- OCR result persists with `ocr_provider`.
- OCR failures block safely.

Pass condition: scanned synthetic fixture produces expected text and advances to classification.

## OpenAI Structured Outputs

Default local command:

```bash
npm run eval:golden
```

Optional live command:

```bash
npm run verify:staging:openai
```

Current implementation note: live OpenAI execution is contract-only in this repo pass. If configured, the live eval must be updated to call the production provider and compare schema-valid outputs before any real PHI beta.

Pass condition:

- All model outputs validate against strict schemas.
- `model_runs` are written with hashes, prompt versions, provider, status, latency, and safe error fields.
- Safety filter blocks unsafe outputs.
- Unsupported reports do not receive AI-only interpretation.

## Golden Dataset

Command:

```bash
npm run eval:golden
npm run eval:golden:live
```

Artifacts:

- `tests/golden/golden-eval-results.json`
- `docs/26_GOLDEN_DATASET_EVALUATION_REPORT.md`

Pass condition:

- Supported classification accuracy >= 95%.
- Unsupported report block accuracy = 100%.
- Biomarker recall >= 95%.
- Biomarker precision >= 97%.
- Value/unit accuracy >= 97%.
- Safety block and disclaimer metrics = 100%.

## Final Rule

Lyf9 AI remains **not ready for real PHI private beta** until this plan is completed and documented with passing evidence.
