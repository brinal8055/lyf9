"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DOCTOR_SPECIALTIES, specialtyLabel } from "@/lib/doctors/specialties";
import type { DoctorSpecialty } from "@/lib/doctors/specialties";
import { cn } from "@/lib/utils";

type FieldErrors = Record<string, string>;

const COUNCILS = [
  "National Medical Commission (NMC)",
  "Andhra Pradesh Medical Council",
  "Delhi Medical Council",
  "Gujarat Medical Council",
  "Karnataka Medical Council",
  "Maharashtra Medical Council",
  "Tamil Nadu Medical Council",
  "Telangana State Medical Council",
  "West Bengal Medical Council",
  "Other state council"
];

function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function DoctorApplicationForm({ email, token }: { email: string; token: string }) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [specialties, setSpecialties] = useState<DoctorSpecialty[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function toggleSpecialty(specialty: DoctorSpecialty) {
    setSpecialties((current) =>
      current.includes(specialty)
        ? current.filter((entry) => entry !== specialty)
        : [...current, specialty]
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const application = {
      additionalQualifications: splitList(formData.get("additionalQualifications")),
      bio: String(formData.get("bio") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      languages: splitList(formData.get("languages")),
      primaryDegree: String(formData.get("primaryDegree") ?? ""),
      registrationCouncil: String(formData.get("registrationCouncil") ?? ""),
      registrationNumber: String(formData.get("registrationNumber") ?? ""),
      registrationYear: String(formData.get("registrationYear") ?? ""),
      specialties,
      yearsExperience: String(formData.get("yearsExperience") ?? "")
    };

    try {
      const response = await fetch("/api/doctors/apply", {
        body: JSON.stringify({ application, token }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      const body = (await response.json()) as {
        error?: string;
        errors?: FieldErrors;
      };

      if (!response.ok) {
        setErrors(body.errors ?? {});
        setFormError(body.error ?? "Please correct the highlighted fields.");
        return;
      }

      setSubmitted(true);
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Application received</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-muted">
          <p>
            Thanks. Our team will verify your registration details and email you at{" "}
            <span className="text-ivory">{email}</span> once your account is approved.
          </p>
          <p>Verification usually takes 1-2 working days.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Doctor verification details</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <p className="text-sm text-muted">
            Applying as <span className="text-ivory">{email}</span>
          </p>

          <FormField error={errors.fullName} label="Full name" required>
            <Input name="fullName" placeholder="Dr Asha Menon" required />
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              error={errors.registrationNumber}
              label="Medical registration number"
              required
            >
              <Input name="registrationNumber" required />
            </FormField>

            <FormField error={errors.registrationCouncil} label="Registration council" required>
              <Select defaultValue="" name="registrationCouncil" required>
                <option disabled value="">
                  Select a council
                </option>
                {COUNCILS.map((council) => (
                  <option key={council} value={council}>
                    {council}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField error={errors.registrationYear} label="Year of registration">
              <Input name="registrationYear" type="number" />
            </FormField>

            <FormField error={errors.primaryDegree} label="Primary degree" required>
              <Input name="primaryDegree" placeholder="MBBS" required />
            </FormField>

            <FormField error={errors.yearsExperience} label="Years of experience">
              <Input name="yearsExperience" type="number" />
            </FormField>
          </div>

          <FormField
            error={errors.specialties}
            hint="Used to route reports to the right reviewer."
            label="Specialties"
            required
          >
            <div className="flex flex-wrap gap-2 pt-1">
              {DOCTOR_SPECIALTIES.map((specialty) => {
                const active = specialties.includes(specialty);

                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition",
                      active
                        ? "border-orange/60 bg-orange/10 text-orange"
                        : "border-white/10 bg-white/[0.04] text-muted hover:border-orange/40 hover:text-ivory"
                    )}
                    key={specialty}
                    onClick={() => toggleSpecialty(specialty)}
                    type="button"
                  >
                    {specialtyLabel(specialty)}
                  </button>
                );
              })}
            </div>
          </FormField>

          <FormField
            error={errors.additionalQualifications}
            hint="Comma separated"
            label="Additional qualifications"
          >
            <Input name="additionalQualifications" placeholder="MD General Medicine, DNB" />
          </FormField>

          <FormField
            error={errors.languages}
            hint="Comma separated, e.g. en, hi, mr"
            label="Languages"
          >
            <Input name="languages" placeholder="en, hi" />
          </FormField>

          <FormField error={errors.bio} label="Short bio">
            <Textarea name="bio" />
          </FormField>

          {formError ? (
            <p className="text-sm text-danger" role="alert">
              {formError}
            </p>
          ) : null}

          <div>
            <Button isLoading={submitting} type="submit">
              Submit for verification
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
