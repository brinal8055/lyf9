# Inngest Staging Setup

This runbook configures the Lyf9 AI report-processing saga for the Vercel `dev` deployment. Use the Inngest staging environment and synthetic reports only. Do not change the Inngest Production environment or Vercel Production variables.

Current status: completed for synthetic staging on 2026-09-02. App `lyf9`, function `process-report`, and trigger `report/confirmed` are registered in the isolated Inngest Staging environment, and the guarded live saga verifier passes.

## Required Keys

In the Inngest dashboard, select or create a non-Production environment for Lyf9 AI staging and obtain:

```txt
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

The event key sends `report/confirmed`. The signing key authenticates calls to the deployed function endpoint. Treat both as server-only secrets. Do not prefix them with `NEXT_PUBLIC_`, commit them, paste them into tickets, or expose them in screenshots.

## Vercel Preview Configuration

Add both keys to the `lyf9-web` Vercel project with this exact scope:

- Environment: Preview only.
- Git branch: `dev` only.
- `INNGEST_DEV`: absent or empty.

Redeploy `dev`, then confirm:

```bash
curl -fsS https://lyf9-dev.vercel.app/api/health
curl -sS -o /dev/null -w '%{http_code}\n' https://lyf9-dev.vercel.app/api/inngest
```

The health response must report `inngestConfigured: true` and `status: ok`; an unsigned public GET to `/api/inngest` must return HTTP 401. Inngest uses the signing key for authorized synchronization and execution. Missing cloud keys make deployed health `degraded`, and upload initialization/completion return HTTP 503 before accepting a new report or changing completion state.

## Register The Function Endpoint

In the same non-Production Inngest environment, sync this exact app URL:

```txt
https://lyf9-dev.vercel.app/api/inngest
```

Confirm the registered app ID is `lyf9` and the function ID is `process-report`. Do not register `lyf9.ai`, a Production Vercel URL, localhost, or a Supabase URL.

The current account permits function concurrency up to `5`; `PROCESS_REPORT_CONCURRENCY_LIMIT` must remain at or below that value unless the plan and deployment contract are intentionally upgraded together.

## Synthetic Verification

From a shell with staging-only Supabase, AWS, S3, Textract, and GuardDuty values. The Inngest keys remain only in the deployed Vercel environment:

```bash
npm run verify:staging:inngest
```

The guarded harness:

1. Refuses Production runtime, bucket, Supabase, app origin, local Inngest mode, mock scanner, and mock parser targets.
2. Generates a synthetic radiology PDF containing no patient data.
3. Uploads it to private staging S3 and waits for GuardDuty `NO_THREATS_FOUND`.
4. Creates synthetic Supabase report/job metadata.
5. Sends `report/confirmed` through the staging event key.
6. Verifies the deployed saga records completed malware, Textract, and classification steps.
7. Verifies the report is marked unsupported before AI and that no model run, biomarker result, or health insight exists.
8. Deletes the S3 object and synthetic Auth user in `finally`.

The verification artifact must contain status/count evidence only, never event keys, signing keys, extracted text, or report content.

## Failure Handling

| Failure | Meaning | Response |
| --- | --- | --- |
| Unsigned `/api/inngest` returns 500 instead of 401 | Signing key is missing/invalid or the deployment has not picked up env | Check Preview `dev` scope and redeploy. |
| Sync reports a concurrency plan limit | Function concurrency exceeds the Inngest environment plan | Keep the code limit at or below the verified plan ceiling, redeploy, and retry sync. |
| Health reports `inngestConfigured: false` | One or both cloud keys are missing | Add both keys; do not use `INNGEST_DEV=1` in staging. |
| Event is accepted but no function runs | Endpoint is not synced to the same Inngest environment as the event key | Re-sync the exact staging URL in that environment. |
| Saga blocks at malware scan | GuardDuty result is unavailable or non-clean | Do not bypass; inspect the staging object tag and retry safely. |
| Saga blocks at extraction | Textract configuration or IAM is incomplete | Follow `docs/35_TEXTRACT_STAGING_SETUP.md`; do not send the report to AI. |
| Unsupported fixture reaches AI | Safety boundary regression | Stop uploads and treat as a release-blocking incident. |
