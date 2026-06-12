import { describe, expect, it } from "vitest";

import {
  createSessionCookie,
  readSessionCookie,
  validateAuthInput
} from "./session";

describe("auth skeleton", () => {
  it("creates and reads a signed session cookie", () => {
    const cookie = createSessionCookie(
      { email: "beta@example.com", id: "user-1", name: "Beta User", role: "user" },
      "test-secret"
    );

    expect(readSessionCookie(cookie, "test-secret")).toEqual({
      email: "beta@example.com",
      id: "user-1",
      name: "Beta User",
      role: "user"
    });
  });

  it("rejects invalid signup input", () => {
    const result = validateAuthInput(
      { email: "bad", name: "", password: "short" },
      true
    );

    expect(result.ok).toBe(false);
    expect(result.errors.email).toBeTruthy();
    expect(result.errors.name).toBeTruthy();
    expect(result.errors.password).toBeTruthy();
  });
});
