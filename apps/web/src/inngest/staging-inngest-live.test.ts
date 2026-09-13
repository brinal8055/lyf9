import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

import { createGuardDutyS3MalwareScanner } from "../lib/malware/guardduty-s3-malware-scanner";

const liveEnabled = process.env.RUN_LIVE_STAGING_INNGEST === "true";
const describeLive = liveEnabled ? describe : describe.skip;
const expectedStagingOrigin = "https://lyf9-dev.vercel.app";
const guardEnvNames = [
  "APP_ENV",
  "AWS_ACCESS_KEY_ID",
  "AWS_REGION",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_TEXTRACT_REGION",
  "DOCUMENT_PARSER_PROVIDER",
  "INNGEST_DEV",
  "MALWARE_SCANNER_PROVIDER",
  "NEXT_PUBLIC_SUPABASE_URL",
  "OCR_PROVIDER",
  "PRODUCTION_S3_BUCKET",
  "S3_REPORT_BUCKET",
  "STAGING_APP_ORIGIN",
  "STAGING_S3_BUCKET",
  "STAGING_SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY"
] as const;
const originalGuardEnv = Object.fromEntries(guardEnvNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of guardEnvNames) {
    const value = originalGuardEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("staging Inngest target guard", () => {
  it("refuses production and local Inngest mode", () => {
    setValidGuardEnv();
    process.env.APP_ENV = "production";
    expect(getLiveEnv).toThrow("APP_ENV=staging");

    setValidGuardEnv();
    process.env.INNGEST_DEV = "1";
    expect(getLiveEnv).toThrow("INNGEST_DEV must be disabled");
  });

  it("requires the exact staging app, Supabase project, and S3 bucket", () => {
    setValidGuardEnv();
    process.env.STAGING_APP_ORIGIN = "https://lyf9.ai";
    expect(getLiveEnv).toThrow("exact staging app origin");

    setValidGuardEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://production-ref.supabase.co";
    expect(getLiveEnv).toThrow("Supabase URL does not match");

    setValidGuardEnv();
    process.env.PRODUCTION_S3_BUCKET = process.env.STAGING_S3_BUCKET;
    expect(getLiveEnv).toThrow("staging and production buckets match");
  });

  it("requires the real scan and extraction providers", () => {
    setValidGuardEnv();
    process.env.MALWARE_SCANNER_PROVIDER = "mock";
    expect(getLiveEnv).toThrow("MALWARE_SCANNER_PROVIDER=guardduty-s3");

    setValidGuardEnv();
    process.env.DOCUMENT_PARSER_PROVIDER = "mock";
    expect(getLiveEnv).toThrow("DOCUMENT_PARSER_PROVIDER=textract");
  });
});

describeLive("live staging Inngest saga", () => {
  it("runs a synthetic unsupported scan through GuardDuty, OCR, and classification without AI", async () => {
    const env = getLiveEnv();
    const service = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const s3 = new S3Client({
      credentials: {
        accessKeyId: env.awsAccessKeyId,
        secretAccessKey: env.awsSecretAccessKey
      },
      region: env.awsRegion
    });
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const email = `lyf9-staging-inngest-${suffix}@lyf9.ai`;
    const password = `Inngest-${suffix}!`;
    const image = await readFixture("synthetic-radiology-scan.png");
    let storageKey: string | null = null;
    let userId: string | null = null;

    try {
      expect(createHash("sha256").update(image).digest("hex"))
        .toBe("54ce17992e8430ad548a60dd57c9a75c2b5d02a6e55e6b130b2adcfde6106775");
      const endpoint = await fetch(`${env.stagingOrigin}/api/inngest`, { redirect: "manual" });
      expect(endpoint.status).toBe(401);
      expect(await endpoint.json()).toMatchObject({ message: "Unauthorized" });
      const health = await fetch(`${env.stagingOrigin}/api/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({
        checks: { inngestConfigured: true },
        status: "ok"
      });

      const createdUser = await service.auth.admin.createUser({
        email,
        email_confirm: true,
        password,
        user_metadata: { full_name: "Synthetic Inngest User" }
      });
      throwIfError(createdUser.error);
      userId = createdUser.data.user?.id ?? null;
      if (!userId) throw new Error("Synthetic staging Inngest user was not created.");

      const login = await postJson(`${env.stagingOrigin}/api/auth/login`, { email, password });
      expect(login.response.status, responseFailure(login)).toBe(200);
      const authenticatedHeaders = { cookie: responseCookieHeader(login.response) };
      const consent = await postJson(
        `${env.stagingOrigin}/api/consent`,
        {
          ai_analysis: true,
          doctor_review: false,
          lab_report_processing: true,
          marketing_communication: false,
          reminders_notifications: false
        },
        authenticatedHeaders
      );
      expect(consent.response.status, responseFailure(consent)).toBe(200);

      const init = await postJson(
        `${env.stagingOrigin}/api/reports/upload-init`,
        {
          checksumSha256: createHash("sha256").update(image).digest("hex"),
          fileSizeBytes: image.length,
          mimeType: "image/png",
          originalFilename: "Synthetic Radiology Scan Verification.png"
        },
        authenticatedHeaders
      );
      expect(init.response.status, responseFailure(init)).toBe(200);
      const reportFile = objectField(init.body, "reportFile");
      const labReport = objectField(init.body, "labReport");
      const job = objectField(init.body, "job");
      const reportFileId = stringField(reportFile, "id");
      const labReportId = stringField(labReport, "id");
      const jobId = stringField(job, "id");
      storageKey = stringField(reportFile, "storageKey");

      const upload = await fetch(stringField(init.body, "uploadUrl"), {
        body: image,
        headers: stringRecord(init.body.requiredHeaders),
        method: "PUT"
      });
      expect(upload.status, await upload.text()).toBe(200);

      const scan = await createGuardDutyS3MalwareScanner({
        bucket: env.stagingBucket,
        pollIntervalMs: 3_000,
        timeoutMs: 240_000
      }).scanFile({
        mimeType: "image/png",
        reportFileId,
        storageKey
      });
      expect(scan).toMatchObject({ provider: "guardduty_s3", status: "passed" });

      const complete = await postJson(
        `${env.stagingOrigin}/api/reports/${reportFileId}/upload-complete`,
        {},
        authenticatedHeaders
      );
      expect(complete.response.status, responseFailure(complete)).toBe(200);

      await waitForUnsupportedResult(service, jobId);

      const [fileResult, labResult, jobResult, stepResult, extractionResult] = await Promise.all([
        service.from("report_files").select("scan_status, status").eq("id", reportFileId).single(),
        service.from("lab_reports").select("report_type, status, unsupported_reason").eq("id", labReportId).single(),
        service.from("processing_jobs").select("current_state, status").eq("id", jobId).single(),
        service.from("processing_job_steps").select("status, step_name").eq("processing_job_id", jobId),
        service.from("extracted_documents").select("ocr_provider, parser_provider, status, user_id").eq("report_file_id", reportFileId).single()
      ]);
      [fileResult, labResult, jobResult, stepResult, extractionResult].forEach((result) => throwIfError(result.error));
      if (!fileResult.data || !labResult.data || !jobResult.data || !extractionResult.data) {
        throw new Error("Staging Inngest verification result was incomplete.");
      }

      expect(fileResult.data).toEqual({ scan_status: "scan_passed", status: "unsupported" });
      expect(labResult.data).toMatchObject({ report_type: "unsupported", status: "unsupported" });
      expect(labResult.data.unsupported_reason).toContain("Radiology");
      expect(jobResult.data).toEqual({ current_state: "unsupported", status: "completed" });
      expect(extractionResult.data).toEqual({
        ocr_provider: "textract",
        parser_provider: "textract",
        status: "success",
        user_id: userId
      });
      expect(stepStatusMap(stepResult.data ?? [])).toMatchObject({
        classify_report: "completed",
        extract_document: "completed",
        malware_scan: "completed",
        ocr_fallback: "completed"
      });

      await expectNoAiOutputs(service, userId, reportFileId);
    } finally {
      if (storageKey) {
        await s3.send(new DeleteObjectCommand({ Bucket: env.stagingBucket, Key: storageKey })).catch(() => undefined);
      }
      await cleanupSyntheticUser(service, email, userId);
      s3.destroy();
    }
  }, 360_000);

  it("runs a supported CBC through result, correction, doctor review, reminder, and feedback", async () => {
    const env = getLiveEnv();
    const service = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const s3 = new S3Client({
      credentials: {
        accessKeyId: env.awsAccessKeyId,
        secretAccessKey: env.awsSecretAccessKey
      },
      region: env.awsRegion
    });
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const patientEmail = `lyf9-staging-patient-${suffix}@lyf9.ai`;
    const adminEmail = `lyf9-staging-admin-${suffix}@lyf9.ai`;
    const doctorEmail = `lyf9-staging-doctor-${suffix}@lyf9.ai`;
    const password = `Launch-${suffix}!`;
    const image = await readFixture("synthetic-cbc-scan.png");
    const createdUsers: Array<{ email: string; id: string }> = [];
    let storageKey: string | null = null;

    try {
      const patientId = await createConfirmedUser(service, patientEmail, password, "Synthetic Patient");
      const adminId = await createConfirmedUser(service, adminEmail, password, "Synthetic Admin");
      const doctorId = await createConfirmedUser(service, doctorEmail, password, "Synthetic Doctor");
      createdUsers.push(
        { email: patientEmail, id: patientId },
        { email: adminEmail, id: adminId },
        { email: doctorEmail, id: doctorId }
      );

      const patientHeaders = await loginHeaders(env.stagingOrigin, patientEmail, password);
      const adminHeaders = await loginHeaders(env.stagingOrigin, adminEmail, password);
      const doctorHeaders = await loginHeaders(env.stagingOrigin, doctorEmail, password);
      await grantTestRole(service, adminId, "admin");
      await grantTestRole(service, doctorId, "doctor");
      await seedApprovedDoctor(service, { adminId, doctorId, suffix });

      const consent = await postJson(
        `${env.stagingOrigin}/api/consent`,
        {
          ai_analysis: true,
          doctor_review: true,
          lab_report_processing: true,
          marketing_communication: false,
          reminders_notifications: true
        },
        patientHeaders
      );
      expect(consent.response.status, responseFailure(consent)).toBe(200);

      const init = await postJson(
        `${env.stagingOrigin}/api/reports/upload-init`,
        {
          checksumSha256: createHash("sha256").update(image).digest("hex"),
          fileSizeBytes: image.length,
          mimeType: "image/png",
          originalFilename: "Synthetic CBC Launch Verification.png"
        },
        patientHeaders
      );
      expect(init.response.status, responseFailure(init)).toBe(200);
      const reportFile = objectField(init.body, "reportFile");
      const labReport = objectField(init.body, "labReport");
      const job = objectField(init.body, "job");
      const reportFileId = stringField(reportFile, "id");
      const labReportId = stringField(labReport, "id");
      const jobId = stringField(job, "id");
      storageKey = stringField(reportFile, "storageKey");

      const upload = await fetch(stringField(init.body, "uploadUrl"), {
        body: image,
        headers: stringRecord(init.body.requiredHeaders),
        method: "PUT"
      });
      expect(upload.status, await upload.text()).toBe(200);

      const scan = await createGuardDutyS3MalwareScanner({
        bucket: env.stagingBucket,
        pollIntervalMs: 3_000,
        timeoutMs: 240_000
      }).scanFile({ mimeType: "image/png", reportFileId, storageKey });
      expect(scan).toMatchObject({ provider: "guardduty_s3", status: "passed" });

      const complete = await postJson(
        `${env.stagingOrigin}/api/reports/${reportFileId}/upload-complete`,
        {},
        patientHeaders
      );
      expect(complete.response.status, responseFailure(complete)).toBe(200);
      await waitForSupportedResult(service, jobId);

      const [markers, insights, models, extraction, steps] = await Promise.all([
        service.from("biomarker_results").select("*").eq("lab_report_id", labReportId),
        service.from("health_insights").select("*").eq("lab_report_id", labReportId).single(),
        service.from("model_runs").select("*").eq("report_file_id", reportFileId),
        service.from("extracted_documents").select("*").eq("report_file_id", reportFileId).single(),
        service.from("processing_job_steps").select("status, step_name").eq("processing_job_id", jobId)
      ]);
      [markers, insights, models, extraction, steps].forEach((result) => throwIfError(result.error));
      expect(markers.data?.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(models.data?.map((row) => row.task_type)).toEqual(
        expect.arrayContaining(["biomarker_extraction", "patient_explanation"])
      );
      expect(extraction.data).toMatchObject({ ocr_provider: "textract", parser_provider: "textract" });
      expect(insights.data?.status).toMatch(/^(ai_only_ready|doctor_review_required)$/);
      expect(insights.data?.source_biomarker_ids?.length ?? 0).toBeGreaterThan(0);
      expect(insights.data?.explanation_json?.summary).toBeTruthy();
      expect(stepStatusMap(steps.data ?? [])).toMatchObject({
        extract_biomarkers: "completed",
        generate_patient_explanation: "completed",
        publish_result: "completed",
        run_safety_rules: "completed"
      });

      const patientResult = await getJson(
        `${env.stagingOrigin}/api/reports/${reportFileId}`,
        patientHeaders
      );
      expect(patientResult.response.status, responseFailure(patientResult)).toBe(200);
      const resultReport = objectField(patientResult.body, "report");
      const resultInsight = objectField(resultReport, "healthInsight");
      expect(stringField(resultInsight, "summary").length).toBeGreaterThan(10);
      expect(Array.isArray(resultReport.markerCards)).toBe(true);
      expect((resultReport.markerCards as unknown[]).length).toBeGreaterThanOrEqual(4);

      const reminder = await postJson(
        `${env.stagingOrigin}/api/reminders`,
        {
          reminderDate: "2026-12-15",
          reportFileId,
          title: "Discuss retest timing"
        },
        patientHeaders
      );
      expect(reminder.response.status, responseFailure(reminder)).toBe(201);
      const feedback = await postJson(
        `${env.stagingOrigin}/api/feedback`,
        {
          feedbackSurface: "report_result",
          freeText: "Synthetic launch verification feedback.",
          helpful: "yes",
          reportFileId,
          wouldTrustDoctorReview: "yes"
        },
        patientHeaders
      );
      expect(feedback.response.status, responseFailure(feedback)).toBe(201);

      const adminQueue = await getJson(`${env.stagingOrigin}/api/admin/reports`, adminHeaders);
      expect(adminQueue.response.status, responseFailure(adminQueue)).toBe(200);
      expect(arrayField(adminQueue.body, "biomarkerResults").length).toBeGreaterThanOrEqual(4);
      expect(arrayField(adminQueue.body, "healthInsights").length).toBeGreaterThan(0);

      const firstMarker = markers.data?.[0];
      if (!firstMarker) throw new Error("No biomarker was available for correction verification.");
      const correction = await postJson(
        `${env.stagingOrigin}/api/admin/corrections`,
        {
          biomarkerResultId: firstMarker.id,
          canonicalName: firstMarker.canonical_name,
          confidenceScore: firstMarker.confidence_score,
          rawName: firstMarker.raw_name,
          reason: "Synthetic private beta launch verification.",
          referenceHigh: firstMarker.reference_high,
          referenceLow: firstMarker.reference_low,
          referenceRangeText: firstMarker.reference_range_text,
          reviewRouting: firstMarker.review_routing,
          sourceText: firstMarker.source_text,
          systemFlag: firstMarker.system_flag,
          unit: firstMarker.unit,
          valueNumeric: firstMarker.value_numeric,
          valueText: firstMarker.value_text
        },
        adminHeaders
      );
      expect(correction.response.status, responseFailure(correction)).toBe(200);
      expect(objectField(correction.body, "marker").isManuallyCorrected).toBe(true);

      const assignment = await postJson(
        `${env.stagingOrigin}/api/admin/doctor-reviews`,
        {
          assignedDoctorEmail: doctorEmail,
          healthInsightId: insights.data?.id,
          priority: "standard"
        },
        adminHeaders
      );
      expect(assignment.response.status, responseFailure(assignment)).toBe(200);
      const assignedReview = objectField(assignment.body, "review");
      const reviewId = stringField(assignedReview, "id");

      const doctorQueue = await getJson(`${env.stagingOrigin}/api/doctor/reviews`, doctorHeaders);
      expect(doctorQueue.response.status, responseFailure(doctorQueue)).toBe(200);
      expect(
        arrayField(doctorQueue.body, "reviews").some((review) => {
          const detail = objectFieldOrNull(review);
          const reviewRecord = objectFieldOrNull(detail?.review);
          return reviewRecord?.id === reviewId;
        })
      ).toBe(true);

      const reviewedSummary = "Doctor-reviewed synthetic CBC verification summary.";
      const action = await postJson(
        `${env.stagingOrigin}/api/doctor/reviews/${reviewId}/action`,
        { action: "edit_and_approve", editedSummary: reviewedSummary, notes: "Synthetic test." },
        doctorHeaders
      );
      expect(action.response.status, responseFailure(action)).toBe(200);

      const reviewedResult = await getJson(
        `${env.stagingOrigin}/api/reports/${reportFileId}`,
        patientHeaders
      );
      expect(reviewedResult.response.status, responseFailure(reviewedResult)).toBe(200);
      expect(objectField(objectField(reviewedResult.body, "report"), "healthInsight")).toMatchObject({
        status: "doctor_reviewed",
        summary: reviewedSummary
      });

      const audit = await service
        .from("audit_logs")
        .select("action")
        .in("action", ["admin_biomarker_corrected", "doctor_review_action", "feedback_submitted"])
        .or(`actor_user_id.eq.${adminId},actor_user_id.eq.${doctorId},actor_user_id.eq.${patientId}`);
      throwIfError(audit.error);
      expect(audit.data?.map((row) => row.action)).toEqual(
        expect.arrayContaining(["admin_biomarker_corrected", "doctor_review_action", "feedback_submitted"])
      );
    } finally {
      if (storageKey) {
        await s3.send(new DeleteObjectCommand({ Bucket: env.stagingBucket, Key: storageKey })).catch(() => undefined);
      }
      for (const user of createdUsers.reverse()) {
        await cleanupSyntheticUser(service, user.email, user.id).catch(() => undefined);
      }
      s3.destroy();
    }
  }, 600_000);
});

function getLiveEnv() {
  if (process.env.APP_ENV !== "staging") {
    throw new Error("Live Inngest verification requires APP_ENV=staging.");
  }
  if (process.env.INNGEST_DEV === "1") {
    throw new Error("INNGEST_DEV must be disabled for live staging verification.");
  }
  if (process.env.MALWARE_SCANNER_PROVIDER !== "guardduty-s3") {
    throw new Error("Live Inngest verification requires MALWARE_SCANNER_PROVIDER=guardduty-s3.");
  }
  if (process.env.DOCUMENT_PARSER_PROVIDER !== "textract") {
    throw new Error("Live Inngest verification requires DOCUMENT_PARSER_PROVIDER=textract.");
  }
  if (process.env.OCR_PROVIDER !== "textract") {
    throw new Error("Live Inngest verification requires OCR_PROVIDER=textract.");
  }

  const awsAccessKeyId = requiredEnv("AWS_ACCESS_KEY_ID");
  const awsRegion = requiredEnv("AWS_REGION");
  const awsSecretAccessKey = requiredEnv("AWS_SECRET_ACCESS_KEY");
  const textractRegion = requiredEnv("AWS_TEXTRACT_REGION");
  const reportBucket = requiredEnv("S3_REPORT_BUCKET");
  const stagingBucket = requiredEnv("STAGING_S3_BUCKET");
  const productionBucket = requiredEnv("PRODUCTION_S3_BUCKET");
  const projectRef = requiredEnv("STAGING_SUPABASE_PROJECT_REF");
  const stagingOrigin = new URL(requiredEnv("STAGING_APP_ORIGIN")).origin;
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (stagingOrigin !== expectedStagingOrigin) {
    throw new Error(`Live Inngest verification requires the exact staging app origin ${expectedStagingOrigin}.`);
  }
  if (new URL(supabaseUrl).origin !== `https://${projectRef}.supabase.co`) {
    throw new Error("Refusing live Inngest verification: Supabase URL does not match the staging project.");
  }
  if (reportBucket !== stagingBucket) {
    throw new Error("Live Inngest verification requires S3_REPORT_BUCKET=STAGING_S3_BUCKET.");
  }
  if (stagingBucket === productionBucket) {
    throw new Error("Refusing live Inngest verification: staging and production buckets match.");
  }
  if (!/staging|stage|dev|test/i.test(stagingBucket)) {
    throw new Error("Refusing live Inngest verification: bucket name is not staging-specific.");
  }
  if (awsRegion !== "ap-south-1" || textractRegion !== awsRegion) {
    throw new Error("Live Inngest verification requires S3 and Textract in staging ap-south-1.");
  }

  return {
    awsAccessKeyId,
    awsRegion,
    awsSecretAccessKey,
    serviceRoleKey,
    stagingBucket,
    stagingOrigin,
    supabaseUrl
  };
}

async function waitForUnsupportedResult(service: SupabaseClient, jobId: string) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const result = await service
      .from("processing_jobs")
      .select("current_state, error_code, status")
      .eq("id", jobId)
      .single();
    throwIfError(result.error);
    if (!result.data) throw new Error("Staging Inngest job was not found.");
    if (result.data.current_state === "unsupported" && result.data.status === "completed") return;
    if (result.data.status === "blocked" || result.data.status === "failed") {
      throw new Error(`Staging Inngest saga failed closed: ${result.data.error_code ?? result.data.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Timed out waiting for the staging Inngest saga.");
}

async function waitForSupportedResult(service: SupabaseClient, jobId: string) {
  const deadline = Date.now() + 480_000;
  while (Date.now() < deadline) {
    const result = await service
      .from("processing_jobs")
      .select("current_state, error_code, error_message, status")
      .eq("id", jobId)
      .single();
    throwIfError(result.error);
    if (!result.data) throw new Error("Staging supported-report job was not found.");
    if (
      result.data.status === "completed" &&
      ["published", "doctor_review_required", "critical_review_required"].includes(
        result.data.current_state
      )
    ) {
      return;
    }
    if (result.data.status === "blocked" || result.data.status === "failed") {
      const diagnostics = await supportedJobDiagnostics(service, jobId);
      throw new Error(
        `Supported-report saga failed closed: ${result.data.error_code ?? result.data.error_message ?? result.data.status}; diagnostics=${JSON.stringify(diagnostics)}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error("Timed out waiting for the supported staging report saga.");
}

async function supportedJobDiagnostics(service: SupabaseClient, jobId: string) {
  const [steps, modelRuns] = await Promise.all([
    service
      .from("processing_job_steps")
      .select("error_code, status, step_name")
      .eq("processing_job_id", jobId)
      .order("created_at", { ascending: true }),
    service
      .from("model_runs")
      .select("error_code, model_name, provider, status, task_type")
      .eq("processing_job_id", jobId)
      .order("created_at", { ascending: true })
  ]);
  throwIfError(steps.error);
  throwIfError(modelRuns.error);
  return { modelRuns: modelRuns.data ?? [], steps: steps.data ?? [] };
}

async function createConfirmedUser(
  service: SupabaseClient,
  email: string,
  password: string,
  fullName: string
) {
  const created = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: { full_name: fullName }
  });
  throwIfError(created.error);
  const userId = created.data.user?.id;
  if (!userId) throw new Error(`Synthetic user ${email} was not created.`);
  return userId;
}

async function loginHeaders(origin: string, email: string, password: string) {
  const login = await postJson(`${origin}/api/auth/login`, { email, password });
  expect(login.response.status, responseFailure(login)).toBe(200);
  return { cookie: responseCookieHeader(login.response) };
}

async function grantTestRole(service: SupabaseClient, userId: string, role: "admin" | "doctor") {
  const now = new Date().toISOString();
  const revoked = await service
    .from("user_roles")
    .update({ revoked_at: now })
    .eq("user_id", userId)
    .is("revoked_at", null);
  throwIfError(revoked.error);
  const granted = await service.from("user_roles").insert({
    granted_at: new Date(Date.now() + 1_000).toISOString(),
    role,
    user_id: userId
  });
  throwIfError(granted.error);
}

async function seedApprovedDoctor(
  service: SupabaseClient,
  input: { adminId: string; doctorId: string; suffix: string }
) {
  const profile = await service.from("doctor_profiles").insert({
    full_name: "Synthetic Doctor",
    languages: ["en"],
    primary_degree: "MBBS",
    registration_council: "Synthetic Council",
    registration_number: `SYN-${input.suffix}`,
    specialties: ["hematology"],
    status: "approved",
    user_id: input.doctorId,
    verified_at: new Date().toISOString(),
    verified_by: input.adminId,
    years_experience: 10
  });
  throwIfError(profile.error);
  const capacity = await service.from("doctor_capacity").insert({
    doctor_user_id: input.doctorId,
    is_accepting: true,
    max_open_reviews: 10
  });
  throwIfError(capacity.error);
}

async function expectNoAiOutputs(service: SupabaseClient, userId: string, reportFileId: string) {
  const [models, insights, biomarkers] = await Promise.all([
    service.from("model_runs").select("id", { count: "exact", head: true }).eq("report_file_id", reportFileId),
    service.from("health_insights").select("id", { count: "exact", head: true }).eq("user_id", userId),
    service.from("biomarker_results").select("id", { count: "exact", head: true }).eq("user_id", userId)
  ]);
  [models, insights, biomarkers].forEach((result) => throwIfError(result.error));
  expect(models.count).toBe(0);
  expect(insights.count).toBe(0);
  expect(biomarkers.count).toBe(0);
}

function stepStatusMap(rows: Array<{ status: string; step_name: string }>) {
  return Object.fromEntries(rows.map((row) => [row.step_name, row.status]));
}

async function readFixture(filename: string) {
  return readFile(new URL(`../../../../tests/fixtures/ocr/${filename}`, import.meta.url));
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

async function getJson(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, { headers });
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

function objectField(value: unknown, field: string) {
  const object = objectFieldOrNull(value);
  const result = object?.[field];
  if (!result || typeof result !== "object") throw new Error(`Missing ${field}.`);
  return result as Record<string, unknown>;
}

function objectFieldOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringField(value: unknown, field: string) {
  const result = objectFieldOrNull(value)?.[field];
  if (typeof result !== "string" || !result) throw new Error(`Missing ${field}.`);
  return result;
}

function stringRecord(value: unknown) {
  const object = objectFieldOrNull(value);
  if (!object) return {};
  return Object.fromEntries(
    Object.entries(object).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function arrayField(value: unknown, field: string) {
  const result = objectFieldOrNull(value)?.[field];
  return Array.isArray(result) ? result : [];
}

async function cleanupSyntheticUser(service: SupabaseClient, email: string, knownUserId: string | null) {
  let userId = knownUserId;
  if (!userId) {
    const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1_000 });
    throwIfError(listed.error);
    userId = listed.data.users.find((user) => user.email === email)?.id ?? null;
  }
  if (!userId) return;
  const deleted = await service.auth.admin.deleteUser(userId);
  throwIfError(deleted.error);
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required live Inngest env: ${name}`);
  return value;
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function setValidGuardEnv() {
  process.env.APP_ENV = "staging";
  process.env.AWS_ACCESS_KEY_ID = "synthetic-access-key";
  process.env.AWS_REGION = "ap-south-1";
  process.env.AWS_SECRET_ACCESS_KEY = "synthetic-secret";
  process.env.AWS_TEXTRACT_REGION = "ap-south-1";
  process.env.DOCUMENT_PARSER_PROVIDER = "textract";
  delete process.env.INNGEST_DEV;
  process.env.MALWARE_SCANNER_PROVIDER = "guardduty-s3";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging-ref.supabase.co";
  process.env.OCR_PROVIDER = "textract";
  process.env.PRODUCTION_S3_BUCKET = "lyf9-reports-storage-production";
  process.env.S3_REPORT_BUCKET = "lyf9-reports-storage-staging";
  process.env.STAGING_APP_ORIGIN = expectedStagingOrigin;
  process.env.STAGING_S3_BUCKET = "lyf9-reports-storage-staging";
  process.env.STAGING_SUPABASE_PROJECT_REF = "staging-ref";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role-key";
}
