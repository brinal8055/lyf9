"use client";

import type {
  ConsentChoices,
  ConsentRecord,
  HealthProfile,
  QuestionnaireResponse
} from "./types";

const PREFIX = "lyf9.phase1";

export function saveHealthProfile(profile: HealthProfile) {
  window.localStorage.setItem(`${PREFIX}.profile`, JSON.stringify(profile));
}

export function loadHealthProfile(): HealthProfile | null {
  return readJson(`${PREFIX}.profile`);
}

export function saveQuestionnaire(response: QuestionnaireResponse) {
  window.localStorage.setItem(`${PREFIX}.questionnaire`, JSON.stringify(response));
}

export function loadQuestionnaire(): QuestionnaireResponse | null {
  return readJson(`${PREFIX}.questionnaire`);
}

export function saveConsentRecords(records: ConsentRecord[]) {
  window.localStorage.setItem(`${PREFIX}.consents`, JSON.stringify(records));
}

export function loadConsentRecords(): ConsentRecord[] {
  return readJson(`${PREFIX}.consents`) ?? [];
}

export function latestConsentChoices(records: ConsentRecord[]): Partial<ConsentChoices> {
  return records.reduce<Partial<ConsentChoices>>((choices, record) => {
    choices[record.consentType] = record.granted;
    return choices;
  }, {});
}

function readJson<T>(key: string): T | null {
  const raw = window.localStorage.getItem(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
