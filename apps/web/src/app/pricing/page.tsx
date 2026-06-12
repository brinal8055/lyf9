import type { Metadata } from "next";

import { Alert } from "@/components/ui/alert";
import { PricingCards } from "@/components/payments/pricing-cards";

export const metadata: Metadata = {
  title: "Pricing | Lyf9 AI"
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-ink px-5 py-12 text-ivory sm:px-8">
      <div className="mx-auto max-w-shell space-y-8">
        <div>
          <p className="text-sm text-orange">Private beta pricing</p>
          <h1 className="mt-3 text-[40px] font-semibold leading-tight sm:text-[64px]">
            Simple placeholders for early pricing validation.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
            Lyf9 AI is testing willingness to pay during a controlled private beta.
            Public paid launch is not enabled by default.
          </p>
        </div>
        <Alert>
          Doctor-reviewed output is reviewed by a doctor. AI-only output is an AI-assisted explanation.
          Neither is a diagnosis or prescription. Legal review is required before public paid launch.
        </Alert>
        <PricingCards />
      </div>
    </main>
  );
}
