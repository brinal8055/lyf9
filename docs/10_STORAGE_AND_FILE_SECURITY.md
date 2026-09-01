# Storage And File Security

## Status

Lyf9 AI now has a production-shaped private report file layer in code:

- `apps/web/src/lib/storage/storage-provider.ts`
- `apps/web/src/lib/storage/s3-storage-provider.ts`
- `apps/web/src/lib/storage/mock-storage-provider.ts`
- `apps/web/src/lib/malware/malware-scanner-provider.ts`
- `apps/web/src/lib/malware/mock-malware-scanner.ts`
- `apps/web/src/lib/malware/s3-event-scanner-stub.ts`

The web route handlers use the provider abstraction for signed upload URLs, signed download URLs, metadata checks, and deletion. Frontend code never receives AWS credentials or service-role secrets.

Real PHI private beta is still blocked until a private S3 bucket and a real malware scanner are configured and verified in staging.

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

Local/test may use `MALWARE_SCANNER_PROVIDER=mock`. Staging may use the explicit mock override for synthetic-only integration work, but Production ignores that override and fails closed. If a real scanner is not configured, scan result remains `scan_configuration_required`, and processing does not advance to extraction.

`CLAMAV_ENDPOINT=http://localhost:8080` is local-only. A Vercel or hosted worker deployment needs a private network-reachable scanner endpoint and a defined request/response protocol.

## Processing Gate

Processing must not move to extraction until malware scan passes.

- `scan_pending`: blocked.
- `scan_failed`: blocked.
- `scan_configuration_required`: blocked.
- `scan_passed`: may advance to classification/extraction.

The worker stub now advertises `malware_scan` as the first step. A durable queue and real scanner are still required before real PHI beta.

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

- The synthetic app-level verifier exists at `npm run test:s3-live`; real staging credentials and a staging-only bucket are still required to run it.
- Real S3 bucket policy, lifecycle, and KMS decision are not yet verified.
- Real ClamAV or S3 event scanner is not wired.
- Durable queue is still a blocker.
- Live staging signed upload/download/delete and audit verification is implemented but not yet executed.
