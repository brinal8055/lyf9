import type { DoctorApplicationInput } from "./types";
import { parseSpecialties } from "./specialties";

export type DoctorApplicationErrors = Partial<
  Record<keyof DoctorApplicationInput | "form", string>
>;

export type DoctorApplicationParseResult =
  | { data: DoctorApplicationInput; ok: true }
  | { errors: DoctorApplicationErrors; ok: false };

const MAX_NAME_LENGTH = 120;
const MAX_BIO_LENGTH = 1000;
const MIN_REGISTRATION_YEAR = 1940;

/**
 * Registration numbers vary by council (NMC and state councils use different
 * formats), so the shape check stays deliberately permissive: alphanumeric
 * with separators, 3-32 chars. Real verification is the manual admin step --
 * this only blocks obvious garbage from reaching the reviewer.
 */
const REGISTRATION_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9./-]{2,31}$/;

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cleaned = value
    .map((entry) => cleanString(entry))
    .filter((entry) => entry.length > 0);

  return [...new Set(cleaned)].slice(0, limit);
}

function parseOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function parseDoctorApplication(input: unknown): DoctorApplicationParseResult {
  const errors: DoctorApplicationErrors = {};

  if (typeof input !== "object" || input === null) {
    return { errors: { form: "Invalid application payload." }, ok: false };
  }

  const raw = input as Record<string, unknown>;

  const fullName = cleanString(raw.fullName);
  if (fullName.length < 2 || fullName.length > MAX_NAME_LENGTH) {
    errors.fullName = "Enter your full name as it appears on your registration.";
  }

  const registrationNumber = cleanString(raw.registrationNumber);
  if (!REGISTRATION_NUMBER_PATTERN.test(registrationNumber)) {
    errors.registrationNumber = "Enter a valid medical registration number.";
  }

  const registrationCouncil = cleanString(raw.registrationCouncil);
  if (registrationCouncil.length < 2) {
    errors.registrationCouncil = "Select the council you are registered with.";
  }

  const primaryDegree = cleanString(raw.primaryDegree);
  if (primaryDegree.length < 2) {
    errors.primaryDegree = "Enter your primary medical degree.";
  }

  const specialties = parseSpecialties(raw.specialties);
  if (specialties.length === 0) {
    errors.specialties = "Select at least one specialty.";
  }

  const registrationYear = parseOptionalInt(raw.registrationYear);
  const currentYear = new Date().getUTCFullYear();
  if (
    registrationYear !== null &&
    (registrationYear < MIN_REGISTRATION_YEAR || registrationYear > currentYear)
  ) {
    errors.registrationYear = "Enter a valid registration year.";
  }

  const yearsExperience = parseOptionalInt(raw.yearsExperience);
  if (yearsExperience !== null && (yearsExperience < 0 || yearsExperience > 80)) {
    errors.yearsExperience = "Enter a valid number of years of experience.";
  }

  const bio = cleanString(raw.bio);
  if (bio.length > MAX_BIO_LENGTH) {
    errors.bio = `Keep your bio under ${MAX_BIO_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { errors, ok: false };
  }

  const languages = cleanStringArray(raw.languages, 10);

  return {
    data: {
      additionalQualifications: cleanStringArray(raw.additionalQualifications, 10),
      bio: bio.length > 0 ? bio : null,
      fullName,
      languages: languages.length > 0 ? languages : ["en"],
      primaryDegree,
      registrationCouncil,
      registrationNumber,
      registrationYear,
      specialties,
      yearsExperience
    },
    ok: true
  };
}
