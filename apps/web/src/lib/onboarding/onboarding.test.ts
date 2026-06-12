import { describe, expect, it } from "vitest";

import {
  buildConsentRecords,
  hasRequiredConsent
} from "./consent";
import { validateHealthProfile, validateQuestionnaire } from "./validation";

describe("profile validation", () => {
  it("accepts a complete health profile", () => {
    const result = validateHealthProfile({
      ageYears: "32",
      city: "Mumbai",
      dateOfBirth: "",
      gender: "female",
      heightCm: "165",
      name: "Asha",
      weightKg: "62"
    });

    expect(result.ok).toBe(true);
  });

  it("rejects missing profile fields", () => {
    const result = validateHealthProfile({
      ageYears: "",
      city: "",
      dateOfBirth: "",
      gender: "",
      heightCm: "",
      name: "",
      weightKg: ""
    });

    expect(result.ok).toBe(false);
    expect(result.errors.name).toBeTruthy();
    expect(result.errors.ageYears).toBeTruthy();
  });
});

describe("questionnaire validation", () => {
  it("requires medicines and goals fields to be explicit", () => {
    const result = validateQuestionnaire({
      allergies: "",
      currentMedicines: "",
      dietLifestyle: "",
      familyHistory: "",
      healthGoals: "",
      knownConditions: "",
      sleepStressActivity: "",
      surgeries: "",
      symptoms: ""
    });

    expect(result.ok).toBe(false);
    expect(result.errors.currentMedicines).toBeTruthy();
    expect(result.errors.healthGoals).toBeTruthy();
  });
});

describe("consent persistence and gate", () => {
  const choices = {
    ai_analysis: true,
    doctor_review: false,
    lab_report_processing: true,
    marketing_communication: false,
    reminders_notifications: true
  };

  it("builds purpose-wise consent records with metadata", () => {
    const records = buildConsentRecords(choices, {
      ipAddress: "127.0.0.1",
      timestamp: "2026-06-05T12:00:00.000Z",
      userAgent: "vitest"
    });

    expect(records).toHaveLength(5);
    expect(records[0]).toMatchObject({
      grantedAt: "2026-06-05T12:00:00.000Z",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      version: "private_beta_v1"
    });
    expect(records.find((record) => record.consentType === "doctor_review")).toMatchObject({
      granted: false,
      revokedAt: "2026-06-05T12:00:00.000Z"
    });
  });

  it("requires lab report processing and AI analysis consent for upload gate", () => {
    expect(hasRequiredConsent(choices)).toBe(true);
    expect(hasRequiredConsent({ ...choices, ai_analysis: false })).toBe(false);
    expect(hasRequiredConsent({ ...choices, lab_report_processing: false })).toBe(false);
  });
});
