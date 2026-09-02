import { NextResponse } from "next/server";

import {
  getAuthProviderMode,
  getSupabaseServerConfig,
  getSupabaseServerKeyType
} from "@/lib/auth/providers/supabase-server";
import { isInngestConfigured } from "@/inngest/client";
import { getStoreHealth } from "@/lib/reports/repository";

export async function GET() {
  const store = await getStoreHealth();
  const supabase = getSupabaseServerConfig();
  const deployed = process.env.APP_ENV === "staging" || process.env.APP_ENV === "production";
  const inngestConfigured = isInngestConfigured();
  const aiProvider = (process.env.AI_PROVIDER ?? "unconfigured").toLowerCase();
  const aiConfigured =
    (aiProvider === "gemini" && Boolean(process.env.GEMINI_API_KEY)) ||
    (aiProvider === "openai" && Boolean(process.env.OPENAI_API_KEY)) ||
    (aiProvider === "mock" && process.env.APP_ENV !== "staging" && process.env.APP_ENV !== "production");

  return NextResponse.json({
    checks: {
      aiConfigured,
      aiProvider,
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
      (!deployed || inngestConfigured)
      ? "ok"
      : "degraded"
  });
}
