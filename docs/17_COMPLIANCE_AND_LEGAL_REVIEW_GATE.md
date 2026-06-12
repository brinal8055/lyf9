# Compliance And Legal Review Gate

## Scope

This is a private beta gate for 30-50 users, not a public launch approval.

## DPDP Consent Requirements

- Purpose-wise consent is required.
- Required before upload:
  - `lab_report_processing`
  - `ai_analysis`
- Optional:
  - `doctor_review`
  - `reminders`
  - `marketing`
- Future consent types must remain inactive until reviewed:
  - lab partner sharing
  - pharmacy partner sharing
  - wearable data processing
  - genetics data processing
  - ABDM record fetch

Consent changes must be auditable and revocable.

## Telemedicine And Doctor Review

Legal review is required for:

- Doctor contracts.
- Doctor identity and credential display.
- Doctor-reviewed report language.
- Escalation language for urgent findings.
- Whether paid doctor-reviewed output triggers additional obligations.

## AI Disclaimer Review

Legal and medical reviewers must approve:

- Upload-page disclaimer.
- Report-result disclaimer.
- Unsupported report fallback.
- Doctor review CTA copy.
- Payment/pricing disclaimers.

## Public Paid Launch Gate

Do not enable real public paid launch until:

- DPDP consent and privacy review is complete.
- Terms, privacy policy, refund policy, and grievance process are approved.
- Doctor review contracts are complete.
- Payment flow is reviewed.
- Public claims review is complete.

## Exclusions

Pharmacy, supplement commerce, prescriptions, lab partner flows, mobile app, ABDM/ABHA, wearables, genetics, employer, and insurance workflows remain excluded.
