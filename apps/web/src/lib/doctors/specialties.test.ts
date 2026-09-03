import { describe, expect, it } from "vitest";

import type { ReportType } from "@/lib/reports/types";

import {
  DOCTOR_SPECIALTIES,
  isDoctorSpecialty,
  parseSpecialties,
  specialtyForReportType,
  specialtyLabel
} from "./specialties";

const ALL_REPORT_TYPES: ReportType[] = [
  "cbc",
  "lipid",
  "thyroid",
  "lft",
  "kft",
  "hba1c_glucose",
  "vitamin",
  "full_body_supported",
  "urine_limited",
  "unsupported",
  "unknown"
];

describe("report type to specialty routing", () => {
  it("maps every report type to a known specialty or null", () => {
    for (const reportType of ALL_REPORT_TYPES) {
      const specialty = specialtyForReportType(reportType);
      expect(specialty === null || isDoctorSpecialty(specialty)).toBe(true);
    }
  });

  it("routes clinical panels to their matching specialty", () => {
    expect(specialtyForReportType("cbc")).toBe("hematology");
    expect(specialtyForReportType("lipid")).toBe("cardiology");
    expect(specialtyForReportType("thyroid")).toBe("endocrinology");
    expect(specialtyForReportType("hba1c_glucose")).toBe("endocrinology");
    expect(specialtyForReportType("lft")).toBe("hepatology");
    expect(specialtyForReportType("kft")).toBe("nephrology");
  });

  it("skips the specialty tier for non-specialised report types", () => {
    expect(specialtyForReportType("full_body_supported")).toBeNull();
    expect(specialtyForReportType("vitamin")).toBeNull();
    expect(specialtyForReportType("urine_limited")).toBeNull();
    expect(specialtyForReportType("unknown")).toBeNull();
    expect(specialtyForReportType("unsupported")).toBeNull();
  });
});

describe("specialty parsing", () => {
  it("rejects unknown values", () => {
    expect(parseSpecialties(["cardiology", "astrology"])).toEqual(["cardiology"]);
    expect(parseSpecialties("cardiology")).toEqual([]);
    expect(parseSpecialties(null)).toEqual([]);
    expect(parseSpecialties([])).toEqual([]);
  });

  it("de-duplicates", () => {
    expect(parseSpecialties(["cardiology", "cardiology"])).toEqual(["cardiology"]);
  });
});

describe("specialty labels", () => {
  it("provides a display label for every specialty", () => {
    for (const specialty of DOCTOR_SPECIALTIES) {
      expect(specialtyLabel(specialty).length).toBeGreaterThan(0);
    }
  });
});
