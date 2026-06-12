# Live Staging Verification Artifact

Generated: 2026-06-12T16:18:58.011Z

Environment: staging

Synthetic data only: yes

Release verdict: **no_go**

| Section | Status | Checks passed |
| --- | --- | ---: |
| supabase | blocked | 0/1 |
| rls | blocked | 0/1 |
| workflow | blocked | 0/1 |
| s3 | blocked | 0/1 |
| malware | blocked | 0/1 |
| marker | blocked | 0/1 |
| textract | blocked | 0/1 |
| openai | blocked | 0/1 |
| e2e | blocked | 0/1 |
| golden-live | blocked | 0/1 |

## Blockers

- supabase: required_env_present - Missing required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
- rls: required_env_present - Missing required env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- workflow: required_env_present - Missing required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, LIVE_SUPABASE_WORKFLOW_JOB_ID
- s3: required_env_present - Missing required env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_REPORT_BUCKET
- malware: required_env_present - Missing required env: MALWARE_SCANNER_PROVIDER
- marker: required_env_present - Missing required env: DOCUMENT_PARSER_PROVIDER
- textract: required_env_present - Missing required env: OCR_PROVIDER, AWS_TEXTRACT_REGION
- openai: required_env_present - Missing required env: AI_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL_EXTRACTION, OPENAI_MODEL_EXPLANATION
- e2e: required_env_present - Missing required env: APP_BASE_URL, NEXT_PUBLIC_APP_BASE_URL
- golden-live: required_env_present - Missing required env: RUN_LIVE_OPENAI_EVAL, AI_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL_EXTRACTION
