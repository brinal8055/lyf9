import type { Metadata } from "next";
import { Suspense } from "react";

import { ConsentForm } from "@/components/onboarding/consent-form";

export const metadata: Metadata = {
  title: "Consent | Lyf9 AI"
};

export default function ConsentPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-orange">Step 3</p>
        <h1 className="mt-2 text-[36px] font-semibold">Consent</h1>
      </div>
      <Suspense>
        <ConsentForm />
      </Suspense>
    </div>
  );
}
