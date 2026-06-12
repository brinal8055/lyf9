# Supabase Implementation Plan

## Status

Supabase is now represented as a production migration path, not a live dependency in local development.

- Migration: `supabase/migrations/202606060001_private_beta_core.sql`
- Frontend config helper: `apps/web/src/lib/auth/providers/supabase.ts`
- Required env examples: `apps/web/.env.example`, `apps/api/.env.example`, `apps/worker/.env.example`

## Required Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`

The anon key may be used by the frontend. The service-role key must exist only in API/worker/server environments.

## Auth Migration

1. Keep local cookie auth only for development scaffold testing.
2. Add Supabase Auth signup/login.
3. Validate Supabase JWTs in API and worker-facing privileged endpoints.
4. Use Supabase user ID as canonical `user_id`.
5. Store profile fields in `user_profiles` and health fields in `user_health_profiles`.
6. Store roles in `user_roles`; never trust client-provided role.

## Role Model

- `user`: own reports/profile/consent/results/reminders/feedback.
- `doctor`: assigned doctor reviews only.
- `admin`: operational queues, corrections, assignments, audit review.
- `superadmin`: role management and emergency operations.

Admin and doctor routes must check role on both frontend route guard and backend/API handler.

## Tables

The migration defines:

- `user_profiles`
- `user_roles`
- `user_health_profiles`
- `user_consents`
- `questionnaire_responses`
- `report_files`
- `lab_reports`
- `processing_jobs`
- `processing_job_steps`
- `extracted_documents`
- `biomarker_catalog`
- `biomarker_aliases`
- `biomarker_results`
- `health_insights`
- `health_risk_flags`
- `model_runs`
- `doctor_reviews`
- `doctor_review_comments`
- `audit_logs`
- `reminders`
- `payments`
- `feedback_events`
- `analytics_events`

## RLS Strategy

- Users can read/write only their own profile, consent, report, result, reminder, payment, and feedback records.
- Doctors can read only assigned `doctor_reviews` and linked review context through backend-controlled queries.
- Admins can read operational queues and audit logs.
- Superadmin can manage roles.
- Backend/worker may use service role only for controlled workflows and must audit sensitive access.

## Migration Steps

1. Create Supabase project near Indian users where possible.
2. Apply SQL migration.
3. Create first superadmin manually through Supabase dashboard or secure SQL.
4. Configure env vars in web/API/worker.
5. Replace local auth routes with Supabase Auth calls.
6. Move local report store repository behind Postgres repository implementation.
7. Keep the local repository as test/dev fixture only.

## Acceptance Gate

The app is not approved for real PHI until RLS policies are tested with user, doctor, admin, and superadmin JWTs.
