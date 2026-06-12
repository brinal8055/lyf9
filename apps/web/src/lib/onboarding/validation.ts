import type { HealthProfile, QuestionnaireResponse } from "./types";

export function validateHealthProfile(profile: HealthProfile) {
  const errors: Record<string, string> = {};
  const hasDob = Boolean(profile.dateOfBirth);
  const age = Number(profile.ageYears);
  const height = Number(profile.heightCm);
  const weight = Number(profile.weightKg);

  if (profile.name.trim().length < 2) {
    errors.name = "Enter your name.";
  }

  if (!hasDob && (!Number.isFinite(age) || age < 13 || age > 120)) {
    errors.ageYears = "Enter a valid age or date of birth.";
  }

  if (!profile.gender) {
    errors.gender = "Select a gender.";
  }

  if (!Number.isFinite(height) || height < 90 || height > 250) {
    errors.heightCm = "Enter height in cm.";
  }

  if (!Number.isFinite(weight) || weight < 25 || weight > 300) {
    errors.weightKg = "Enter weight in kg.";
  }

  if (profile.city.trim().length < 2) {
    errors.city = "Enter your city.";
  }

  return { errors, ok: Object.keys(errors).length === 0 };
}

export function validateQuestionnaire(response: QuestionnaireResponse) {
  const errors: Record<string, string> = {};

  if (response.healthGoals.trim().length < 3) {
    errors.healthGoals = "Add at least one health goal.";
  }

  if (response.currentMedicines.trim().length === 0) {
    errors.currentMedicines = "Enter current medicines or write none.";
  }

  return { errors, ok: Object.keys(errors).length === 0 };
}
