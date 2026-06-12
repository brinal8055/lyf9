# AI Structured Outputs And Model Runs

## Status

AI is represented by schema-first local extraction/explanation and provider contracts:

- `apps/web/src/lib/reports/biomarkers.ts`
- `apps/web/src/lib/reports/safety.ts`
- `apps/web/src/lib/reports/providers/ai.ts`
- `apps/worker/app/providers/ai.py`

## AiProvider Contract

- `extract_biomarkers(extracted_document, patient_context)`
- `generate_patient_explanation(biomarkers, patient_context)`
- `generate_doctor_summary(biomarkers, patient_context, insight)`
- `run_safety_check(output)`

## Production Provider

`OpenAiStructuredOutputsProvider` should use OpenAI Structured Outputs and Pydantic validation in the worker. Invalid schema output must not publish.

## Local Provider

`MockAiProvider` or deterministic fixture extraction remains available for tests and local development.

## Safety Rules

- Never pass unnecessary PHI to AI.
- Prefer extracted text/tables over raw PDF.
- Remove phone/address/email/lab IDs where not needed.
- Store `model_runs` for every AI call.
- Do not publish if output schema validation or safety validation fails.

## Model Runs

Required fields:

- `user_id`
- `report_id`
- `task_type`
- `provider`
- `model_name`
- `prompt_version`
- `input_hash`
- `output_hash`
- `output_json`
- `token_count`
- `cost_estimate`
- `latency_ms`
- `status`
- `error_message`
- `created_at`

## 2026-06-12 Implementation Update

Implemented in code:

- `apps/web/src/lib/ai/ai-provider.ts` defines the schema-first `AiProvider`.
- `apps/web/src/lib/ai/openai-structured-provider.ts` is an OpenAI Structured Outputs-ready contract and fails closed when config is missing.
- `apps/web/src/lib/ai/mock-ai-provider.ts` provides deterministic local/test outputs only.
- `apps/web/src/lib/ai/ai-schemas.ts` validates biomarker extraction, patient explanation, doctor summary, and safety result shapes.
- `apps/web/src/lib/ai/model-runs.ts` hashes AI inputs/outputs and creates PHI-minimized model run records.

Environment:

- Local/test: `AI_PROVIDER=mock`.
- Staging/production: `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and model env vars must be configured.
- Mock AI is blocked outside local/development/test unless explicitly overridden for targeted tests.

Current limitation:

- The OpenAI provider does not yet execute live API calls in this repo pass. In staging/production, missing OpenAI config blocks the workflow with `ai_configuration_required`.
- Golden dataset QA and prompt review remain required before real PHI beta.
