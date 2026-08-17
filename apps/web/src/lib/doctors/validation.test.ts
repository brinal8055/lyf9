import { describe, expect, it } from "vitest";

import { parseDoctorApplication } from "./validation";

const validApplication = {
  additionalQualifications: ["MD General Medicine"],
  bio: "Practising internal medicine in Mumbai.",
  fullName: "Dr Asha Menon",
  languages: ["en", "hi"],
  primaryDegree: "MBBS",
  registrationCouncil: "Maharashtra Medical Council",
  registrationNumber: "MMC-2011-48213",
  registrationYear: 2011,
  specialties: ["internal_medicine"],
  yearsExperience: 14
};

describe("doctor application parsing", () => {
  it("accepts a complete application", () => {
    const result = parseDoctorApplication(validApplication);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.fullName).toBe("Dr Asha Menon");
    expect(result.data.specialties).toEqual(["internal_medicine"]);
    expect(result.data.languages).toEqual(["en", "hi"]);
  });

  it("rejects non-object payloads", () => {
    for (const payload of [null, undefined, "string", 42, []]) {
      expect(parseDoctorApplication(payload).ok).toBe(false);
    }
  });

  it("requires a plausible registration number", () => {
    for (const registrationNumber of ["", "ab", "!!!", "x".repeat(40)]) {
      const result = parseDoctorApplication({ ...validApplication, registrationNumber });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.registrationNumber).toBeDefined();
      }
    }
  });

  it("requires at least one known specialty", () => {
    expect(parseDoctorApplication({ ...validApplication, specialties: [] }).ok).toBe(false);

    const unknown = parseDoctorApplication({ ...validApplication, specialties: ["astrology"] });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.errors.specialties).toBeDefined();
    }
  });

  it("strips unknown specialties but keeps valid ones", () => {
    const result = parseDoctorApplication({
      ...validApplication,
      specialties: ["cardiology", "astrology"]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.specialties).toEqual(["cardiology"]);
  });

  it("rejects out-of-range years", () => {
    expect(parseDoctorApplication({ ...validApplication, registrationYear: 1800 }).ok).toBe(false);
    expect(
      parseDoctorApplication({
        ...validApplication,
        registrationYear: new Date().getUTCFullYear() + 5
      }).ok
    ).toBe(false);
    expect(parseDoctorApplication({ ...validApplication, yearsExperience: 200 }).ok).toBe(false);
  });

  it("allows optional numeric fields to be omitted", () => {
    const result = parseDoctorApplication({
      ...validApplication,
      registrationYear: null,
      yearsExperience: null
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.registrationYear).toBeNull();
    expect(result.data.yearsExperience).toBeNull();
  });

  it("defaults languages to English when none supplied", () => {
    const result = parseDoctorApplication({ ...validApplication, languages: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.languages).toEqual(["en"]);
  });

  it("trims whitespace", () => {
    const result = parseDoctorApplication({ ...validApplication, fullName: "  Dr Asha Menon  " });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fullName).toBe("Dr Asha Menon");
  });

  it("collects multiple errors at once", () => {
    const result = parseDoctorApplication({
      ...validApplication,
      fullName: "",
      primaryDegree: "",
      registrationNumber: ""
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.fullName).toBeDefined();
    expect(result.errors.primaryDegree).toBeDefined();
    expect(result.errors.registrationNumber).toBeDefined();
  });
});
