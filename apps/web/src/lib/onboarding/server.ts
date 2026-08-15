import { CONSENT_VERSION } from "@lyf9/shared";

import { createSupabaseServiceClient } from "../auth/providers/supabase-server";
import type { SessionUser } from "../auth/session";
import { shouldUseSupabaseAuth, writeSupabaseAuditLog } from "../auth/supabase-auth";
import { trackAnalyticsEvent } from "../reports/repository";
import { buildConsentRecords, hasRequiredConsent, REQUIRED_CONSENT_KEYS } from "./consent";
import type {
  ConsentChoices,
  ConsentRecord,
  HealthProfile,
  QuestionnaireResponse
} from "./types";

export async function saveUserHealthProfile(input: {
  profile: HealthProfile;
  user: SessionUser;
}) {
  if (!shouldUseSupabaseAuth()) {
    return { persisted: false };
  }

  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error: profileError } = await serviceClient.from("user_profiles").upsert(
    {
      city: input.profile.city.trim(),
      email: input.user.email,
      full_name: input.profile.name.trim(),
      updated_at: now,
      user_id: input.user.id
    },
    { onConflict: "user_id" }
  );

  if (profileError) {
    throw new Error(profileError.message);
  }

  const { error: healthError } = await serviceClient.from("user_health_profiles").upsert(
    {
      age: nullableNumber(input.profile.ageYears),
      city: input.profile.city.trim(),
      date_of_birth: input.profile.dateOfBirth || null,
      gender: input.profile.gender || null,
      height_cm: nullableNumber(input.profile.heightCm),
      updated_at: now,
      user_id: input.user.id,
      weight_kg: nullableNumber(input.profile.weightKg)
    },
    { onConflict: "user_id" }
  );

  if (healthError) {
    throw new Error(healthError.message);
  }

  await writeSupabaseAuditLog({
    action: "user_health_profile_saved",
    actorRole: input.user.role,
    actorUserId: input.user.id,
    metadata: { fields: ["profile", "health_profile"] },
    resourceId: input.user.id,
    resourceType: "user_health_profile"
  });

  return { persisted: true };
}

export async function saveQuestionnaireResponse(input: {
  response: QuestionnaireResponse;
  user: SessionUser;
}) {
  if (!shouldUseSupabaseAuth()) {
    return { persisted: false };
  }

  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await serviceClient.from("questionnaire_responses").insert({
    completed_at: now,
    questionnaire_version: "beta_health_intake_v1",
    response_json: input.response,
    updated_at: now,
    user_id: input.user.id
  });

  if (error) {
    throw new Error(error.message);
  }

  await trackAnalyticsEvent({
    eventName: "questionnaire_completed",
    metadata: { questionnaireKey: "beta_health_intake_v1" },
    userId: input.user.id
  });

  return { persisted: true };
}

export async function saveConsentChoices(input: {
  choices: ConsentChoices;
  ipAddress: string | null;
  user: SessionUser;
  userAgent: string | null;
}) {
  const timestamp = new Date().toISOString();
  const records = buildConsentRecords(input.choices, {
    ipAddress: input.ipAddress,
    timestamp,
    userAgent: input.userAgent
  });
  const requiredGranted = hasRequiredConsent(input.choices);

  if (!shouldUseSupabaseAuth()) {
    return { persisted: false, records, requiredGranted };
  }

  const serviceClient = createSupabaseServiceClient();
  const rows = records.map((record) => ({
    consent_type: record.consentType,
    consent_version: CONSENT_VERSION,
    created_at: record.createdAt,
    granted: record.granted,
    granted_at: record.grantedAt,
    ip_address: record.ipAddress,
    legal_text_hash: record.legalTextHash,
    purpose: record.purpose,
    revoked_at: record.revokedAt,
    updated_at: timestamp,
    user_agent: record.userAgent,
    user_id: input.user.id,
    version: record.version
  }));
  const { error } = await serviceClient.from("user_consents").insert(rows);

  if (error) {
    throw new Error(error.message);
  }

  for (const record of records) {
    await writeSupabaseAuditLog({
      action: record.granted ? "consent_granted" : "consent_revoked",
      actorRole: input.user.role,
      actorUserId: input.user.id,
      metadata: {
        consentType: record.consentType,
        version: record.version
      },
      resourceId: input.user.id,
      resourceType: "user_consent"
    });
  }

  if (requiredGranted) {
    await trackAnalyticsEvent({
      eventName: "consent_completed",
      metadata: { version: CONSENT_VERSION },
      userId: input.user.id
    });
  }

  return { persisted: true, records, requiredGranted };
}

export async function loadUserHealthProfile(userId: string): Promise<HealthProfile | null> {
  if (!shouldUseSupabaseAuth()) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const [profileResult, healthResult] = await Promise.all([
    serviceClient.from("user_profiles").select("full_name, email").eq("user_id", userId).maybeSingle(),
    serviceClient
      .from("user_health_profiles")
      .select("date_of_birth, age, gender, height_cm, weight_kg, city")
      .eq("user_id", userId)
      .maybeSingle()
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (healthResult.error) throw new Error(healthResult.error.message);

  if (!profileResult.data && !healthResult.data) {
    return null;
  }

  const health = healthResult.data;
  return {
    ageYears: health?.age != null ? String(health.age) : "",
    city: health?.city ?? "",
    dateOfBirth: health?.date_of_birth ?? "",
    gender: health?.gender ?? "",
    heightCm: health?.height_cm != null ? String(health.height_cm) : "",
    name: profileResult.data?.full_name ?? "",
    weightKg: health?.weight_kg != null ? String(health.weight_kg) : ""
  };
}

export async function loadQuestionnaireResponse(
  userId: string
): Promise<QuestionnaireResponse | null> {
  if (!shouldUseSupabaseAuth()) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("questionnaire_responses")
    .select("response_json")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.response_json as QuestionnaireResponse | undefined) ?? null;
}

export async function loadConsentRecordsFromSupabase(userId: string): Promise<ConsentRecord[]> {
  if (!shouldUseSupabaseAuth()) {
    return [];
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("user_consents")
    .select(
      "consent_type, granted, version, purpose, legal_text_hash, granted_at, revoked_at, ip_address, user_agent, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    consentType: row.consent_type as ConsentRecord["consentType"],
    createdAt: row.created_at,
    grantedAt: row.granted_at,
    granted: row.granted,
    ipAddress: row.ip_address,
    legalTextHash: row.legal_text_hash,
    purpose: row.purpose,
    revokedAt: row.revoked_at,
    userAgent: row.user_agent,
    version: row.version
  }));
}

export async function getOnboardingTaskStatus(userId: string) {
  if (!shouldUseSupabaseAuth()) {
    return { consentDone: false, profileDone: false, questionnaireDone: false };
  }

  const serviceClient = createSupabaseServiceClient();
  const [profileResult, questionnaireResult, consentResult] = await Promise.all([
    serviceClient.from("user_health_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
    serviceClient
      .from("questionnaire_responses")
      .select("user_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    serviceClient
      .from("user_consents")
      .select("consent_type")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .eq("granted", true)
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (questionnaireResult.error) throw new Error(questionnaireResult.error.message);
  if (consentResult.error) throw new Error(consentResult.error.message);

  const grantedConsentTypes = new Set((consentResult.data ?? []).map((row) => row.consent_type));

  return {
    consentDone: REQUIRED_CONSENT_KEYS.every((key) => grantedConsentTypes.has(key)),
    profileDone: Boolean(profileResult.data),
    questionnaireDone: Boolean(questionnaireResult.data)
  };
}

export async function hasRequiredReportUploadConsent(userId: string) {
  if (!shouldUseSupabaseAuth()) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.rpc("has_required_report_upload_consent", {
    target_user_id: userId
  });

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

function nullableNumber(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
