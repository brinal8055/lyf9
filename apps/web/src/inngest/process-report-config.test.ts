import { describe, expect, it } from "vitest";

import { PROCESS_REPORT_CONCURRENCY_LIMIT } from "./config";

describe("process-report deployment contract", () => {
  it("stays within the current Inngest staging plan limit", () => {
    expect(PROCESS_REPORT_CONCURRENCY_LIMIT).toBeGreaterThan(0);
    expect(PROCESS_REPORT_CONCURRENCY_LIMIT).toBeLessThanOrEqual(5);
  });
});
