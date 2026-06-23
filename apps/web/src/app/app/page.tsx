import type { Metadata } from "next";

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
import { PricingCards } from "@/components/payments/pricing-cards";

export const metadata: Metadata = {
  title: "Dashboard | Lyf9 AI"
};

const onboardingProgress: AppHomeProgress = {
  completedTasks: 0,
  totalTasks: ONBOARDING_TASK_COUNT
};

export default function AppHomePage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <AppHomeOverview progress={onboardingProgress} />

      <Alert variant="info" className="border-blue/20 bg-blue/10">
        {ENTRY_FLOW_DISCLAIMER}
      </Alert>

      <OnboardingTaskList />

      <section className="space-y-4" aria-labelledby="beta-pricing-title">
        <h2 id="beta-pricing-title" className="text-xl font-semibold text-ivory">
          Beta pricing
        </h2>
        <PricingCards mode="compact" />
      </section>

      <DashboardFeedback />
    </div>
  );
}
