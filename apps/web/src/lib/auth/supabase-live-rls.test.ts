import { randomUUID } from "crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

type TestUser = {
  client: SupabaseClient;
  email: string;
  id: string;
  password: string;
  role: "user" | "doctor" | "admin" | "superadmin";
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
      doctor_reviews: [],
      health_insights: [],
      lab_reports: [],
      processing_jobs: [],
      report_files: [],
      user_consents: [],
      user_roles: []
    };

    async function createTestUser(role: TestUser["role"]) {
      const email = `rls-${role}-${suffix}@lyf9.ai`;
      const password = `Rls-${suffix}-${role}!`;
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

      await insertRow(service, "user_profiles", {
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
        role
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

      const insight = await insertRow(service, "health_insights", {
        disclaimer: "RLS staging test fixture.",
        lab_report_id: labReport.id,
        output_json: { summary: "test" },
        status: "draft",
        summary: "RLS staging test fixture.",
        user_id: owner.id
      });
      createdIds.health_insights.push(insight.id);

      return { insight, job, labReport, reportFile };
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

      await expectVisibleIds(userA.client, "user_profiles", userA.id, [userA.id]);
      await expectVisibleIds(userA.client, "user_profiles", userB.id, []);
      await expectVisibleIds(userA.client, "report_files", userAFixture.reportFile.id, [userAFixture.reportFile.id]);
      await expectVisibleIds(userA.client, "report_files", userBFixture.reportFile.id, []);
      await expectVisibleIds(userA.client, "processing_jobs", userAFixture.job.id, [userAFixture.job.id]);
      await expectVisibleIds(userA.client, "processing_jobs", userBFixture.job.id, []);

      const ownConsent = await userA.client.from("user_consents").insert({
        consent_type: "lab_report_processing",
        consent_version: "test",
        granted: true,
        user_id: userA.id,
        version: "test"
      }).select("id").single();
      throwIfError(ownConsent.error);
      if (!ownConsent.data) {
        throw new Error("Supabase did not return the consent row.");
      }
      createdIds.user_consents.push(ownConsent.data.id);

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

      const aiConsent = await userA.client.from("user_consents").insert({
        consent_type: "ai_analysis",
        consent_version: "test",
        granted: true,
        user_id: userA.id,
        version: "test"
      }).select("id").single();
      throwIfError(aiConsent.error);
      if (!aiConsent.data) {
        throw new Error("Supabase did not return the consent row.");
      }
      createdIds.user_consents.push(aiConsent.data.id);

      const fullConsent = await userA.client.rpc("has_required_report_upload_consent", {
        target_user_id: userA.id
      });
      throwIfError(fullConsent.error);
      expect(fullConsent.data).toBe(true);

      await expectVisibleIds(doctorA.client, "lab_reports", userAFixture.labReport.id, [userAFixture.labReport.id]);
      await expectVisibleIds(doctorA.client, "lab_reports", userBFixture.labReport.id, []);
      await expectVisibleIds(doctorB.client, "lab_reports", userAFixture.labReport.id, []);

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
    } finally {
      await cleanup(service, createdIds, createdUserIds);
    }
  }, 120_000);
});

async function expectVisibleIds(
  client: SupabaseClient,
  table: string,
  id: string,
  expectedIds: string[]
) {
  const result = await client.from(table).select("id").eq("id", id);
  throwIfError(result.error);
  expect((result.data ?? []).map((row) => row.id)).toEqual(expectedIds);
}

async function insertRow(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const result = await client.from(table).insert(row).select("id").single();
  throwIfError(result.error);
  return result.data as { id: string };
}

async function cleanup(
  service: SupabaseClient,
  idsByTable: Record<string, string[]>,
  userIds: string[]
) {
  for (const table of [
    "audit_logs",
    "doctor_reviews",
    "health_insights",
    "processing_jobs",
    "lab_reports",
    "report_files",
    "user_consents",
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Set RUN_LIVE_SUPABASE_RLS=true, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return { anonKey, serviceRoleKey, url };
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}
