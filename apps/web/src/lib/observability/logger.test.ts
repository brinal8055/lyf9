import { afterEach, describe, expect, it, vi } from "vitest";

import { logError, logInfo } from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PHI-safe structured logging", () => {
  it("drops sensitive context keys and scrubs sensitive values", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logError("provider_request_failed", {
      error: "Request for patient@example.com used Bearer eyJabc.def.ghi",
      patientName: "Synthetic Person",
      reportId: "report-123"
    });

    const output = String(write.mock.calls[0]?.[0]);
    expect(output).toContain("report-123");
    expect(output).toContain("[redacted-email]");
    expect(output).toContain("Bearer [redacted]");
    expect(output).not.toContain("Synthetic Person");
    expect(output).not.toContain("patient@example.com");
  });

  it("honors silent mode for informational logs", () => {
    const previous = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "silent";
    const write = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logInfo("quiet_event", { reportId: "report-123" });
    expect(write).not.toHaveBeenCalled();
    if (previous === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previous;
  });
});
