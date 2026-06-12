import { readFileSync } from "fs";
import path from "path";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { AUTH_COOKIE_NAME } from "./constants";
import { getRequestUser, requireRequestRole } from "./request";
import { getAuthProviderMode } from "./providers/supabase-server";
import { createSessionCookie } from "./session";

const repoRoot = path.resolve(process.cwd(), "../..");
const originalEnv = { ...process.env };

describe("Supabase auth foundation", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects missing Supabase access tokens when Supabase auth is configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

    const request = new NextRequest("http://localhost:3000/api/reports");

    await expect(getRequestUser(request)).resolves.toBeNull();
  });

  it("does not allow a normal local scaffold user to access admin routes", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.APP_ENV = "local";
    process.env.ENABLE_LOCAL_AUTH_FALLBACK = "true";
    process.env.LYF9_AUTH_SECRET = "test-secret";

    const cookie = createSessionCookie(
      { email: "user@example.com", id: "user@example.com", name: "Beta User", role: "user" },
      "test-secret"
    );
    const request = new NextRequest("http://localhost:3000/api/admin/reports", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${cookie}`
      }
    });
    const result = await requireRequestRole(request, ["admin"]);

    expect(result.response?.status).toBe(403);
  });

  it("blocks local fallback in production mode", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.APP_ENV = "production";
    process.env.ENABLE_LOCAL_AUTH_FALLBACK = "true";

    expect(getAuthProviderMode()).toBe("configuration_error");
  });

  it("blocks local fallback in staging mode", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.APP_ENV = "staging";
    process.env.ENABLE_LOCAL_AUTH_FALLBACK = "true";

    expect(getAuthProviderMode()).toBe("configuration_error");
  });

  it("allows local fallback only when explicitly enabled in local mode", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.APP_ENV = "local";
    delete process.env.ENABLE_LOCAL_AUTH_FALLBACK;

    expect(getAuthProviderMode()).toBe("configuration_error");

    process.env.ENABLE_LOCAL_AUTH_FALLBACK = "true";

    expect(getAuthProviderMode()).toBe("local_cookie_scaffold");
  });

  it("returns a setup error instead of reading local cookies when fallback is disabled", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.APP_ENV = "production";
    process.env.ENABLE_LOCAL_AUTH_FALLBACK = "true";
    process.env.LYF9_AUTH_SECRET = "test-secret";

    const cookie = createSessionCookie(
      { email: "admin@lyf9.ai", id: "admin@lyf9.ai", name: "Admin", role: "admin" },
      "test-secret"
    );
    const request = new NextRequest("http://localhost:3000/api/admin/reports", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${cookie}`
      }
    });
    const result = await requireRequestRole(request, ["admin"]);

    expect(result.response?.status).toBe(503);
  });

  it("keeps the service-role key out of public browser env names", () => {
    const webEnv = readFileSync(path.join(repoRoot, "apps/web/.env.example"), "utf8");
    const publicSupabaseProvider = readFileSync(
      path.join(repoRoot, "apps/web/src/lib/auth/providers/supabase.ts"),
      "utf8"
    );
    const browserSupabaseProvider = readFileSync(
      path.join(repoRoot, "apps/web/src/lib/auth/providers/supabase-browser.ts"),
      "utf8"
    );

    expect(webEnv).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
    expect(webEnv).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=");
    expect(webEnv).toContain("SUPABASE_SERVICE_ROLE_KEY=");
    expect(publicSupabaseProvider).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(browserSupabaseProvider).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("defines RLS boundaries for user, doctor, admin, and backend-controlled writes", () => {
    const migration = readFileSync(
      path.join(repoRoot, "supabase/migrations/202606060002_auth_persistence_rls_hardening.sql"),
      "utf8"
    );

    expect(migration).toContain("has_required_report_upload_consent");
    expect(migration).toContain("Users read own report files");
    expect(migration).toContain("Backend only writes report files");
    expect(migration).toContain("Doctors read assigned report files");
    expect(migration).toContain("Admins read processing job steps");
    expect(migration).toContain("Service inserts audit logs only");
  });

  it("keeps upload-init behind the server-side consent gate before metadata creation", () => {
    const uploadInitRoute = readFileSync(
      path.join(repoRoot, "apps/web/src/app/api/reports/upload-init/route.ts"),
      "utf8"
    );

    expect(uploadInitRoute.indexOf("hasRequiredReportUploadConsent")).toBeGreaterThan(-1);
    expect(uploadInitRoute.indexOf("await auditReportUploadBlocked")).toBeGreaterThan(-1);
    expect(uploadInitRoute.indexOf("await auditReportUploadBlocked")).toBeLessThan(
      uploadInitRoute.indexOf("return consentRequiredResponse()")
    );
    expect(uploadInitRoute.indexOf("return consentRequiredResponse()")).toBeLessThan(
      uploadInitRoute.indexOf("await createUploadInit")
    );
  });
});
