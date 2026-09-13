# Live Staging Verification Artifact

Generated: 2026-09-13T17:58:13.059Z

Environment: staging

Synthetic data only: yes

Release verdict: **no_go**

Verification scope: **selected_sections**

| Section | Status | Checks passed |
| --- | --- | ---: |
| e2e | failed | 0/1 |

## Blockers

- e2e: supported_report_launch_harness_passed - > @lyf9/web@0.1.0 test:launch-live
> vitest run src/inngest/staging-inngest-live.test.ts -t "supported CBC"


 RUN  v2.1.9 [workspace]/apps/web

 ❯ src/inngest/staging-inngest-live.test.ts (5 tests | 1 failed | 4 skipped) 286819ms
   × live staging Inngest saga > runs a supported CBC through result, correction, doctor review, reminder, and feedback 286818ms
     → Supported-report saga failed closed: processing_failed; diagnostics={"modelRuns":[{"error_code":null,"model_name":"gemini-3.5-flash","provider":"gemini_structured_outputs","status":"succeeded","task_type":"biomarker_extraction"},{"error_code":null,"model_name":"gemini-3.5-flash","provider":"gemini_structured_outputs","status":"succeeded","task_type":"biomarker_extraction"},{"error_code":null,"model_name":"gemini-3.5-flash","provider":"gemini_structured_outputs","status":"succeeded","task_type":"biomarker_extraction"},{"error_code":null,"model_name":"gemini-3.5-flash","provider":"gemini_structured_outputs","status":"succeeded","task_type":"biomarker_extraction"}],"steps":[{"error_code":null,"status":"completed","step_name":"malware_scan"},{"error_code":null,"status":"completed","step_name":"extract_document"},{"error_code":null,"status":"completed","step_name":"ocr_fallback"},{"error_code":null,"status":"completed","step_name":"classify_report"},{"error_code":null,"status":"completed","step_name":"extract_biomarkers"},{"error_code":null,"status":"completed","step_name":"normalize_biomarkers"}]}

 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  23:23:22
   Duration  290.90s (transform 413ms, setup 0ms, collect 931ms, tests 286.82s, environment 0ms, prepare 566ms)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/inngest/staging-inngest-live.test.ts > live staging Inngest saga > runs a supported CBC through result, correction, doctor review, reminder, and feedback
Error: Supported-report saga failed closed: processing_failed; diagnostics={"modelRuns":[{"error_code":null,"model_name":"gemini-3.5-flash","provider":"gemini_structured_outputs","status":"succeeded","task_type":"biomarker_extraction"},{"error_code":null,"model_name":"gemini-3.5-flash","provider":"gemini_structured_outputs","status":"succeeded","task_type":"biomarker_extraction"},{"error_code":null,"model_name":"gemini-3.5-flash","provider":"gemini_structured_outputs","status":"succeeded","task_type":"biomarker_extraction"},{"error_code":null,"model_name":"gemini-3.5-flash","provider":"gemini_structured_outputs","status":"succeeded","task_type":"biomarker_extraction"}],"steps":[{"error_code":null,"status":"completed","step_name":"malware_scan"},{"error_code":null,"status":"completed","step_name":"extract_document"},{"error_code":null,"status":"completed","step_name":"ocr_fallback"},{"error_code":null,"status":"completed","step_name":"classify_report"},{"error_code":null,"status":"completed","step_name":"extract_biomarkers"},{"error_code":null,"status":"completed","step_name":"normalize_biomarkers"}]}
 ❯ waitForSupportedResult src/inngest/staging-inngest-live.test.ts:560:13
    558|     if (result.data.status === "blocked" || result.data.status === "fa…
    559|       const diagnostics = await supportedJobDiagnostics(service, jobId…
    560|       throw new Error(
       |             ^
    561|         `Supported-report saga failed closed: ${result.data.error_code…
    562|       );
 ❯ src/inngest/staging-inngest-live.test.ts:311:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

npm error Lifecycle script `test:launch-live` failed with error:
npm error code 1
npm error path [workspace]/apps/web
npm error workspace @lyf9/web@0.1.0
npm error location [workspace]/apps/web
npm error command failed
npm error command sh -c vitest run src/inngest/staging-inngest-live.test.ts -t "supported CBC"
