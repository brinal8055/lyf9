# Document Extraction Providers

## Status

Lyf9 AI now has a document extraction foundation in code. The durable workflow can run `extract_document`, `ocr_fallback`, and `classify_report` after `malware_scan` passes. Real PHI beta remains blocked until Marker and OCR are configured and verified in staging.

Document extraction does not itself generate AI interpretation. Supported reports now advance into the schema-first AI workflow after classification.

## Provider Architecture

Implementation location:

- `apps/web/src/lib/document-extraction/`

Provider contracts:

- `DocumentParserProvider.parseDocument(...)`
- `OcrProvider.extractText(...)`
- `classifyExtractedReport(...)`

Providers:

- `MarkerProvider`: Marker-ready production parser contract. It fails closed when `MARKER_COMMAND` or `MARKER_API_URL` is missing.
- `MockFixtureDocumentParser`: local/test fixtures only.
- `TextractOcrProvider`: AWS Textract-ready OCR contract. It fails closed when Textract is not configured.
- `MockOcrProvider`: local/test fixtures only.

## Environment Variables

```txt
DOCUMENT_PARSER_PROVIDER=marker
MARKER_COMMAND=
MARKER_API_URL=
MARKER_TIMEOUT_SECONDS=120
MIN_EXTRACTED_TEXT_CHARS=500

OCR_PROVIDER=textract
AWS_TEXTRACT_REGION=ap-south-1
OCR_TIMEOUT_SECONDS=180
```

Local/test may use:

```txt
DOCUMENT_PARSER_PROVIDER=mock
OCR_PROVIDER=mock
```

Mock providers are blocked outside local/development/test unless an explicit deployed-env override is set for a controlled test.

## Extracted Documents

Migration:

- `supabase/migrations/202606060006_document_extraction_foundation.sql`

The existing `extracted_documents` table is extended with:

- `user_id`
- `parser_provider`
- `ocr_provider`
- `error_code`
- `updated_at`

Indexes exist for user, report file, lab report, status, and extraction version. RLS remains owner/admin scoped because extracted text can contain PHI.

## Workflow Steps

`extract_document`:

1. Requires uploaded report state.
2. Requires `scan_status=scan_passed`.
3. Calls `DocumentParserProvider`.
4. Persists extracted text/tables/status.
5. Advances to `classify_report` on success.
6. Advances to `ocr_fallback` when text confidence is low or OCR is required.
7. Blocks on parser failure/configuration errors.

`ocr_fallback`:

1. Calls `OcrProvider`.
2. Persists OCR output.
3. Advances to `classify_report` on success.
4. Blocks on OCR failure/configuration errors.

`classify_report`:

1. Loads the latest extracted text.
2. Runs deterministic keyword/panel matching.
3. Updates `lab_reports.report_type`, supported panels, confidence, and status.
4. Unsupported/unknown reports are blocked safely and do not proceed to AI.
5. Supported reports advance to the schema-first `extract_biomarkers` workflow step.

## Supported Report Types

Supported:

- CBC
- lipid profile
- thyroid profile
- liver function test
- kidney function test
- HbA1c/glucose
- Vitamin D/B12/ferritin
- full-body checkup made of supported panels

Limited beta:

- basic urine routine

Unsupported examples:

- radiology, X-ray, CT, MRI, ultrasound
- ECG, EEG, cardiac waveform
- biopsy/histopathology
- pregnancy/fetal reports
- pediatric reports
- standalone cancer markers
- infectious disease treatment guidance
- emergency diagnosis
- prescription interpretation or medicine change advice

Unsupported user copy:

> This report type is not supported for automated interpretation yet. You can still store it in your Lyf9 AI health timeline, but Lyf9 AI will not generate AI-only medical insights for it. Please consult a qualified doctor for interpretation.

## Audit Events

PHI-minimal events are written for:

- `document_extraction_started`
- `document_extraction_completed`
- `document_extraction_failed`
- `document_extraction_ocr_required`
- `ocr_extraction_started`
- `ocr_extraction_completed`
- `ocr_extraction_failed`
- `ocr_configuration_required`
- `report_classification_started`
- `report_classification_completed`
- `report_classification_unsupported`
- `report_classification_unknown`

Audit metadata includes provider/status/page/table/confidence summaries, not full extracted text.

## Testing

Local verification:

```bash
npm run typecheck
npm run lint
npm test
```

Staging verification still required:

1. Apply migrations through `202606060006_document_extraction_foundation.sql`.
2. Configure `DOCUMENT_PARSER_PROVIDER=marker` and either `MARKER_COMMAND` or `MARKER_API_URL`.
3. Configure `OCR_PROVIDER=textract` and AWS Textract permissions.
4. Upload digital PDF, scanned/image report, unsupported report, and unknown report fixtures.
5. Verify extracted rows, audit rows, unsupported blocking, and future `extract_biomarkers` block.

## Current Limitations

- Marker execution is a configured contract, not live-verified.
- Textract execution is a configured contract, not live-verified.
- Supabase persistence for extracted documents needs staging verification.
- Admin UI shows parser output and queue counts, but dedicated retry controls remain a gap.
- Live OpenAI execution remains contract-only until staging verification; local/test schema-first AI is implemented.
