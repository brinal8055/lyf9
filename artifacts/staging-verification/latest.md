# Live Staging Verification Artifact

Generated: 2026-09-13T18:08:13.718Z

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

 ❯ src/inngest/staging-inngest-live.test.ts (5 tests | 1 failed | 4 skipped) 102947ms
   × live staging Inngest saga > runs a supported CBC through result, correction, doctor review, reminder, and feedback 102946ms
     → expected { …(27) } to match object { status: 'doctor_reviewed', …(1) }
(35 matching properties omitted from actual)

 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  23:36:26
   Duration  107.02s (transform 403ms, setup 0ms, collect 778ms, tests 102.95s, environment 0ms, prepare 354ms)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/inngest/staging-inngest-live.test.ts > live staging Inngest saga > runs a supported CBC through result, correction, doctor review, reminder, and feedback
AssertionError: expected { …(27) } to match object { status: 'doctor_reviewed', …(1) }
(35 matching properties omitted from actual)

- Expected
+ Received

  Object {
    "status": "doctor_reviewed",
-   "summary": "Doctor-reviewed synthetic CBC verification summary.",
+   "summary": "All your primary blood parameters—including Hemoglobin, White Blood Cells, Platelets, and Red Blood Cells—are within the normal reference ranges. This suggests healthy blood production, normal oxygen-carrying capacity, and a stable immune system.",
  }

 ❯ src/inngest/staging-inngest-live.test.ts:436:88
    434|       );
    435|       expect(reviewedResult.response.status, responseFailure(reviewedR…
    436|       expect(objectField(objectField(reviewedResult.body, "report"), "…
       |                                                                                        ^
    437|         status: "doctor_reviewed",
    438|         summary: reviewedSummary

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

npm error Lifecycle script `test:launch-live` failed with error:
npm error code 1
npm error path [workspace]/apps/web
npm error workspace @lyf9/web@0.1.0
npm error location [workspace]/apps/web
npm error command failed
npm error command sh -c vitest run src/inngest/staging-inngest-live.test.ts -t "supported CBC"
