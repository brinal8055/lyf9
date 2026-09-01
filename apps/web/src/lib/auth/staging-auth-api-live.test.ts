import { randomUUID } from "crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const liveEnabled = process.env.RUN_LIVE_STAGING_AUTH_API === "true";
const describeLive = liveEnabled ? describe : describe.skip;

describeLive("live staging Auth and consent API verification", () => {
  it("persists onboarding, protects privileged routes, and gates uploads server-side", async () => {
    const env = getLiveEnv();
    const service = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const email = `lyf9-staging-auth-${suffix}@lyf9.ai`;
    const password = `Lyf9-Staging-${suffix}!`;
    let userId: string | null = null;

    try {
      const unauthenticatedProfile = await fetch(`${env.appOrigin}/api/profile`);
      expect(unauthenticatedProfile.status).toBe(401);

      const signup = await postJson(`${env.appOrigin}/api/auth/signup`, {
        email,
        inviteCode: env.inviteCode,
        name: "Synthetic Beta User",
        password
      });
      const signupCompletedThroughApp = signup.response.status === 200;
      if (signupCompletedThroughApp) {
        userId = stringField(signup.body.user, "id");
      } else {
        expect(signup.response.status, responseFailure(signup)).toBe(400);
        expect(signup.body).toMatchObject({
          errors: { email: "email rate limit exceeded" }
        });
        const provisioned = await service.auth.admin.createUser({
          email,
          email_confirm: true,
          password,
          user_metadata: { full_name: "Synthetic Beta User" }
        });
        throwIfError(provisioned.error);
        userId = provisioned.data.user?.id ?? null;
        expect(userId).toBeTruthy();
      }

      if (!userId) throw new Error("Synthetic staging user was not created.");

      const confirm = await service.auth.admin.updateUserById(userId, { email_confirm: true });
      throwIfError(confirm.error);

      const login = await postJson(`${env.appOrigin}/api/auth/login`, { email, password });
      expect(login.response.status).toBe(200);
      const cookie = responseCookieHeader(login.response);
      expect(cookie).toContain("lyf9_sb_access_token=");
      expect(cookie).toContain("lyf9_sb_refresh_token=");

      const authenticatedHeaders = { cookie };
      const me = await fetch(`${env.appOrigin}/api/auth/me`, { headers: authenticatedHeaders });
      expect(me.status).toBe(200);
      const meBody = await me.json();
      expect(meBody.user).toMatchObject({ email, id: userId, role: "user" });

      const admin = await fetch(`${env.appOrigin}/api/admin/reports`, {
        headers: authenticatedHeaders
      });
      expect(admin.status).toBe(403);

      const doctor = await fetch(`${env.appOrigin}/api/doctor/reviews`, {
        headers: authenticatedHeaders
      });
      expect(doctor.status).toBe(403);

      const profile = {
        ageYears: "30",
        city: "Synthetic City",
        dateOfBirth: "",
        gender: "prefer_not_to_say",
        heightCm: "170",
        name: "Synthetic Beta User",
        weightKg: "70"
      };
      const profileWrite = await postJson(`${env.appOrigin}/api/profile`, profile, authenticatedHeaders);
      expect(profileWrite.response.status).toBe(200);
      expect(profileWrite.body).toMatchObject({ ok: true, persisted: true });

      const profileRead = await fetch(`${env.appOrigin}/api/profile`, {
        headers: authenticatedHeaders
      });
      expect(profileRead.status).toBe(200);
      expect((await profileRead.json()).profile).toMatchObject(profile);

      const questionnaire = {
        allergies: "none",
        currentMedicines: "none",
        dietLifestyle: "synthetic fixture",
        familyHistory: "none",
        healthGoals: "verify staging persistence",
        knownConditions: "none",
        sleepStressActivity: "synthetic fixture",
        surgeries: "none",
        symptoms: "none"
      };
      const questionnaireWrite = await postJson(
        `${env.appOrigin}/api/questionnaire`,
        questionnaire,
        authenticatedHeaders
      );
      expect(questionnaireWrite.response.status).toBe(200);
      expect(questionnaireWrite.body).toMatchObject({ ok: true, persisted: true });

      const questionnaireRead = await fetch(`${env.appOrigin}/api/questionnaire`, {
        headers: authenticatedHeaders
      });
      expect(questionnaireRead.status).toBe(200);
      expect((await questionnaireRead.json()).response).toMatchObject(questionnaire);

      const invalidUpload = {
        checksumSha256: "a".repeat(64),
        fileSizeBytes: 42,
        mimeType: "text/plain",
        originalFilename: "synthetic.txt"
      };
      const uploadWithoutConsent = await postJson(
        `${env.appOrigin}/api/reports/upload-init`,
        invalidUpload,
        authenticatedHeaders
      );
      expect(uploadWithoutConsent.response.status).toBe(403);

      const partialConsent = await postJson(
        `${env.appOrigin}/api/consent`,
        consentChoices(true, false),
        authenticatedHeaders
      );
      expect(partialConsent.response.status).toBe(200);
      expect(partialConsent.body).toMatchObject({ persisted: true, requiredGranted: false });

      const uploadWithPartialConsent = await postJson(
        `${env.appOrigin}/api/reports/upload-init`,
        invalidUpload,
        authenticatedHeaders
      );
      expect(uploadWithPartialConsent.response.status).toBe(403);

      const fullConsent = await postJson(
        `${env.appOrigin}/api/consent`,
        consentChoices(true, true),
        authenticatedHeaders
      );
      expect(fullConsent.response.status).toBe(200);
      expect(fullConsent.body).toMatchObject({ persisted: true, requiredGranted: true });

      const uploadPastConsentGate = await postJson(
        `${env.appOrigin}/api/reports/upload-init`,
        invalidUpload,
        authenticatedHeaders
      );
      expect(uploadPastConsentGate.response.status).toBe(400);
      expect(uploadPastConsentGate.body.errors).toHaveProperty("mimeType");

      const revokedConsent = await postJson(
        `${env.appOrigin}/api/consent`,
        consentChoices(false, false),
        authenticatedHeaders
      );
      expect(revokedConsent.response.status).toBe(200);
      expect(revokedConsent.body).toMatchObject({ persisted: true, requiredGranted: false });

      const uploadAfterRevocation = await postJson(
        `${env.appOrigin}/api/reports/upload-init`,
        invalidUpload,
        authenticatedHeaders
      );
      expect(uploadAfterRevocation.response.status).toBe(403);

      await expectCount(service, "user_health_profiles", "user_id", userId, 1);
      await expectCount(service, "questionnaire_responses", "user_id", userId, 1);
      await expectMinimumCount(service, "user_consents", "user_id", userId, 15);
      await expectMinimumCount(service, "audit_logs", "actor_user_id", userId, 10);
      await expectMinimumCount(
        service,
        "analytics_events",
        "user_id",
        userId,
        signupCompletedThroughApp ? 3 : 2
      );
    } finally {
      await cleanupSyntheticUser(service, email, userId);
    }
  }, 120_000);
});

function consentChoices(labReportProcessing: boolean, aiAnalysis: boolean) {
  return {
    ai_analysis: aiAnalysis,
    doctor_review: false,
    lab_report_processing: labReportProcessing,
    marketing_communication: false,
    reminders_notifications: false
  };
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST"
  });
  const responseBody = await response.json().catch(() => ({}));
  return { body: responseBody as Record<string, unknown>, response };
}

function responseCookieHeader(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return values
    .flatMap((value) => value.split(/,(?=\s*lyf9_)/))
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function responseFailure(result: Awaited<ReturnType<typeof postJson>>) {
  return `HTTP ${result.response.status}: ${JSON.stringify(result.body)}`;
}

async function expectCount(
  service: SupabaseClient,
  table: string,
  column: string,
  value: string,
  expected: number
) {
  const result = await service.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  throwIfError(result.error);
  expect(result.count).toBe(expected);
}

async function expectMinimumCount(
  service: SupabaseClient,
  table: string,
  column: string,
  value: string,
  minimum: number
) {
  const result = await service.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  throwIfError(result.error);
  expect(result.count ?? 0).toBeGreaterThanOrEqual(minimum);
}

async function cleanupSyntheticUser(
  service: SupabaseClient,
  email: string,
  knownUserId: string | null
) {
  let userId = knownUserId;
  if (!userId) {
    const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    throwIfError(listed.error);
    userId = listed.data.users.find((user) => user.email === email)?.id ?? null;
  }

  if (!userId) return;

  for (const [table, column] of [
    ["audit_logs", "actor_user_id"],
    ["analytics_events", "user_id"]
  ] as const) {
    const deleted = await service.from(table).delete().eq(column, userId);
    throwIfError(deleted.error);
  }

  const deletedUser = await service.auth.admin.deleteUser(userId);
  throwIfError(deletedUser.error);
}

function stringField(value: unknown, field: string) {
  if (!value || typeof value !== "object") throw new Error(`Missing ${field}.`);
  const result = Reflect.get(value, field);
  if (typeof result !== "string" || !result) throw new Error(`Missing ${field}.`);
  return result;
}

function getLiveEnv() {
  if (process.env.APP_ENV !== "staging") {
    throw new Error("Live Auth API verification requires APP_ENV=staging.");
  }

  const appOrigin = process.env.APP_BASE_URL;
  const expectedAppOrigin = process.env.STAGING_APP_ORIGIN;
  const inviteCode = process.env.LYF9_BETA_INVITE_CODE;
  const projectRef = process.env.STAGING_SUPABASE_PROJECT_REF;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!appOrigin || !expectedAppOrigin || !inviteCode || !projectRef || !serviceRoleKey || !supabaseUrl) {
    throw new Error("Live Auth API verification environment is incomplete.");
  }

  if (new URL(appOrigin).origin !== new URL(expectedAppOrigin).origin) {
    throw new Error("Refusing live Auth API verification because APP_BASE_URL does not match STAGING_APP_ORIGIN.");
  }

  if (new URL(supabaseUrl).origin !== `https://${projectRef}.supabase.co`) {
    throw new Error("Refusing live Auth API verification because Supabase URL does not match STAGING_SUPABASE_PROJECT_REF.");
  }

  return {
    appOrigin: new URL(appOrigin).origin,
    inviteCode,
    serviceRoleKey,
    supabaseUrl
  };
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
