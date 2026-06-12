# Lyf9 AI Private Beta Runbook

This runbook is for a controlled 30-50 user private beta. It is not a public launch procedure.

## Onboard Users

1. Set beta access mode:

```txt
LYF9_BETA_ACCESS_MODE=invite_code
```

2. Add 30-50 invite records from `/admin/reports`.
3. Send each user their invite code manually.
4. Ask each user to complete:
   - signup
   - profile
   - questionnaire
   - required consent
5. Confirm upload is blocked until required consent is granted.
6. Ask users to upload only supported PDF/JPG/PNG lab reports.

## Explain Limitations

Use this framing with beta users:

- Lyf9 AI explains and organizes supported blood report markers.
- Lyf9 AI does not diagnose or prescribe.
- Doctor review is required for medical decisions.
- Unsupported reports can be stored in the timeline but do not receive AI-only interpretation.
- Private beta quality is measured through feedback, source traceability, and doctor/admin review.

## Handle Failed Reports

1. Open `/admin/reports`.
2. Check:
   - Safety queues
   - Processing jobs
   - Parser output
   - Audit logs
3. If extraction failed, inspect parser status without sharing raw PHI outside the admin workflow.
4. If the file is scanned and OCR is unavailable, mark it as requiring manual/OCR follow-up.
5. If the report type is unsupported, do not generate AI-only interpretation.
6. Ask the user for a clearer supported report only if needed.

## Handle Unsupported Reports

1. Confirm the report is marked `unsupported`.
2. Confirm no health insight was generated.
3. Show or send only the approved fallback copy.
4. Store the report in the timeline if consent and storage policy allow it.
5. Do not manually force unsupported report interpretation during beta.

Approved fallback copy:

```txt
This report type is not supported for automated interpretation yet. You can still store it in your Lyf9 AI health timeline, but Lyf9 AI will not generate AI-only medical insights for it. Please consult a qualified doctor for interpretation.
```

## Handle Unsafe Output

1. Do not publish output that contains diagnosis, prescription, medicine changes, unsupported interpretation, or certainty from one marker.
2. Route the report to admin or doctor review.
3. Keep the AI-only disclaimer visible.
4. If the output is critical or urgent, use cautious escalation language and recommend qualified medical care.
5. Record the issue through feedback or audit notes.

## Doctor Review Reports

1. Admin opens `/admin/reports`.
2. Assign a report needing review to a doctor account.
3. Doctor opens `/doctor/reviews`.
4. Doctor reviews:
   - patient identifier
   - original report link
   - extracted biomarkers
   - risk flags
   - AI draft
   - source values
5. Doctor chooses one action:
   - approve
   - edit and approve
   - reject
   - request more information
   - mark urgent
6. User sees a doctor-reviewed badge only after approval or edit-and-approve.

## Manually Correct Biomarkers

1. Open `/admin/reports`.
2. Find the low-confidence, failed, or manual-correction-needed report.
3. Compare the extracted marker against the source report.
4. Enter corrected values in correction fields only.
5. Do not overwrite original extracted values.
6. Record a correction reason.
7. Confirm an `admin_biomarker_corrected` audit log exists.

## Export Or Delete User Data

1. Confirm the requesting user identity through an approved support process.
2. Admin or superadmin opens the data rights action in `/admin/reports`.
3. For export, generate the internal JSON export and deliver it only through an approved secure process.
4. For deletion, confirm the scope and retain only records required by law or safety policy.
5. Confirm `data_export_completed` or `data_delete_completed` audit log exists.
6. Record the support ticket or operational note outside raw app logs.

## Collect Feedback

Collect feedback from:

- report result page
- dashboard
- doctor-reviewed report page

Admin review:

1. Open `/admin/reports`.
2. Check the Feedback section.
3. Tag issues manually outside the product if needed.
4. Prioritize:
   - confusing explanations
   - extraction mistakes
   - unsafe-language concerns
   - doctor review experience

## Pause Uploads

If upload quality, unsafe output, privacy, or storage issues appear:

1. Set beta access mode to a restrictive state:

```txt
LYF9_BETA_ACCESS_MODE=allowlist
LYF9_BETA_ALLOWLIST_EMAILS=<internal-admin-emails-only>
```

2. Remove active invite codes or stop issuing new ones.
3. If needed, disable upload UI at the deployment layer or temporarily restrict authenticated routes.
4. Notify active beta users manually.
5. Keep existing report files private.
6. Review audit logs before re-enabling uploads.

## Daily Operator Checklist

- Review failed extraction queue.
- Review unsupported report queue.
- Review low-confidence and critical queues.
- Review doctor review backlog.
- Review feedback.
- Review payment placeholder records.
- Review audit logs for raw report access.
- Confirm no public paid launch toggle is enabled.

## Go/No-Go Decision

Go only if:

- Required consent, upload, processing, unsupported fallback, AI-safe result, admin correction, doctor review, feedback, export/delete, and audit paths work in staging.
- 25 internal reports across at least 5 supported categories are processed and reviewed.
- There are zero known AI-only diagnosis or prescription outputs.
- Critical and low-confidence routing works.
- Legal owners accept private beta language and risk posture.

No-go if:

- RLS is untested.
- Raw reports can be accessed publicly.
- Malware scanning is not configured for real PHI.
- Doctor review identity/contract process is unresolved for doctor-reviewed output.
- Any unsafe output can publish without review.

## Emergency Escalation

If a user reports symptoms or an urgent value:

- Do not diagnose.
- Do not prescribe.
- Recommend contacting a qualified doctor or urgent care.
- Route the report for doctor/admin review.
- Log the operational action.
