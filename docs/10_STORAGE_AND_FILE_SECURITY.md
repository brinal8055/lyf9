# Storage And File Security

## Status

Lyf9 AI now has a production-shaped private report file layer in code:

- `apps/web/src/lib/storage/storage-provider.ts`
- `apps/web/src/lib/storage/s3-storage-provider.ts`
- `apps/web/src/lib/storage/mock-storage-provider.ts`
- `apps/web/src/lib/malware/malware-scanner-provider.ts`
- `apps/web/src/lib/malware/mock-malware-scanner.ts`
- `apps/web/src/lib/malware/guardduty-s3-malware-scanner.ts`
- `apps/web/src/lib/malware/s3-event-scanner-stub.ts`

The web route handlers use the provider abstraction for signed upload URLs, signed download URLs, metadata checks, and deletion. Frontend code never receives AWS credentials or service-role secrets.

Private S3 upload/download/privacy/encryption/audit/delete behavior and GuardDuty clean/threat enforcement are live-verified with synthetic staging data. Real PHI private beta remains blocked by the remaining workflow, extraction, AI, observability, retention, clinical, and legal gates.

## StorageProvider Architecture

`StorageProvider` exposes:

- `createUploadUrl({ userId, reportFileId, filename, mimeType, sizeBytes, checksum })`
- `createDownloadUrl({ requesterUserId, reportFileId, storageKey, purpose })`
- `deleteFile({ storageKey })`
- `getMetadata({ storageKey })`
- `validateFileType(mimeType)`
- `validateFileSize(sizeBytes)`

Business logic uses this provider instead of calling S3 directly from route handlers.

## S3 Setup

Required env:

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

- Bucket must be private.
- Do not enable public object ACLs or public bucket policy access.
- Object keys use `reports/{userId}/{reportFileId}/{randomUuid}.{validatedExtension}`.
- Object keys must not include user email, name, or other direct identifiers.
- Store the real bucket name, opaque `storage_key`, provider, and metadata in Postgres.
- Never store or return public object URLs.
- Signed PUTs require the returned content type, checksum/report metadata, and `AES256` server-side-encryption headers.
- Live verification requires `S3_REPORT_BUCKET=STAGING_S3_BUCKET`, refuses production-named buckets, and refuses a bucket matching `PRODUCTION_S3_BUCKET`.

## Signed Upload Flow

1. User must be authenticated.
2. Backend verifies required consents: `lab_report_processing` and `ai_analysis`.
3. Backend validates filename, MIME type, size, and checksum.
4. Backend creates a `report_files` row with `upload_status=upload_pending` and `scan_status=scan_pending`.
5. Backend generates a signed upload URL through `StorageProvider`.
6. Backend audits `report_upload_init` and `signed_upload_url_generated`.
7. Client uploads to the returned URL.
8. Client calls upload-complete for S3 uploads.

Allowed MIME types:

- `application/pdf`
- `image/jpeg`
- `image/jpg`
- `image/png`

Rejected:

- executable files
- HTML
- SVG
- DOC/DOCX
- ZIP
- unknown MIME
- empty files
- files over `MAX_REPORT_FILE_SIZE_BYTES`

## Signed Download Flow

Raw report access is explicit and audited:

1. Client calls `POST /api/reports/{report_file_id}/download-url`.
2. Backend authorizes owner, assigned doctor, admin, or superadmin.
3. Deleted reports and cross-user access are denied.
4. Backend audits `raw_report_access_requested` or `raw_report_access_denied`.
5. Backend generates a short-lived signed download URL through `StorageProvider`.
6. Backend audits `signed_download_url_generated`.

## Malware Scanning

`MalwareScannerProvider` exposes:

```txt
scanFile({ reportFileId, storageKey, mimeType, filename? })
```

Statuses:

- `scan_pending`
- `scan_passed`
- `scan_failed`
- `scan_skipped_dev_only`
- `scan_configuration_required`

Local/test may use `MALWARE_SCANNER_PROVIDER=mock`. Staging and production use `MALWARE_SCANNER_PROVIDER=guardduty-s3` after GuardDuty Malware Protection for S3 is active for the private bucket. Production ignores the mock override and fails closed.

The GuardDuty provider reads the managed `GuardDutyMalwareScanStatus` object tag. Only `NO_THREATS_FOUND` passes. `THREATS_FOUND` fails, `UNSUPPORTED`/`ACCESS_DENIED` require manual/configuration handling, and missing/failed scans remain retryable. The app IAM principal needs `s3:GetObjectTagging` only for `reports/*`; GuardDuty uses its own dedicated service role.

Activation and verification are documented in `docs/34_GUARDDUTY_S3_MALWARE_SETUP.md`.

## Processing Gate

Processing must not move to extraction until malware scan passes.

- `scan_pending`: blocked.
- `scan_failed`: blocked.
- `scan_configuration_required`: blocked.
- `scan_passed`: may advance to classification/extraction.

The worker stub now advertises `malware_scan` as the first step. GuardDuty is the live staging scanner; durable worker concurrency still requires staging verification before real PHI beta.

## Delete Flow

`DELETE /api/reports/{report_file_id}`:

- owner can delete own report
- admin/superadmin can delete with audit
- marks `deleted_at`
- sets status/upload status to `deleted`
- calls `StorageProvider.deleteFile`
- writes `report_deleted`
- prevents future signed download URLs

Audit logs are never hard-deleted by this flow.

## Audit Events

Core file events:

- `report_upload_init`
- `report_upload_rejected_file_type`
- `report_upload_rejected_file_size`
- `signed_upload_url_generated`
- `report_upload_completed`
- `processing_job_created`
- `raw_report_access_requested`
- `raw_report_access_denied`
- `signed_download_url_generated`
- `malware_scan_started`
- `malware_scan_passed`
- `malware_scan_failed`
- `malware_scan_configuration_required`
- `report_deleted`

Audit metadata must stay PHI-minimal: IDs, MIME type, size, storage provider, status, and operational reason only.

## Current Limitations

- The synthetic app-level verifier passed through `npm run verify:staging:s3` against the staging-only bucket on 2026-09-02.
- Signed upload/download, public denial, `AES256` encryption, metadata, audit actions, delete, and cleanup passed; lifecycle/retention and key-management policy still require approval before PHI.
- GuardDuty Malware Protection is Active on the staging `reports/` prefix with managed tagging. The clean PDF and EICAR synthetic threat both passed expected tag/status checks through `npm run verify:staging:malware` on 2026-09-02, with cleanup.
- Durable queue is still a blocker.
