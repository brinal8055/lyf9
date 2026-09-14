import type { ReportType } from "@/lib/reports/types";

/**
 * Medical specialties a doctor can register against.
 *
 * Deliberately coarse: these drive review routing, not a directory listing.
 * A finer taxonomy (e.g. "interventional cardiology") would fragment the
 * assignment pool without improving who is competent to review a lab panel.
 */
export const DOCTOR_SPECIALTIES = [
  "general_physician",
  "internal_medicine",
  "endocrinology",
  "cardiology",
  "hepatology",
  "nephrology",
  "hematology",
  "pathology"
] as const;

export type DoctorSpecialty = (typeof DOCTOR_SPECIALTIES)[number];

const SPECIALTY_LABELS: Record<DoctorSpecialty, string> = {
  cardiology: "Cardiology",
  endocrinology: "Endocrinology",
  general_physician: "General Physician",
  hematology: "Hematology",
  hepatology: "Hepatology",
  internal_medicine: "Internal Medicine",
  nephrology: "Nephrology",
  pathology: "Pathology"
};

/**
 * Report type -> the specialty best suited to review it.
 *
 * This is a *preference*, never a hard gate. `claim_doctor_for_review()`
 * falls through to any approved doctor with capacity when no specialist is
 * free, because a delayed review is worse than a generalist review of a
 * lab panel. Report types with no meaningful specialisation map to null so
 * the assignment function skips the specialty tier entirely rather than
 * filtering the pool down for no clinical benefit.
 */
const REPORT_TYPE_SPECIALTY: Record<ReportType, DoctorSpecialty | null> = {
  cbc: "hematology",
  full_body_supported: null,
  hba1c_glucose: "endocrinology",
  kft: "nephrology",
  lft: "hepatology",
  lipid: "cardiology",
  thyroid: "endocrinology",
  unknown: null,
  unsupported: null,
  urine_limited: null,
  vitamin: null
};

export function specialtyForReportType(reportType: ReportType): DoctorSpecialty | null {
  return REPORT_TYPE_SPECIALTY[reportType] ?? null;
}

export function isDoctorSpecialty(value: unknown): value is DoctorSpecialty {
  return typeof value === "string" && (DOCTOR_SPECIALTIES as readonly string[]).includes(value);
}

/**
 * Filters arbitrary input down to the known specialty set.
 * Applied at the API boundary so an unknown string can never reach
 * `doctor_profiles.specialties` and silently break routing.
 */
export function parseSpecialties(input: unknown): DoctorSpecialty[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<DoctorSpecialty>();

  for (const entry of input) {
    if (isDoctorSpecialty(entry)) {
      seen.add(entry);
    }
  }

  return [...seen];
}

export function specialtyLabel(specialty: DoctorSpecialty): string {
  return SPECIALTY_LABELS[specialty];
}
