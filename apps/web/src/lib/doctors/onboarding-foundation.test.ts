import { readFileSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const webRoot = path.resolve(process.cwd());

describe("doctor onboarding foundation", () => {
  it("requires a password-backed Supabase account before consuming an invite", () => {
    const route = readFileSync(
      path.join(webRoot, "src/app/api/doctors/apply/route.ts"),
      "utf8"
    );

    expect(route).toContain("parseDoctorAccountPassword");
    expect(route).toContain("password: accountPassword.data");
    expect(route.indexOf("parseDoctorAccountPassword")).toBeLessThan(
      route.indexOf("await claimInvite")
    );
    expect(route).not.toContain('role: "doctor"');
  });

  it("cleans up a partially created Auth user before releasing the invite", () => {
    const route = readFileSync(
      path.join(webRoot, "src/app/api/doctors/apply/route.ts"),
      "utf8"
    );
    const deleteUser = route.indexOf("await serviceClient.auth.admin.deleteUser(doctorUserId)");
    const releaseInvite = route.indexOf("await releaseInvite(invite.id)");

    expect(deleteUser).toBeGreaterThan(-1);
    expect(releaseInvite).toBeGreaterThan(deleteUser);
  });

  it("collects the password through masked, non-autofilled application fields", () => {
    const form = readFileSync(
      path.join(webRoot, "src/components/doctor/doctor-application-form.tsx"),
      "utf8"
    );

    expect(form).toContain('name="password"');
    expect(form).toContain('name="passwordConfirmation"');
    expect(form).toContain('autoComplete="new-password"');
    expect(form).toContain('type="password"');
  });
});
