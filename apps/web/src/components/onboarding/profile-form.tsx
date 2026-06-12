"use client";

import { FormEvent, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  loadHealthProfile,
  saveHealthProfile
} from "@/lib/onboarding/storage";
import type { HealthProfile } from "@/lib/onboarding/types";
import { validateHealthProfile } from "@/lib/onboarding/validation";

const emptyProfile: HealthProfile = {
  ageYears: "",
  city: "",
  dateOfBirth: "",
  gender: "",
  heightCm: "",
  name: "",
  weightKg: ""
};

export function ProfileForm() {
  const [profile, setProfile] = useState<HealthProfile>(emptyProfile);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProfile(loadHealthProfile() ?? emptyProfile);
  }, []);

  function update(key: keyof HealthProfile, value: string) {
    setSaved(false);
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateHealthProfile(profile);
    setErrors(result.errors);

    if (!result.ok) {
      return;
    }

    const response = await fetch("/api/profile", {
      body: JSON.stringify(profile),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    if (!response.ok) {
      return;
    }

    const body = (await response.json()) as { persisted: boolean };
    if (!body.persisted) {
      saveHealthProfile(profile);
    }
    setSaved(true);
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Health profile</CardTitle>
        <CardContent>
          Add basic context for future report explanations. This does not enable
          uploads yet.
        </CardContent>
      </CardHeader>
      <form className="grid gap-5" onSubmit={onSubmit}>
        <Field error={errors.name} label="Name">
          <Input
            onChange={(event) => update("name", event.target.value)}
            placeholder="Your name"
            value={profile.name}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field error={errors.ageYears} label="Date of birth">
            <Input
              onChange={(event) => update("dateOfBirth", event.target.value)}
              type="date"
              value={profile.dateOfBirth}
            />
          </Field>
          <Field error={errors.ageYears} label="Age if date of birth is skipped">
            <Input
              inputMode="numeric"
              onChange={(event) => update("ageYears", event.target.value)}
              placeholder="32"
              value={profile.ageYears}
            />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field error={errors.gender} label="Gender">
            <Select
              onChange={(event) => update("gender", event.target.value)}
              value={profile.gender}
            >
              <option className="bg-charcoal" value="">
                Select
              </option>
              <option className="bg-charcoal" value="female">
                Female
              </option>
              <option className="bg-charcoal" value="male">
                Male
              </option>
              <option className="bg-charcoal" value="non_binary">
                Non-binary
              </option>
              <option className="bg-charcoal" value="prefer_not_to_say">
                Prefer not to say
              </option>
            </Select>
          </Field>
          <Field error={errors.heightCm} label="Height">
            <Input
              inputMode="decimal"
              onChange={(event) => update("heightCm", event.target.value)}
              placeholder="170 cm"
              value={profile.heightCm}
            />
          </Field>
          <Field error={errors.weightKg} label="Weight">
            <Input
              inputMode="decimal"
              onChange={(event) => update("weightKg", event.target.value)}
              placeholder="70 kg"
              value={profile.weightKg}
            />
          </Field>
        </div>
        <Field error={errors.city} label="City">
          <Input
            onChange={(event) => update("city", event.target.value)}
            placeholder="Mumbai"
            value={profile.city}
          />
        </Field>
        {saved ? <Alert>Profile saved.</Alert> : null}
        <Button type="submit">Save profile</Button>
      </form>
    </Card>
  );
}

function Field({
  children,
  error,
  label
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm text-muted">
      {label}
      {children}
      {error ? <span className="text-danger">{error}</span> : null}
    </label>
  );
}
