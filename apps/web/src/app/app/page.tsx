import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ENTRY_FLOW_DISCLAIMER } from "@lyf9/shared";

import {
  AppHomeOverview,
  type AppHomeProgress
} from "@/components/app/app-home-overview";
import {
  ONBOARDING_TASK_COUNT,
  OnboardingTaskList
} from "@/components/app/onboarding-task-list";
import { Alert } from "@/components/ui/alert";
import { DashboardFeedback } from "@/components/feedback/dashboard-feedback";
import {
  getSupabaseUserFromAccessToken,
  shouldUseSupabaseAuth,
  SUPABASE_ACCESS_TOKEN_COOKIE_NAME
} from "@/lib/auth/supabase-auth";
import { getOnboardingTaskStatus } from "@/lib/onboarding/server";

export const metadata: Metadata = {
  title: "Dashboard | Lyf9 AI"
};

async function loadOnboardingProgress(): Promise<AppHomeProgress> {
  if (!shouldUseSupabaseAuth()) {
    return { completedTasks: 0, totalTasks: ONBOARDING_TASK_COUNT };
  }

  const cookieStore = await cookies();
  const user = await getSupabaseUserFromAccessToken(
    cookieStore.get(SUPABASE_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null
  );

  if (!user) {
    return { completedTasks: 0, totalTasks: ONBOARDING_TASK_COUNT };
  }

  const status = await getOnboardingTaskStatus(user.id);
  const completedTasks = [status.profileDone, status.questionnaireDone, status.consentDone].filter(
    Boolean
  ).length;

  return { completedTasks, totalTasks: ONBOARDING_TASK_COUNT };
}

export default async function AppHomePage() {
  const onboardingProgress = await loadOnboardingProgress();

  return (
    <div className="space-y-8 animate-fade-in">
      <AppHomeOverview progress={onboardingProgress} />

      <Alert variant="info" className="border-blue/20 bg-blue/10">
        {ENTRY_FLOW_DISCLAIMER}
      </Alert>

      <OnboardingTaskList />

      <section className="space-y-4" aria-labelledby="beta-pricing-title">
        <h2 id="beta-pricing-title" className="text-xl font-semibold text-ivory">
          Beta access
        </h2>
        <Alert variant="success" className="border-green/20 bg-green/10">
          Everything is free during the private beta. Report uploads, AI-assisted explanations,
          and doctor review are included at no cost while we validate the product.
        </Alert>
      </section>

      <DashboardFeedback />
    </div>
  );
}
