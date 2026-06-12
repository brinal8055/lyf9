# lyf9.ai Phased Implementation Plan

## Operating Assumptions

- The repo is currently empty.
- Build a private beta MVP, not the long-term platform.
- Use lyf9.ai / Lyf9 AI for all user-facing brand language.
- Keep phases small and verifiable.
- Update `docs/PROGRESS.md` after each phase.
- Do not build mobile, wearables, ABDM/ABHA, genetics, pharmacy, supplement marketplace, full doctor marketplace, automated prescriptions, lab booking API, or insurance/employer workflows.

## Phase 0: Repo Setup + Design System

Objective:

Create the implementation foundation and source-of-truth docs.

Likely work:

- Create monorepo skeleton.
- Add web/API/worker directories.
- Add local development setup.
- Add design tokens from the Lyf9 AI design DNA.
- Add shared safety constants and copy guidelines.

Acceptance criteria:

- `docs/` execution pack exists.
- Proposed stack is documented.
- Repo has runnable local scaffolding.
- Design tokens are represented in the frontend config.
- No product features beyond scaffolding.

Verification:

- Repo file tree is clean.
- Local app boots to a placeholder page.
- Type checks pass if a stack is scaffolded.

## Phase 1: Landing + Auth + Profile + Consent

Objective:

Build the first user entry flow.

Features:

- Lyf9 AI landing page using design DNA.
- Signup/login.
- User dashboard shell.
- Health profile.
- Purpose-wise consent flow.
- Medical history, symptoms, lifestyle, and goals questionnaire.

Acceptance criteria:

- User can sign up and log in.
- User can complete basic health profile.
- User can grant/revoke required consents.
- User cannot upload a report without required consent.
- Landing copy uses Lyf9 AI only.
- Safety disclaimer appears before report-related flows.

Verification:

- Auth route tests or manual auth checks.
- Profile validation tests.
- Consent persistence tests.
- Responsive landing page screenshot checks.

## Phase 2: Report Upload + Storage + Processing Jobs

Objective:

Enable private file upload and explicit processing states.

Features:

- PDF/JPG/PNG upload.
- File validation and size limits.
- Private storage with signed upload/download URLs.
- `report_files`, `lab_reports`, and `processing_jobs`.
- Processing state machine.
- Unsupported report placeholder handling.
- Admin upload/job list.

Acceptance criteria:

- Uploaded files are private.
- Unsupported MIME types are blocked.
- Every upload creates a processing job.
- User sees upload, processing, failed, unsupported, and manual-review states.
- Admin can see uploaded files and job state.
- Audit logs are created for upload and report access.

Verification:

- Upload integration test.
- Private URL expiration/manual check.
- Processing state transition test.
- Audit log test.

## Phase 3A: Document Extraction Foundation

Objective:

Create a schema-first document extraction foundation before AI explanation exists.

Features:

- Report classifier.
- Supported vs unsupported report boundary.
- Text/table extraction abstraction.
- OCR fallback abstraction or placeholder.
- Extraction fixtures for supported report categories.
- `processing_job_steps`.
- `lab_reports.raw_extracted_text` and `raw_extracted_tables` persistence.
- Unsupported report fallback handling.
- Admin visibility into extraction state and failures.

Acceptance criteria:

- Supported and unsupported report classification is explicit.
- PDF/JPG/PNG files can move from upload to extracted-text or unsupported state.
- Unsupported reports do not receive AI-only interpretation.
- Extraction failures are visible to admin.
- Each worker step is recorded without raw PHI in logs or step summaries.

Verification:

- Classification tests for supported and unsupported report types.
- Text/table extraction fixture tests.
- Processing step persistence tests.
- Unsupported fallback copy test.

## Phase 3B: Biomarker Extraction + AI Explanation

Objective:

Create the safe AI-assisted interpretation pipeline for supported panels.

Features:

- Structured biomarker extraction schema.
- `biomarker_catalog` and `biomarker_aliases` v1.
- OpenAI Structured Outputs integration or schema-valid mock output if credentials are not configured.
- Biomarker normalization while preserving original source values.
- Confidence thresholds.
- Critical value routing with doctor-reviewed TODO thresholds.
- AI explanation schema.
- Unsafe language filter.
- `model_runs`, `biomarker_results`, and `health_insights`.

Acceptance criteria:

- Extraction output validates against schema.
- Invalid output does not publish.
- Source text/value/unit/range are stored for biomarkers.
- AI explanation does not contain diagnosis/prescription language.
- Low-confidence/critical values route to review.
- Model runs are logged with prompt and schema versions.

Verification:

- Schema validation tests.
- Biomarker catalog and alias tests.
- Fixture biomarker extraction tests.
- Unsafe language filter tests.
- Critical routing tests.
- Model run persistence tests.

## Phase 4: Report Result Page + Health Timeline

Objective:

Give users a clear, source-linked health explanation and report history.

Features:

- Report result page.
- Marker cards grouped by Critical, Needs Attention, Monitor, Normal.
- Source values, units, range, page/source text where available.
- AI-only vs doctor-reviewed labels.
- Unsupported sections display.
- Report history.
- Health timeline.
- Basic biomarker trend charts.
- Retest reminder creation.

Acceptance criteria:

- User can view explanation after processing.
- Every medical insight references source biomarkers where possible.
- Abnormal and normal markers are grouped clearly.
- Timeline shows report history.
- Retest reminder can be scheduled.
- Disclaimer is visible on result page.

Verification:

- Result page component tests.
- Timeline query tests.
- Reminder creation test.
- Responsive screenshots for result page.

## Phase 5: Admin Correction + Doctor Review V1

Objective:

Add controlled human review loops for safety and quality.

Features:

- Admin correction UI for biomarker extraction.
- Admin failed extraction queue.
- Doctor review assignment.
- Doctor dashboard.
- Doctor actions: approve, edit, reject, request more info.
- Doctor-reviewed publication state.
- Doctor notes and audit logs.

Acceptance criteria:

- Admin can correct biomarker values and source metadata.
- Corrections are marked and audited.
- Doctor sees assigned reports only.
- Doctor can approve/edit/reject/request more info.
- User sees doctor-reviewed badge only after completed review.
- Rejected reports are not published as doctor-reviewed.

Verification:

- RBAC tests for admin/doctor/user access.
- Correction audit test.
- Doctor action tests.
- Manual workflow test with one report.

## Phase 6: Payments + Feedback + Analytics

Objective:

Add beta commercial placeholders and learning instrumentation.

Features:

- Basic pricing/payment placeholder or Razorpay sandbox.
- Feedback collection.
- Analytics events.
- Email notifications.

Acceptance criteria:

- User can submit feedback from result page and dashboard.
- Admin can view feedback.
- Payment placeholder/sandbox records plan purchase intent.
- Key funnel events are tracked.
- Processing-complete and reminder notification placeholders exist.

Verification:

- Feedback persistence test.
- Payment state test.
- Analytics event smoke test.

## Phase 7: Private Beta Deployment Hardening

Objective:

Prepare for 30-50 user private beta launch.

Features:

- Consent history view.
- Internal data export/delete workflow.
- Support/admin beta operations checklist.
- Security and privacy hardening.
- Production/staging environment separation.
- PHI log-redaction review.
- Backups and restore check.
- Private beta go/no-go checklist review.

Acceptance criteria:

- Data deletion/export flow exists at least internally.
- Consent history is visible to the user or admin as appropriate.
- Audit logs cover upload, report access, AI/model runs, admin correction, doctor review, and export/delete.
- AI-only output does not diagnose or prescribe in reviewed samples.
- Unsupported reports are handled safely.
- Admin and doctor review loops work end to end.
- Legal review is identified as required before public paid launch.

Verification:

- Data deletion/export test.
- Audit log coverage test.
- Security/privacy checklist review.
- Private beta checklist completed.

## First Codex-Ready Build Order

1. Build Phase 0 scaffold.
2. Build Phase 1 landing/auth/profile/consent.
3. Build Phase 2 upload/storage/jobs.
4. Add Phase 3A document extraction foundation.
5. Add Phase 3B biomarker extraction with mock output before real AI.
6. Add real AI integration only after schema, tests, and safety filters are working.
7. Build result/timeline.
8. Build admin/doctor review.
9. Add payments, feedback, and analytics.
10. Harden deployment and complete private beta launch criteria.

## Phase Exit Rule

After each phase, update `docs/PROGRESS.md` with:

- Completed work.
- Changed files.
- Pending work.
- Known risks.
- Next Codex prompt.
