"use client";

import { FormEvent, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  loadQuestionnaire,
  saveQuestionnaire
} from "@/lib/onboarding/storage";
import type { QuestionnaireResponse } from "@/lib/onboarding/types";
import { validateQuestionnaire } from "@/lib/onboarding/validation";

const emptyResponse: QuestionnaireResponse = {
  allergies: "",
  currentMedicines: "",
  dietLifestyle: "",
  familyHistory: "",
  healthGoals: "",
  knownConditions: "",
  sleepStressActivity: "",
  surgeries: "",
  symptoms: ""
};

const fields: Array<{
  key: keyof QuestionnaireResponse;
  label: string;
  placeholder: string;
}> = [
  {
    key: "symptoms",
    label: "Symptoms",
    placeholder: "Fatigue, hair fall, sleep issues, none, or anything relevant"
  },
  {
    key: "knownConditions",
    label: "Known conditions",
    placeholder: "Thyroid, diabetes, PCOS, hypertension, none"
  },
  {
    key: "surgeries",
    label: "Surgeries",
    placeholder: "Past surgeries or none"
  },
  {
    key: "allergies",
    label: "Allergies",
    placeholder: "Medicine or food allergies, or none"
  },
  {
    key: "currentMedicines",
    label: "Current medicines",
    placeholder: "Medicine names and doses, or none"
  },
  {
    key: "familyHistory",
    label: "Family history",
    placeholder: "Diabetes, cardiac risk, thyroid, cancer, none"
  },
  {
    key: "dietLifestyle",
    label: "Diet and lifestyle",
    placeholder: "Vegetarian/non-vegetarian, alcohol, smoking, eating pattern"
  },
  {
    key: "sleepStressActivity",
    label: "Sleep, stress, and activity",
    placeholder: "Sleep hours, stress level, exercise/activity"
  },
  {
    key: "healthGoals",
    label: "Health goals",
    placeholder: "Energy, thyroid tracking, cholesterol, sugar risk, general prevention"
  }
];

export function QuestionnaireForm() {
  const [response, setResponse] = useState<QuestionnaireResponse>(emptyResponse);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setResponse(loadQuestionnaire() ?? emptyResponse);
  }, []);

  function update(key: keyof QuestionnaireResponse, value: string) {
    setSaved(false);
    setResponse((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateQuestionnaire(response);
    setErrors(result.errors);

    if (!result.ok) {
      return;
    }

    const saveResponse = await fetch("/api/questionnaire", {
      body: JSON.stringify(response),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    if (!saveResponse.ok) {
      return;
    }

    const body = (await saveResponse.json()) as { persisted: boolean };
    if (!body.persisted) {
      saveQuestionnaire(response);
    }
    setSaved(true);
  }

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>Health questionnaire</CardTitle>
        <CardContent>
          This context helps future explanations stay cautious and relevant.
          Medicine changes are not recommended by Lyf9 AI.
        </CardContent>
      </CardHeader>
      <form className="grid gap-5" onSubmit={onSubmit}>
        <div className="grid gap-5 lg:grid-cols-2">
          {fields.map((field) => (
            <label className="grid gap-2 text-sm text-muted" key={field.key}>
              {field.label}
              <Textarea
                onChange={(event) => update(field.key, event.target.value)}
                placeholder={field.placeholder}
                value={response[field.key]}
              />
              {errors[field.key] ? (
                <span className="text-danger">{errors[field.key]}</span>
              ) : null}
            </label>
          ))}
        </div>
        {saved ? (
          <Alert>Questionnaire saved.</Alert>
        ) : null}
        <Button type="submit">Save questionnaire</Button>
      </form>
    </Card>
  );
}
