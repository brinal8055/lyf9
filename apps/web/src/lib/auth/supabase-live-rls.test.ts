import { randomUUID } from "crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

type TestUser = {
  client: SupabaseClient;
  email: string;
  id: string;
  password: string;
  profileId: string;
  role: "user" | "doctor" | "admin" | "superadmin";
  roleId: string;
};

const liveEnabled = process.env.RUN_LIVE_SUPABASE_RLS === "true";
const describeLive = liveEnabled ? describe : describe.skip;

describeLive("live Supabase RLS staging verification", () => {
  it("enforces user, doctor, admin, consent, service-role, and audit boundaries", async () => {
    const env = getLiveEnv();
    const service = createClient(env.url, env.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const createdUserIds: string[] = [];
    const createdIds: Record<string, string[]> = {
      audit_logs: [],
      analytics_events: [],
      doctor_reviews: [],
      feedback_events: [],
      health_insights: [],
      lab_reports: [],
      processing_job_steps: [],
      processing_jobs: [],
      questionnaire_responses: [],
      report_files: [],
      user_consents: [],
      user_health_profiles: [],
      user_roles: []
    };

    async function createTestUser(role: TestUser["role"]) {
      const ordinal = createdUserIds.length + 1;
      const email = `rls-${role}-${ordinal}-${suffix}@lyf9.ai`;
      const password = `Rls-${suffix}-${role}-${ordinal}!`;
      const created = await service.auth.admin.createUser({
        email,
        email_confirm: true,
        password
      });
      throwIfError(created.error);
      if (!created.data.user) {
        throw new Error("Supabase did not return a created test user.");
      }

      const id = created.data.user.id;
      createdUserIds.push(id);

      const profile = await insertRow(service, "user_profiles", {
        email,
        full_name: `RLS ${role}`,
        user_id: id
      });
      const roleRow = await insertRow(service, "user_roles", {
        granted_at: new Date().toISOString(),
        role,
        user_id: id
      });
      createdIds.user_roles.push(roleRow.id);

      const signin = await createClient(env.url, env.anonKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      }).auth.signInWithPassword({ email, password });
      throwIfError(signin.error);

      return {
        client: createClient(env.url, env.anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: {
            headers: {
              Authorization: `Bearer ${signin.data.session?.access_token}`
            }
          }
        }),
        email,
        id,
        password,
        profileId: profile.id,
        role,
        roleId: roleRow.id
      } satisfies TestUser;
    }

    async function createReportFixture(owner: TestUser) {
      const now = new Date().toISOString();
      const reportFile = await insertRow(service, "report_files", {
        file_size_bytes: 42,
        mime_type: "application/pdf",
        original_filename: `${owner.role}-${suffix}.pdf`,
        status: "upload_pending",
        storage_bucket: "rls-test",
        storage_key: `rls/${owner.id}/${suffix}.pdf`,
        storage_provider: "local",
        user_id: owner.id
      });
      createdIds.report_files.push(reportFile.id);

      const labReport = await insertRow(service, "lab_reports", {
        report_file_id: reportFile.id,
        status: "draft",
        user_id: owner.id
      });
      createdIds.lab_reports.push(labReport.id);

      const job = await insertRow(service, "processing_jobs", {
        current_state: "uploaded",
        idempotency_key: `${owner.id}-${suffix}`,
        lab_report_id: labReport.id,
        metadata: { test: "rls" },
        queued_at: now,
        report_file_id: reportFile.id,
        status: "queued",
        user_id: owner.id
      });
      createdIds.processing_jobs.push(job.id);

      const step = await insertRow(service, "processing_job_steps", {
        processing_job_id: job.id,
        state: "uploaded",
        status: "queued",
        step_key: "malware_scan"
      });
      createdIds.processing_job_steps.push(step.id);

      const insight = await insertRow(service, "health_insights", {
        disclaimer: "RLS staging test fixture.",
        lab_report_id: labReport.id,
        output_json: { summary: "test" },
        status: "draft",
        summary: "RLS staging test fixture.",
        user_id: owner.id
      });
      createdIds.health_insights.push(insight.id);

      return { insight, job, labReport, reportFile, step };
    }

    try {
      const userA = await createTestUser("user");
      const userB = await createTestUser("user");
      const doctorA = await createTestUser("doctor");
      const doctorB = await createTestUser("doctor");
      const adminA = await createTestUser("admin");
      const superadminA = await createTestUser("superadmin");
      const userAFixture = await createReportFixture(userA);
      const userBFixture = await createReportFixture(userB);
      const review = await insertRow(service, "doctor_reviews", {
        ai_draft_snapshot: { summary: "test" },
        assigned_doctor_id: doctorA.id,
        health_insight_id: userAFixture.insight.id,
        lab_report_id: userAFixture.labReport.id,
        report_file_id: userAFixture.reportFile.id,
        status: "assigned",
        user_id: userA.id
      });
      createdIds.doctor_reviews.push(review.id);

      await expectVisibleIds(userA.client, "user_profiles", userA.profileId, [userA.profileId]);
      await expectVisibleIds(userA.client, "user_profiles", userB.profileId, []);
      await expectVisibleIds(userA.client, "user_roles", userA.id, [userA.roleId], "user_id");
      await expectVisibleIds(userA.client, "user_roles", userB.id, [], "user_id");

      const ownProfileUpdate = await userA.client
        .from("user_profiles")
        .update({ city: "Synthetic City" })
        .eq("user_id", userA.id)
        .select("id, city")
        .single();
      throwIfError(ownProfileUpdate.error);
      expect(ownProfileUpdate.data?.city).toBe("Synthetic City");

      const crossProfileUpdate = await userA.client
        .from("user_profiles")
        .update({ city: "Blocked" })
        .eq("user_id", userB.id)
        .select("id");
      throwIfError(crossProfileUpdate.error);
      expect(crossProfileUpdate.data).toEqual([]);

      const healthProfile = await insertRow(userA.client, "user_health_profiles", {
        age: 30,
        goals: ["synthetic_verification"],
        lifestyle: { synthetic: true },
        user_id: userA.id
      });
      createdIds.user_health_profiles.push(healthProfile.id);
      await expectVisibleIds(userA.client, "user_health_profiles", healthProfile.id, [healthProfile.id]);

      const crossHealthProfile = await userA.client.from("user_health_profiles").insert({
        age: 31,
        user_id: userB.id
      });
      expect(crossHealthProfile.error).toBeTruthy();

      const questionnaire = await insertRow(userA.client, "questionnaire_responses", {
        completed_at: new Date().toISOString(),
        questionnaire_version: "rls_test_v1",
        response_json: { synthetic: true },
        user_id: userA.id
      });
      createdIds.questionnaire_responses.push(questionnaire.id);
      await expectVisibleIds(
        userA.client,
        "questionnaire_responses",
        questionnaire.id,
        [questionnaire.id]
      );

      const crossQuestionnaire = await userA.client.from("questionnaire_responses").insert({
        questionnaire_version: "rls_test_v1",
        response_json: { synthetic: true },
        user_id: userB.id
      });
      expect(crossQuestionnaire.error).toBeTruthy();

      await expectVisibleIds(
        userA.client,
        "report_files",
        userAFixture.reportFile.id,
        [userAFixture.reportFile.id]
      );
      await expectVisibleIds(userA.client, "report_files", userBFixture.reportFile.id, []);
      await expectVisibleIds(
        userA.client,
        "processing_jobs",
        userAFixture.job.id,
        [userAFixture.job.id]
      );
      await expectVisibleIds(userA.client, "processing_jobs", userBFixture.job.id, []);
      await expectVisibleIds(
        userA.client,
        "processing_job_steps",
        userAFixture.step.id,
        [userAFixture.step.id]
      );
      await expectVisibleIds(userB.client, "processing_job_steps", userAFixture.step.id, []);

      const directReportInsert = await userA.client.from("report_files").insert({
        file_size_bytes: 42,
        mime_type: "application/pdf",
        original_filename: "blocked-direct-write.pdf",
        status: "upload_pending",
        storage_bucket: "rls-test",
        storage_key: `rls/${userA.id}/blocked.pdf`,
        storage_provider: "local",
        user_id: userA.id
      });
      expect(directReportInsert.error).toBeTruthy();

      const ownConsent = await insertConsent(userA.client, userA.id, "lab_report_processing");
      createdIds.user_consents.push(ownConsent.id);

      const crossConsent = await userA.client.from("user_consents").insert({
        consent_type: "ai_analysis",
        consent_version: "test",
        granted: true,
        user_id: userB.id,
        version: "test"
      });
      expect(crossConsent.error).toBeTruthy();

      const missingAiConsent = await userA.client.rpc("has_required_report_upload_consent", {
        target_user_id: userA.id
      });
      throwIfError(missingAiConsent.error);
      expect(missingAiConsent.data).toBe(false);

      const aiConsent = await insertConsent(userA.client, userA.id, "ai_analysis");
      createdIds.user_consents.push(aiConsent.id);

      const fullConsent = await userA.client.rpc("has_required_report_upload_consent", {
        target_user_id: userA.id
      });
      throwIfError(fullConsent.error);
      expect(fullConsent.data).toBe(true);

      const userBLabConsent = await insertConsent(service, userB.id, "lab_report_processing");
      const userBAiConsent = await insertConsent(service, userB.id, "ai_analysis");
      createdIds.user_consents.push(userBLabConsent.id, userBAiConsent.id);

      const crossUserConsentCheck = await userA.client.rpc("has_required_report_upload_consent", {
        target_user_id: userB.id
      });
      throwIfError(crossUserConsentCheck.error);
      expect(crossUserConsentCheck.data).toBe(false);

      const serviceConsentCheck = await service.rpc("has_required_report_upload_consent", {
        target_user_id: userB.id
      });
      throwIfError(serviceConsentCheck.error);
      expect(serviceConsentCheck.data).toBe(true);

      const revoked = await userA.client
        .from("user_consents")
        .update({ granted: false, revoked_at: new Date().toISOString() })
        .eq("id", aiConsent.id)
        .select("granted, revoked_at")
        .single();
      throwIfError(revoked.error);
      expect(revoked.data?.granted).toBe(false);
      expect(revoked.data?.revoked_at).toBeTruthy();

      const revokedConsentCheck = await userA.client.rpc("has_required_report_upload_consent", {
        target_user_id: userA.id
      });
      throwIfError(revokedConsentCheck.error);
      expect(revokedConsentCheck.data).toBe(false);

      await expectVisibleIds(doctorA.client, "lab_reports", userAFixture.labReport.id, [userAFixture.labReport.id]);
      await expectVisibleIds(doctorA.client, "lab_reports", userBFixture.labReport.id, []);
      await expectVisibleIds(doctorB.client, "lab_reports", userAFixture.labReport.id, []);
      await expectVisibleIds(
        doctorA.client,
        "report_files",
        userAFixture.reportFile.id,
        [userAFixture.reportFile.id]
      );
      await expectVisibleIds(doctorB.client, "report_files", userAFixture.reportFile.id, []);
      await expectVisibleIds(doctorA.client, "doctor_reviews", review.id, [review.id]);
      await expectVisibleIds(doctorB.client, "doctor_reviews", review.id, []);

      await expectVisibleIds(
        adminA.client,
        "processing_job_steps",
        userAFixture.step.id,
        [userAFixture.step.id]
      );
      await expectVisibleIds(adminA.client, "processing_jobs", userAFixture.job.id, []);
      await expectVisibleIds(
        adminA.client,
        "lab_reports",
        userBFixture.labReport.id,
        [userBFixture.labReport.id]
      );

      const doctorRoleGrant = await doctorA.client.from("user_roles").insert({
        role: "admin",
        user_id: doctorB.id
      });
      expect(doctorRoleGrant.error).toBeTruthy();

      const adminRoleGrant = await adminA.client.from("user_roles").insert({
        role: "doctor",
        user_id: userB.id
      });
      expect(adminRoleGrant.error).toBeTruthy();

      const superadminRoleGrant = await superadminA.client.from("user_roles").insert({
        granted_by: superadminA.id,
        role: "doctor",
        user_id: userB.id
      }).select("id").single();
      throwIfError(superadminRoleGrant.error);
      if (!superadminRoleGrant.data) {
        throw new Error("Supabase did not return the role row.");
      }
      createdIds.user_roles.push(superadminRoleGrant.data.id);

      const superadminRoleRevoke = await superadminA.client
        .from("user_roles")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", superadminRoleGrant.data.id)
        .select("id, revoked_at")
        .single();
      throwIfError(superadminRoleRevoke.error);
      expect(superadminRoleRevoke.data?.revoked_at).toBeTruthy();

      const feedback = await insertRow(userA.client, "feedback_events", {
        event_type: "rls_verification",
        feedback_surface: "staging_test",
        helpful: "yes",
        metadata: { synthetic: true },
        report_id: userAFixture.labReport.id,
        user_id: userA.id
      });
      createdIds.feedback_events.push(feedback.id);
      await expectVisibleIds(userA.client, "feedback_events", feedback.id, [feedback.id]);
      await expectVisibleIds(userB.client, "feedback_events", feedback.id, []);

      const crossFeedback = await userA.client.from("feedback_events").insert({
        feedback_surface: "staging_test",
        user_id: userB.id
      });
      expect(crossFeedback.error).toBeTruthy();

      const analyticsId = randomUUID();
      const analyticsInsert = await userA.client.from("analytics_events").insert({
        event_name: "rls_verification",
        id: analyticsId,
        properties: { synthetic: true },
        user_id: userA.id
      });
      throwIfError(analyticsInsert.error);
      createdIds.analytics_events.push(analyticsId);

      const crossAnalytics = await userA.client.from("analytics_events").insert({
        event_name: "blocked_cross_user_event",
        user_id: userB.id
      });
      expect(crossAnalytics.error).toBeTruthy();
      await expectVisibleIds(userA.client, "analytics_events", analyticsId, []);
      await expectVisibleIds(adminA.client, "analytics_events", analyticsId, [analyticsId]);

      const userAuditInsert = await userA.client.from("audit_logs").insert({
        action: "user_attempted_audit_write",
        entity_type: "report_file",
        safe_metadata: { fixture: true }
      });
      expect(userAuditInsert.error).toBeTruthy();

      const serviceAudit = await insertRow(service, "audit_logs", {
        action: "backend_privileged_action",
        actor_role: "admin",
        actor_user_id: adminA.id,
        entity_id: userAFixture.reportFile.id,
        entity_type: "report_file",
        metadata: { fixture: "rls" },
        resource_id: userAFixture.reportFile.id,
        resource_type: "report_file",
        safe_metadata: { fixture: "rls" }
      });
      createdIds.audit_logs.push(serviceAudit.id);
      await expectVisibleIds(userA.client, "audit_logs", serviceAudit.id, []);
      await expectVisibleIds(adminA.client, "audit_logs", serviceAudit.id, [serviceAudit.id]);
      await expectVisibleIds(
        service,
        "report_files",
        userBFixture.reportFile.id,
        [userBFixture.reportFile.id]
      );
    } finally {
      await cleanup(service, createdIds, createdUserIds);
    }
  }, 120_000);
});

async function expectVisibleIds(
  client: SupabaseClient,
  table: string,
  id: string,
  expectedIds: string[],
  filterColumn = "id"
) {
  const result = await client.from(table).select("id").eq(filterColumn, id);
  throwIfError(result.error);
  expect((result.data ?? []).map((row) => row.id)).toEqual(expectedIds);
}

async function insertRow(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const result = await client.from(table).insert(row).select("id").single();
  throwIfError(result.error);
  return result.data as { id: string };
}

async function insertConsent(client: SupabaseClient, userId: string, consentType: string) {
  return insertRow(client, "user_consents", {
    consent_type: consentType,
    consent_version: "test",
    granted: true,
    granted_at: new Date().toISOString(),
    purpose: "Synthetic RLS verification",
    user_id: userId,
    version: "test"
  });
}

async function cleanup(
  service: SupabaseClient,
  idsByTable: Record<string, string[]>,
  userIds: string[]
) {
  for (const table of [
    "audit_logs",
    "analytics_events",
    "doctor_reviews",
    "feedback_events",
    "health_insights",
    "processing_job_steps",
    "processing_jobs",
    "lab_reports",
    "report_files",
    "user_consents",
    "questionnaire_responses",
    "user_health_profiles",
    "user_roles"
  ]) {
    const ids = idsByTable[table];
    if (ids.length > 0) {
      await service.from(table).delete().in("id", ids);
    }
  }

  await Promise.all(userIds.map((id) => service.auth.admin.deleteUser(id)));
}

function getLiveEnv() {
  if (process.env.APP_ENV !== "staging") {
    throw new Error("Live RLS verification requires APP_ENV=staging.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = process.env.STAGING_SUPABASE_PROJECT_REF;

  if (!url || !anonKey || !serviceRoleKey || !projectRef) {
    throw new Error(
      "Set RUN_LIVE_SUPABASE_RLS=true, APP_ENV=staging, STAGING_SUPABASE_PROJECT_REF, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  if (new URL(url).origin !== `https://${projectRef}.supabase.co`) {
    throw new Error("Refusing live RLS verification because the Supabase URL does not match STAGING_SUPABASE_PROJECT_REF.");
  }

  return { anonKey, serviceRoleKey, url };
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}
