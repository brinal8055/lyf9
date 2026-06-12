export type HealthProfile = {
  name: string;
  dateOfBirth: string;
  ageYears: string;
  gender: string;
  heightCm: string;
  weightKg: string;
  city: string;
};

export type QuestionnaireResponse = {
  symptoms: string;
  knownConditions: string;
  surgeries: string;
  allergies: string;
  currentMedicines: string;
  familyHistory: string;
  dietLifestyle: string;
  sleepStressActivity: string;
  healthGoals: string;
};

export type ConsentChoices = {
  lab_report_processing: boolean;
  ai_analysis: boolean;
  doctor_review: boolean;
  reminders_notifications: boolean;
  marketing_communication: boolean;
};

export type ConsentMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
};

export type ConsentRecord = {
  consentType: keyof ConsentChoices;
  granted: boolean;
  version: string;
  purpose: string;
  legalTextHash: string;
  grantedAt: string | null;
  revokedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};
