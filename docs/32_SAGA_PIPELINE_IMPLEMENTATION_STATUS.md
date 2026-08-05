# 32 — Saga Pipeline Implementation Status & Timeline

*Date: 2026-07-08 | For: TL review | Author: Darshil*

---

## 1. What Was Asked

Move report processing from "scaffold with mock providers" to a real, TL-approved
**Saga orchestration pattern** (Inngest), and wire the three biggest blockers
called out in the backend audit:

1. Supabase workflow step-runner (was throwing `not_configured` on every call)
2. Python worker execution gap (orchestration lived nowhere real)
3. OpenAI Structured Outputs (was deliberately failing closed, never called)

---

## 2. What Is Done (shipped, typechecked, build-green, tests passing)

### 2.1 Saga Orchestrator (Inngest)

Replaced the "worker polls a queue" model with a **durable saga function**.
Each processing step is a checkpoint — if the server crashes mid-report, Inngest
resumes from the last completed step instead of restarting the whole pipeline.

**Files:**
- `apps/web/src/inngest/client.ts` — Inngest client
- `apps/web/src/inngest/process-report.ts` — the saga itself, one function driving all 6 steps
- `apps/web/src/inngest/compensations.ts` — undo logic if a later step fails
- `apps/web/src/inngest/pipeline-writers.ts` — all Supabase reads/writes the saga needs
- `apps/web/src/app/api/inngest/route.ts` — webhook Inngest calls into

**How it triggers:** `apps/web/src/app/api/reports/[reportFileId]/upload-complete/route.ts`
fires `report/confirmed` after a file finishes uploading (Supabase mode only —
local mock mode still runs synchronously like before, unchanged).

### 2.2 Supabase Step-Runner (was the #1 blocker)

The workflow provider could **claim** a job atomically but had no way to record
step progress — every step method threw `supabase_workflow_step_runner_not_configured`.

**File:** `apps/web/src/lib/workflow/supabase-step-runner.ts` (new)

Implements all six methods for real: start a step, mark it succeeded, mark it
failed, schedule a retry, block the job, complete the job. Every transition
writes an audit log row. Wired into `workflow-provider.ts` so both Supabase
mode and local mock mode work through the same interface.

### 2.3 OpenAI Structured Outputs (was the #2 blocker)

**File:** `apps/web/src/lib/ai/openai-structured-provider.ts` (rewritten)

Previously this threw `openai_structured_outputs_runner_not_wired` no matter what.
Now it makes real HTTP calls to OpenAI's `chat.completions` endpoint using
**strict JSON schema mode** — the model is structurally forced to return data
matching our schema, it cannot return free-form text.

New supporting files:
- `apps/web/src/lib/ai/openai-json-schemas.ts` — the three strict schemas (extraction, patient explanation, doctor summary)
- `apps/web/src/lib/ai/openai-prompts.ts` — system prompts with medical safety rules baked in (no diagnosis language, no prescriptions, mandatory doctor-review phrasing)

**Fail-closed behavior preserved**: if `OPENAI_API_KEY` or the model env vars
aren't set, it throws the same configuration error as before. Nothing runs
without explicit configuration — this was a deliberate safety property and
it's unchanged.

### 2.4 The Saga Now Drives the Real Pipeline (not stubs)

Earlier version of the saga had placeholder steps. Now every step calls real
production code that already existed in the codebase but was never connected
end-to-end:

| Step | What it does |
|---|---|
| 1. Malware scan | Calls the configured scanner provider, blocks the job if scan doesn't pass |
| 2. Document extraction | Calls Marker provider, falls back to OCR provider if text is too short or low-confidence |
| 3. Classification | Deterministic keyword classifier — blocks unsupported/unknown reports **before** spending money on AI |
| 4. AI biomarker extraction | Real OpenAI call → normalizes against the biomarker catalog → validates → writes to `biomarker_results` |
| 5. Patient explanation | Real OpenAI call → runs the deterministic unsafe-language filter |
| 6. Routing & publish | Critical values or low-confidence markers → doctor review queue; unsafe AI output → admin review queue; otherwise → published |

Every step writes to `processing_job_steps`, `model_runs`, and `audit_logs` —
full traceability of what happened, when, with what model, at what cost.

**If any step fails**, the saga runs compensations in reverse order (deletes
partial `extracted_documents`, `biomarker_results`, `health_insights` rows),
marks the job `blocked`, and the report status becomes `failed` — no orphaned
half-written data.

### 2.5 Verification

- `npm run typecheck` — clean, 0 errors
- `npm run build:web` — compiles successfully
- `npm run test` — 89 passed, 2 skipped (unchanged from before — the 2 skips are pre-existing live-environment tests that need real staging credentials)

---

## 3. What This Does NOT Fix Yet — and Why

These are **not code problems**. The code paths exist and fail safely
(they block processing rather than silently doing the wrong thing). They're
blocked on accounts, credentials, or an environment nobody has provisioned yet.

| Item | Blocked on | Who needs to act |
|---|---|---|
| Real malware scanning | ClamAV instance or SaaS scanner API key | Whoever owns infra/security budget |
| Real document extraction | Marker API key + AWS Textract credentials | Whoever owns the AWS account / Marker subscription |
| Live staging verification | A real staging Supabase project with migrations actually applied | Whoever has Supabase org access |
| S3 / IAM | A real private S3 bucket + IAM role | Whoever owns the AWS account |
| Timeline / reminders / payments | Still reading/writing local files instead of Supabase | This one **is** a code task — see Phase 4 below |
| CI, PHI-safe observability, clinician sign-off | Org-level process decisions | TL / clinical lead / legal |

---

## 4. Timeline

This is scoped from **today (2026-07-08)** assuming credentials/environments
in section 3 become available on the dates noted. Estimates are engineer-days
of focused work, not calendar days — calendar time depends on how fast
credentials show up.

### Phase 1 — Done ✅
Saga orchestration, Supabase step-runner, OpenAI wiring, real pipeline steps connected.
**0 days remaining — shipped today.**

### Phase 2 — Live provider wiring (2–3 days, blocked on credentials)
Once malware scanner + Marker + Textract credentials exist:
- Point `MALWARE_SCANNER_PROVIDER`, `DOCUMENT_PARSER_PROVIDER`, `OCR_PROVIDER` env vars at real providers
- Run 5–10 real (anonymised) lab reports through the full pipeline
- Fix any real-world parsing edge cases the mock fixtures didn't cover

**Cannot start until:** malware scanner + Marker + Textract accounts exist.

### Phase 3 — Staging verification (2–3 days, blocked on staging access)
- Apply all 7 migrations against a real staging Supabase project
- Verify RLS policies actually isolate user data (not just unit-tested locally)
- Verify S3/IAM upload flow end-to-end with real signed URLs
- Run the golden dataset against the live pipeline, compare to local mock results

**Cannot start until:** staging Supabase project + S3 bucket provisioned.

### Phase 4 — Remaining local-persistence cleanup (3–4 days, no external blockers)
- Move timeline queries off local store onto Supabase
- Move reminders onto Supabase
- Move payments/data-rights request persistence onto Supabase
- This is pure code work — **can start anytime, doesn't wait on anyone**

### Phase 5 — Production readiness gate (timeline depends on org, not engineering)
- CI pipeline setup
- PHI-safe observability/logging (no raw biomarker values in logs)
- Clinician threshold sign-off on the deterministic critical-value rules
- Legal review of the AI safety language

**This phase is owned by TL + clinical lead + legal, not by engineering alone.**

---

## 5. Bottom Line for the TL Conversation

> "The three biggest code blockers from the audit — Supabase step-runner,
> the missing worker execution path, and the unwired OpenAI integration —
> are done today. Saga pattern is in, typechecked, and tests pass.
>
> What's left to reach real-PHI readiness is mostly **not more code** —
> it's getting credentials for a malware scanner, Marker, Textract, and a
> staging Supabase/S3 environment. Once those exist, wiring them in is
> 2–3 days. There's also 3–4 days of code work left (timeline/reminders/
> payments still use local files) that can start immediately, no blockers.
>
> The last mile — CI, PHI-safe logging, clinician sign-off, legal review —
> isn't an engineering timeline, it's an org decision timeline."

---

*Related: `docs/31_PDF_UPLOAD_PROCESSING_PRD.md` (architecture), `docs/19_PRIVATE_BETA_GAP_ANALYSIS.md` (original gap list this closes part of).*
