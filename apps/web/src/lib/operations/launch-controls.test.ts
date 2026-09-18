import { afterEach, describe, expect, it } from "vitest";

import { reportUploadsEnabled } from "./launch-controls";

const original = process.env.REPORT_UPLOADS_ENABLED;

afterEach(() => {
  if (original === undefined) delete process.env.REPORT_UPLOADS_ENABLED;
  else process.env.REPORT_UPLOADS_ENABLED = original;
});

describe("private beta launch controls", () => {
  it("keeps uploads enabled by default", () => {
    delete process.env.REPORT_UPLOADS_ENABLED;
    expect(reportUploadsEnabled()).toBe(true);
  });

  it("pauses uploads only with an explicit false value", () => {
    process.env.REPORT_UPLOADS_ENABLED = "false";
    expect(reportUploadsEnabled()).toBe(false);
  });
});
