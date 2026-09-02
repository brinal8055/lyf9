# AI Structured Outputs And Model Runs

## Status

Lyf9 AI uses a provider-neutral clinical AI gateway. Gemini is the first selected staging adapter, while OpenAI and deterministic mock adapters implement the same contract. Report orchestration does not read provider-specific model variables or call a provider directly.

Production path:

```txt
Inngest report saga
  -> ClinicalAiGateway
     -> Lyf9 schemas, prompts, validation, source trace, safety, telemetry
     -> explicit provider registry
        -> GeminiStructuredOutputsProvider
        -> OpenAiStructuredOutputsProvider
        -> MockAiProvider (local/test only)
```

Core files:

- `apps/web/src/lib/ai/clinical-ai-gateway.ts`
- `apps/web/src/lib/ai/ai-provider.ts`
- `apps/web/src/lib/ai/clinical-ai-json-schemas.ts`
- `apps/web/src/lib/ai/clinical-ai-prompts.ts`
- `apps/web/src/lib/ai/gemini-structured-provider.ts`
- `apps/web/src/lib/ai/openai-structured-provider.ts`

## Boundary Rules

- `AI_PROVIDER` must be explicit in staging/production.
- Unknown providers fail closed; there is no automatic cross-provider fallback.
- Gemini/OpenAI credentials and transport details remain inside their adapters.
- The mock adapter is limited to local/development/test.
- Provider output is untrusted until the gateway validates it.
- Model-authored marker name, value display, status, disclaimer, and review routing cannot override persisted deterministic facts.
- Every patient marker explanation must reference a known persisted biomarker exactly once.
- Unsafe output remains review-only and cannot publish as AI-only.
- Unsupported/unknown reports stop before the gateway.

## Tasks

- `biomarker_extraction`
- `patient_explanation`
- `doctor_summary`

Configuration health is task-specific. The report pipeline is ready only when extraction and patient explanation are both configured. Doctor-summary readiness is reported separately.

## Model Runs

Every attempted production saga call records provider, model, task, prompt/schema version, input/output hashes, status, sanitized error code, and latency. Provider error bodies and patient context are not stored in error metadata. Token counts remain nullable until each adapter exposes normalized usage metadata.

## Environment

Local/test:

```txt
AI_PROVIDER=mock
```

Staging Gemini:

```txt
AI_PROVIDER=gemini
GEMINI_API_KEY=<server-only secret>
GEMINI_MODEL_EXTRACTION=gemini-2.5-flash
GEMINI_MODEL_EXPLANATION=gemini-2.5-flash
GEMINI_MODEL_DOCTOR_SUMMARY=gemini-2.5-flash
AI_REQUEST_TIMEOUT_SECONDS=120
```

Do not prefix provider credentials with `NEXT_PUBLIC_`.

## Verification

Local contract checks:

```bash
npm run typecheck
npm test
npm run test:ai-live
```

`test:ai-live` skips unless explicitly enabled. After staging secrets are configured, use synthetic report text only:

```bash
npm run verify:staging:ai
npm run eval:golden:live
```

Live Gemini and full supported-PDF saga evidence are still required before real PHI beta.
