# 33 — Beta Handoff Context

> 2026-09-01 update: sanitized `.env.example` files are now tracked, Supabase machine-local `.temp` link state is ignored, and the staging schema is populated through `202609010001_biomarker_catalog_rls.sql`. The Vercel `dev` branch is configured for the staging Supabase project only. Production was not changed during this reconciliation pass.

*Date: 2026-08-16 | Branch: `dev` | Purpose: continue beta work in a fresh session*

---

## 1. Where Things Stand

The core beta loop **works end to end on real Supabase data**: signup → login → onboarding → upload PDF → Inngest saga processes it → biomarkers + AI explanation stored → result page renders.

Stack changes made this cycle:
- **AI provider is Gemini** (`gemini-2.5-flash`), not OpenAI. OpenAI provider code still exists and works, switchable via `AI_PROVIDER` env var.
- **Processing is an Inngest saga**, not a Redis queue / Python worker. TL approved orchestration-pattern saga.
- **Everything is free during beta.** Payments gate nothing — sandbox only.

Verification state: typecheck clean, clean build passes, 89/91 tests pass (2 skipped are pre-existing live-env tests).

---

## 2. Critical Environment Setup

`apps/web/.env` — required for the app to run at all:

```env
INNGEST_DEV=1                          # REQUIRED locally, else /api/inngest 500s

NEXT_PUBLIC_SUPABASE_URL=https://mdxualgpuoqcmtaifaws.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # must appear ONCE (duplicate key broke auth)

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_REPORT_BUCKET=lyf9-reports-storage-prod
AWS_REGION=ap-south-1
AWS_TEXTRACT_REGION=ap-south-1

OCR_PROVIDER=textract
DOCUMENT_PARSER_PROVIDER=textract

AI_PROVIDER=gemini
GEMINI_API_KEY=                        # must be AIzaSy... format from aistudio.google.com/apikey
GEMINI_MODEL_EXTRACTION=gemini-2.5-flash
GEMINI_MODEL_EXPLANATION=gemini-2.5-flash
GEMINI_MODEL_DOCTOR_SUMMARY=gemini-2.5-flash

MALWARE_SCANNER_PROVIDER=mock
ALLOW_MOCK_MALWARE_SCAN_IN_DEPLOYED_ENV=true

BETA_DOCTOR_EMAIL=                     # doctor who receives all review assignments
PAYMENT_PROVIDER=sandbox
PAYMENTS_PUBLIC_LAUNCH_ENABLED=false
```

**To run locally — two terminals, both required:**
```bash
npx inngest-cli@latest dev    # terminal 1 — saga runner, dashboard at :8288
npm run dev:web               # terminal 2 — app at :3000
```

Next.js does NOT hot-reload `.env` changes into middleware/route handlers. Always restart after editing env.

> **Security note**: real `.env` files remain ignored. Tracked `.env.example` files contain placeholders only. Rotate any credentials that may previously have appeared in an example or local handoff file.

---

## 3. Architecture — Processing Saga

`apps/web/src/inngest/process-report.ts` is the orchestrator. Triggered by `report/confirmed` event from
`apps/web/src/app/api/reports/[reportFileId]/upload-complete/route.ts` (Supabase mode only — local mock mode still runs synchronously).

Steps, each a durable `step.run()` checkpoint:

1. **malware-scan** — provider call, blocks job if not passed
2. **extract-document** — Textract/Marker, OCR fallback on low confidence or short text
3. **classify-report** — deterministic keyword classifier, blocks unsupported reports **before** spending AI tokens
4. **extract-biomarkers** — Gemini structured output → normalize against catalog → validate → insert `biomarker_results`
5. **generate-explanation** — Gemini → deterministic unsafe-language filter
6. **route-and-publish** — routes to doctor review / admin review / published, inserts `health_insights`, auto-assigns doctor

On failure: compensations run in reverse (delete `extracted_documents`, `biomarker_results`, `health_insights`), job marked blocked, report status `failed`.

Supporting files:
- `apps/web/src/inngest/client.ts` — Inngest client
- `apps/web/src/inngest/compensations.ts` — per-step undo handlers
- `apps/web/src/inngest/pipeline-writers.ts` — all Supabase reads/writes the saga needs
- `apps/web/src/app/api/inngest/route.ts` — webhook Inngest calls into
- `apps/web/src/lib/workflow/supabase-step-runner.ts` — step lifecycle persistence

---

## 4. Bugs Fixed This Cycle (do not re-introduce)

| Bug | File | Cause |
|---|---|---|
| Infinite redirect after login | `app/app/layout.tsx` | Layout checked only legacy local-auth cookie, never the Supabase token. Had its own auth check separate from middleware. |
| "Invalid API key" on signup | `.env` | `SUPABASE_SERVICE_ROLE_KEY` declared twice; the second (placeholder) value won. |
| Inngest 404/500 spam | `.env` | Missing `INNGEST_DEV=1`. |
| All 7 migrations never applied | `202606060001_private_beta_core.sql` | `current_user_role()` referenced `public.user_roles` before that table was created. First statement failure aborted the whole transaction — nothing had ever run against Supabase. |
| Onboarding progress stuck at 0% | `app/app/page.tsx` | `completedTasks: 0` hardcoded, never queried real state. |
| Onboarding forms blank after refresh | 3 forms + 3 API routes | Save wrote to Supabase, but load read only from localStorage. No `GET` handlers existed. |
| Timeline/reminders empty | `lib/reports/repository.ts` | `listHealthTimeline` and `createRetestReminder` had no `shouldUseSupabaseAuth()` branch — always local JSON store. |
| Doctor queue always empty | `lib/reports/repository.ts` | All 4 doctor-review functions had no Supabase branch. |
| Payment double-complete | `lib/reports/repository.ts` | `completePayment` had no status guard — regenerated `providerPaymentId` and re-fired analytics/audit on every call. |
| "Request doctor review" button dead | `components/reports/report-detail.tsx` | Button had no `onClick` at all. Never implemented. |
| Login error always generic | `components/auth/auth-form.tsx` | Frontend read `body.error`, backend returns `{ errors: { email } }`. Real errors were swallowed. |

---

## 5. Doctor Review — How It Works Now

**No doctor signup flow exists.** Every signup hardcodes `role: "user"`. Promotion is manual:

1. Doctor signs up normally at `/signup` (needs both `auth.users` + `user_profiles` rows)
2. Run in Supabase SQL Editor:
   ```sql
   insert into public.user_roles (user_id, role, granted_by)
   select id, 'doctor', null
   from auth.users
   where email = 'doctor@example.com';
   ```
3. Set `BETA_DOCTOR_EMAIL` in `.env`, restart server
4. Doctor logs out and back in (role resolves at session read)
5. Queue is at `/doctor/reviews`

Two paths create a review:
- **Auto**: saga assigns when critical markers / low confidence / AI recommends it. Priority `urgent` if critical. Fail-soft — missing or unregistered doctor logs and leaves unassigned, never fails the report.
- **Manual**: user clicks "Request doctor review" on the report page → `POST /api/reports/[reportFileId]/request-doctor-review`

**Schema quirk to know**: `doctor_reviews.assigned_doctor_id` is a UUID FK to `auth.users`, but all app code keys by doctor email. Resolved via `user_profiles` email→UUID lookup on each call (no migration added). Side effect: `assignedDoctorEmail` on returned records holds the **UUID**, not an email, in Supabase mode. Check the doctor UI if it displays that field.

---

## 6. Payments

Free for beta. Payments gate nothing — no payment check exists on upload, processing, results, or doctor review.

Provider seam at `apps/web/src/lib/payments/`:
- `sandbox-payment-provider.ts` — current default, fake IDs, no network calls
- `razorpay-payment-provider.ts` — real Orders API + HMAC signature verification, **fail-closed**: throws unless `PAYMENTS_PUBLIC_LAUNCH_ENABLED=true` AND both keys set
- `index.ts` — selection gate. Sandbox is also refused in deployed envs unless explicitly overridden, so a deployed instance can't silently take fake payments.

`/app` dashboard shows a "free during beta" notice instead of ₹49/₹299 cards. Public `/pricing` page untouched.

Legal review is still required before enabling real payments — code can't enforce that.

---

## 7. What's Still Left

**Blocked on credentials/accounts, not code:**
- Real malware scanner (ClamAV or SaaS) — currently mock, fail-closed correctly
- Marker API key (Textract is live; Marker path is contract-only)
- Live staging verification of RLS policies (migrations now applied to `lyf9-prod`, never verified on `lyf9-staging`)
- S3/IAM behavior verification

**Code work, no blockers:**
- Data-rights request persistence still on local store
- Onboarding task cards always show "Start task" — no visual done state
- No doctor onboarding UI (manual SQL is the accepted beta approach)
- `scripts/copy-scan.mjs` crashes when `rg` is not installed — needs a `command -v rg` guard

**Org decisions, not engineering:**
- CI pipeline
- PHI-safe observability (no raw biomarker values in logs)
- Clinician sign-off on deterministic critical-value thresholds
- Legal review before public paid launch

---

## 8. Key File Map

```
apps/web/src/
  inngest/                      ← saga orchestration (process-report, compensations, pipeline-writers)
  lib/
    ai/                         ← gemini-structured-provider, openai-structured-provider, json-schemas, prompts
    payments/                   ← provider seam (sandbox + razorpay, fail-closed)
    workflow/                   ← supabase-step-runner, workflow-provider
    reports/repository.ts       ← main orchestration; branches on shouldUseSupabaseAuth()
    reports/supabase-repository.ts  ← all Supabase-backed reads/writes
    onboarding/server.ts        ← save + load profile/questionnaire/consent, task status
    auth/                       ← supabase-auth, request, roles, constants
  app/
    app/layout.tsx              ← auth guard (Supabase-aware)
    admin/layout.tsx            ← role guard (added this cycle)
    doctor/layout.tsx           ← role guard (added this cycle)
```

**Pattern to follow**: any repository function that touches data must branch on `shouldUseSupabaseAuth()` and delegate to a `*Supabase*` counterpart. Several bugs this cycle were functions missing that branch.

---

## 9. Testing the Full Loop

```bash
npx inngest-cli@latest dev     # terminal 1
npm run dev:web                # terminal 2
```

1. `/signup` → complete profile, questionnaire, consent (progress bar should hit 100%)
2. `/app/reports/new` → upload a real text-based lab PDF
3. Watch Inngest dashboard at `:8288` — steps light up in sequence
4. Verify in Supabase: `processing_jobs` completed, `extracted_documents` has text, `biomarker_results` has rows, `model_runs` shows `provider = gemini_structured_outputs`, `health_insights` has summary
5. `/app/reports/[id]` → marker cards + explanation
6. `/app/timeline` → report appears

Production and staging are separate Supabase projects. Staging (`wjjwdakfyigwwohbntyv`) now has the private-beta schema applied; do not point `dev` tooling or Vercel variables at production.

Supabase Auth email confirmation is **disabled** for beta testing (free tier rate-limits signup emails to ~2-4/hour). Re-enable before real users.

---

*Related: `docs/31_PDF_UPLOAD_PROCESSING_PRD.md` (architecture), `docs/32_SAGA_PIPELINE_IMPLEMENTATION_STATUS.md` (TL-facing timeline).*
