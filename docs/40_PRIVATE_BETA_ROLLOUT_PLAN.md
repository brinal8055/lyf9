# Lyf9 AI Private Beta Rollout Plan

This plan controls a 30-50 user private beta. It is not approval for a public or paid launch.

## Release Gates

All gates must be green before a real user uploads PHI:

1. The exact `dev` commit is healthy on `https://lyf9-dev.vercel.app/api/health`.
2. `npm run verify:staging:e2e` passes with synthetic CBC data and cleanup.
3. Strict public invite signup passes without service-role fixture fallback, and a real test inbox receives the Supabase email.
4. Provider-backed golden evaluation passes configured thresholds with no unsafe output.
5. At least 25 internally reviewed reports across five supported categories meet extraction, source-trace, and safety requirements.
6. A qualified clinician signs off deterministic critical thresholds and review-routing copy.
7. Legal approves beta consent, privacy, disclaimer, support, deletion/retention, and doctor-review terms.
8. S3 retention/versioning and external error-monitoring policies are approved for PHI.

## Cohorts

| Wave | Users | Duration | Entry requirement | Exit requirement |
| --- | ---: | ---: | --- | --- |
| Internal rehearsal | 3-5 | 3 days | Synthetic or explicitly approved internal reports only | Zero P0/P1 failures; operators complete upload-pause, correction, review, export, and deletion drills. |
| Trusted alpha | 8-10 | 7 days | All release gates green; daily operator coverage | At least 90% successful supported-report completion, no cross-user access, no unsafe AI-only publication, all critical/review cases handled within agreed SLA. |
| Private beta wave 1 | 20-25 | 7 days | Alpha exit signed by Engineering, Medical, and Product | Stable processing/error rate, feedback triaged daily, doctor backlog within capacity. |
| Private beta wave 2 | 30-50 total | Ongoing | Wave 1 exit signed; no unresolved P0/P1 incident | Continue only while all go/no-go metrics remain green. |

## Rollout Metrics

- Signup email delivery success.
- Required-consent completion rate.
- Supported upload completion rate and median processing duration.
- Unsupported and unknown classification rate.
- Extraction confidence, correction rate, and source-trace completeness.
- AI safety-filter block rate and false-negative review findings.
- Critical and doctor-review queue age.
- Result-view, reminder, and feedback completion rates.
- Storage, Auth, workflow, provider, and application error counts.

Do not put report text, patient names, emails, symptoms, medicines, or raw provider payloads in analytics or logs.

## Stop Conditions

Set `REPORT_UPLOADS_ENABLED=false` immediately for any cross-user access, public object access, malware bypass, unsupported AI interpretation, unsafe AI-only medical action, missing critical routing, repeated provider corruption, or unexplained data loss.

Do not resume intake until the incident is understood, affected users and records are identified through approved procedures, regression evidence passes, and Engineering plus the relevant Security/Medical owner approve recovery.

## Deployment Sequence

1. Apply and verify additive migrations on staging.
2. Deploy `dev` and confirm health.
3. Run deterministic CI and the synthetic staging release gate.
4. Complete internal rehearsal and external approvals.
5. Promote the verified commit through the normal production branch process.
6. Start with 3-5 internal users; never jump directly to 30-50.

