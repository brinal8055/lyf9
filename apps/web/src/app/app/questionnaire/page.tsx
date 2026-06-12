import type { Metadata } from "next";

import { QuestionnaireForm } from "@/components/onboarding/questionnaire-form";

export const metadata: Metadata = {
  title: "Questionnaire | Lyf9 AI"
};

export default function QuestionnairePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-orange">Step 2</p>
        <h1 className="mt-2 text-[36px] font-semibold">Questionnaire</h1>
      </div>
      <QuestionnaireForm />
    </div>
  );
}
