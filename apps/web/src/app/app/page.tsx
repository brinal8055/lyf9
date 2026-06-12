import Link from "next/link";

import { ENTRY_FLOW_DISCLAIMER } from "@lyf9/shared";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardFeedback } from "@/components/feedback/dashboard-feedback";
import { PricingCards } from "@/components/payments/pricing-cards";

const checklist = [
  ["Profile", "Add basic health context.", "/app/profile"],
  ["Questionnaire", "Capture symptoms, history, lifestyle, and goals.", "/app/questionnaire"],
  ["Consent", "Grant required processing and AI analysis consent.", "/app/consent"]
];

export default function AppHomePage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-orange">Private beta onboarding</p>
        <h1 className="mt-3 text-[36px] font-semibold leading-tight sm:text-[52px]">
          Prepare your Lyf9 AI health profile.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
          Complete profile, questionnaire, and purpose-wise consent before report
          upload is enabled in Phase 2.
        </p>
      </div>
      <Alert>{ENTRY_FLOW_DISCLAIMER}</Alert>
      <div className="grid gap-5 lg:grid-cols-3">
        {checklist.map(([title, text, href]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardContent>{text}</CardContent>
            </CardHeader>
            <Link className={buttonClassName("secondary")} href={href}>
              Continue
            </Link>
          </Card>
        ))}
      </div>
      <PricingCards mode="compact" />
      <DashboardFeedback />
    </div>
  );
}
