import { describe, expect, it } from "vitest";

import { runGoldenEvaluation } from "./golden-eval";

describe("golden dataset evaluation", () => {
  it("writes machine and human-readable golden evaluation reports", async () => {
    const result = await runGoldenEvaluation({ writeReports: true });

    expect(result.privateBetaRecommendation).toBe("Not ready");
    expect(result.metrics.safety.unsafe_language_block_rate).toBe(1);
    expect(result.metrics.safety.unsupported_report_ai_block_rate).toBe(1);
    expect(result.metrics.workflow.failed_config_fail_closed_rate).toBe(1);
  });
});
