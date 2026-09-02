# Live Staging Verification Artifact

Generated: 2026-09-02T17:02:05.686Z

Environment: staging

Synthetic data only: yes

Release verdict: **no_go**

| Section | Status | Checks passed |
| --- | --- | ---: |
| golden-live | failed | 0/1 |

## Blockers

- golden-live: live_ai_golden_harness_passed - > @lyf9/web@0.1.0 eval:golden
> vitest run src/lib/evaluation/golden-eval.test.ts


 RUN  v2.1.9 [workspace]/apps/web

 ❯ src/lib/evaluation/golden-eval.test.ts (1 test | 1 failed) 109182ms
   × golden dataset evaluation > writes machine and human-readable golden evaluation reports 109181ms
     → ai_provider_quota_exhausted

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  22:30:14
   Duration  110.70s (transform 271ms, setup 0ms, collect 353ms, tests 109.18s, environment 1ms, prepare 342ms)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/evaluation/golden-eval.test.ts > golden dataset evaluation > writes machine and human-readable golden evaluation reports
AiGatewayError: ai_provider_quota_exhausted
 ❯ ClinicalAiGateway.invoke src/lib/ai/clinical-ai-gateway.ts:109:17
    107|         const retryInline = failure.code === "ai_provider_unavailable"…
    108|         if (!retryInline) {
    109|           throw new AiGatewayError(failure.code, metadata(), failure.r…
       |                 ^
    110|         }
    111|         await wait(providerRetryBaseMs() * (2 ** (attempt - 1)));
 ❯ ClinicalAiGateway.generatePatientExplanation src/lib/ai/clinical-ai-gateway.ts:68:20
 ❯ Module.runGoldenEvaluation src/lib/evaluation/golden-eval.ts:192:26
 ❯ src/lib/evaluation/golden-eval.test.ts:7:20

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

npm error Lifecycle script `eval:golden` failed with error:
npm error code 1
npm error path [workspace]/apps/web
npm error workspace @lyf9/web@0.1.0
npm error location [workspace]/apps/web
npm error command failed
npm error command sh -c vitest run src/lib/evaluation/golden-eval.test.ts
