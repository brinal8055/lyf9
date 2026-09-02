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
```

Marker remains optional. Textract is an explicit document parser selection, not a silent fallback or alias.

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

It creates one synthetic Auth user, one generated CBC PDF under a staging-only `reports/textract-verification/` key, report metadata, and an `extracted_documents` row. It checks extracted text, confidence, page count, parser provenance, and user ownership. Cleanup deletes the S3 object and Auth user; cascading foreign keys delete the relational fixture.

## Failure Handling

| Failure | Meaning | Response |
| --- | --- | --- |
| `textract_access_denied` | IAM actions or staging object access are missing | Check only the scoped policy above and existing S3 read permission. |
| `textract_unsupported_document` | AWS rejected the file format/content | Route the report to manual review; do not send it to AI. |
| `textract_partial_success` | AWS could not completely process every page | Fail closed and route for retry/manual review; do not interpret partial text. |
| `textract_timeout` | The asynchronous job exceeded the configured deadline | Retry through the durable workflow; do not publish partial output. |
| `textract_no_text` | No readable lines were returned | Mark extraction failed/manual review required. |
| `ocr_configuration_required` | Required region, bucket, or AWS credential is absent | Fail closed and fix staging configuration. |

Never write extracted report text into audit logs or verification artifacts.
