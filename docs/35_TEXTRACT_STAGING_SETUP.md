# Textract Staging Setup

This runbook configures AWS Textract for synthetic Lyf9 AI staging verification. It does not authorize Production or real PHI.

## Provider Selection

Use the existing staging S3 bucket and region:

```txt
DOCUMENT_PARSER_PROVIDER=textract
OCR_PROVIDER=textract
AWS_TEXTRACT_REGION=ap-south-1
OCR_TIMEOUT_SECONDS=180
OCR_POLL_INTERVAL_MS=2000
OCR_MIN_TEXT_CHARS=40
OCR_MIN_MEAN_CONFIDENCE=0.85
OCR_MIN_LINE_CONFIDENCE=0.80
OCR_MAX_LOW_CONFIDENCE_LINE_RATIO=0.20
```

Marker remains optional. Textract is an explicit document parser selection, not a silent fallback or alias.
JPG, JPEG, and PNG uploads are explicitly scan-required and route directly to the configured OCR provider. OCR output below the configured text, mean-confidence, line-confidence, or low-confidence-line-ratio threshold is persisted for operator inspection and blocked from classification and AI.

## IAM

The staging application principal requires only these Textract actions:

```json
{
  "Sid": "ExtractSyntheticAndReportText",
  "Effect": "Allow",
  "Action": [
    "textract:StartDocumentTextDetection",
    "textract:GetDocumentTextDetection"
  ],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:RequestedRegion": "ap-south-1"
    }
  }
}
```

The asynchronous Textract APIs do not provide a report-object ARN for IAM resource scoping. The region condition plus the existing staging-only S3 `reports/*` access limits the private-beta principal. Do not add `textract:*`, IAM administration, other regions, or Production bucket access.

## Verification

From a shell with staging-only environment values:

```bash
npm run verify:staging:textract
```

The harness refuses Production mode, mismatched staging/Production buckets, non-staging bucket names, mismatched Supabase project references, other AWS regions, and non-Textract provider selections.

It creates one synthetic Auth user and uploads a readable CBC PNG plus a blank PNG under a staging-only `reports/textract-verification/` prefix. It verifies readable text, CBC classification, page/line confidence, text offsets, geometry, `ocr_provider`, ownership, blank-image failure, absence of AI output rows, and independent S3/database cleanup. Fixtures are synthetic and integrity-pinned by SHA-256 under `tests/fixtures/ocr/`.

## Failure Handling

| Failure | Meaning | Response |
| --- | --- | --- |
| `textract_access_denied` | IAM actions or staging object access are missing | Check only the scoped policy above and existing S3 read permission. |
| `textract_unsupported_document` | AWS rejected the file format/content | Route the report to manual review; do not send it to AI. |
| `textract_partial_success` | AWS could not completely process every page | Fail closed and route for retry/manual review; do not interpret partial text. |
| `textract_timeout` | The asynchronous job exceeded the configured deadline | Retry through the durable workflow; do not publish partial output. |
| `textract_no_text` | No readable lines were returned | Mark extraction failed/manual review required. |
| `textract_low_text_confidence` | Text was returned below the configured OCR quality gate | Persist provenance, block classification/AI, and route to manual review. |
| `textract_throttled` | AWS temporarily rejected the request due to service limits | Retry through the bounded durable workflow. |
| `ocr_configuration_required` | Required region, bucket, or AWS credential is absent | Fail closed and fix staging configuration. |

Never write extracted report text into audit logs or verification artifacts.
