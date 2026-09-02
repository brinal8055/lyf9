import { NextResponse } from "next/server";

import {
  getAuthProviderMode,
  getSupabaseServerConfig,
  getSupabaseServerKeyType
} from "@/lib/auth/providers/supabase-server";
import { isInngestConfigured } from "@/inngest/client";
import { getAiRuntimeStatus } from "@/lib/ai";
import { getStoreHealth } from "@/lib/reports/repository";

export async function GET() {
  const store = await getStoreHealth();
  const supabase = getSupabaseServerConfig();
  const deployed = process.env.APP_ENV === "staging" || process.env.APP_ENV === "production";
  const inngestConfigured = isInngestConfigured();
  const ai = getAiRuntimeStatus();

  return NextResponse.json({
    checks: {
      aiCapabilities: {
        biomarkerExtraction: ai.capabilities.biomarker_extraction.configured,
        doctorSummary: ai.capabilities.doctor_summary.configured,
        patientExplanation: ai.capabilities.patient_explanation.configured
      },
      aiConfigured: ai.readyForReportPipeline,
      aiProvider: ai.providerId,
      authSecret: Boolean(process.env.LYF9_AUTH_SECRET),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      emailConfigured: Boolean(process.env.EMAIL_PROVIDER),
      inngestConfigured,
      paymentSandboxConfigured: Boolean(process.env.RAZORPAY_KEY_ID),
      queueConfigured: Boolean(process.env.REDIS_URL),
      reportUrlSecret: Boolean(process.env.LYF9_REPORT_URL_SECRET),
      storageConfigured: Boolean(
        process.env.S3_REPORT_BUCKET ||
          process.env.STORAGE_PROVIDER === "local" ||
          process.env.STORAGE_PROVIDER === "mock"
      ),
      supabaseAnonConfigured: Boolean(supabase.url && supabase.anonKey),
      supabaseServerKeyType: getSupabaseServerKeyType(),
      supabaseServiceRoleConfigured: supabase.serviceRoleKeyConfigured,
      store
    },
    mode: {
      authProvider: getAuthProviderMode(),
      storageProvider: process.env.STORAGE_PROVIDER ?? "local"
    },
    service: "web",
    status: store.ok && supabase.serviceRoleKeyConfigured && Boolean(supabase.url && supabase.anonKey) &&
      (!deployed || (inngestConfigured && ai.readyForReportPipeline))
      ? "ok"
      : "degraded"
  });
}
