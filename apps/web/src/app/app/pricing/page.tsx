import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { PricingCards } from "@/components/payments/pricing-cards";

export const metadata: Metadata = {
  title: "Private beta pricing | Lyf9 AI"
};

export default function AppPricingPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-orange">Private beta pricing</p>
        <h1 className="mt-2 text-[36px] font-semibold">Pricing placeholders</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Use sandbox placeholders to validate purchase intent. Public paid launch is disabled until legal review is complete.
        </p>
      </div>
      <Alert>
        Doctor-reviewed output is different from AI-only output. Lyf9 AI provides explanations, not diagnosis or prescription.
      </Alert>
      <PricingCards mode="compact" />
    </div>
  );
}
