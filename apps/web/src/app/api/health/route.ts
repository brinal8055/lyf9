import { NextResponse } from "next/server";

import { getAuthProviderMode, getSupabaseServerConfig } from "@/lib/auth/providers/supabase-server";
import { getStoreHealth } from "@/lib/reports/repository";

export async function GET() {
  const store = await getStoreHealth();
  const supabase = getSupabaseServerConfig();

  return NextResponse.json({
    checks: {
      authSecret: Boolean(process.env.LYF9_AUTH_SECRET),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      emailConfigured: Boolean(process.env.EMAIL_PROVIDER),
      openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
      paymentSandboxConfigured: Boolean(process.env.RAZORPAY_KEY_ID),
      queueConfigured: Boolean(process.env.REDIS_URL),
      reportUrlSecret: Boolean(process.env.LYF9_REPORT_URL_SECRET),
      storageConfigured: Boolean(
        process.env.S3_REPORT_BUCKET ||
          process.env.STORAGE_PROVIDER === "local" ||
          process.env.STORAGE_PROVIDER === "mock"
      ),
      supabaseAnonConfigured: Boolean(supabase.url && supabase.anonKey),
      supabaseServiceRoleConfigured: supabase.serviceRoleKeyConfigured,
      store
    },
    mode: {
      authProvider: getAuthProviderMode(),
      storageProvider: process.env.STORAGE_PROVIDER ?? "local"
    },
    service: "web",
    status: store.ok ? "ok" : "degraded"
  });
}
