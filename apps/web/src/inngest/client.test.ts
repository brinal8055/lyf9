import { afterEach, describe, expect, it } from "vitest";

import { isInngestConfigured } from "./client";

const names = ["APP_ENV", "INNGEST_DEV", "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("isInngestConfigured", () => {
  it("accepts the local development server only outside deployed environments", () => {
    process.env.APP_ENV = "development";
    process.env.INNGEST_DEV = "1";
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
    expect(isInngestConfigured()).toBe(true);
  });

  it.each(["staging", "production"])("requires both cloud keys in %s", (appEnv) => {
    process.env.APP_ENV = appEnv;
    process.env.INNGEST_DEV = "1";
    process.env.INNGEST_EVENT_KEY = "event-key";
    delete process.env.INNGEST_SIGNING_KEY;
    expect(isInngestConfigured()).toBe(false);

    process.env.INNGEST_SIGNING_KEY = "signkey-test";
    expect(isInngestConfigured()).toBe(true);
  });
});
