export const PRODUCT_NAME = "Lyf9 AI";
export const PRODUCT_DOMAIN = "lyf9.ai";
export const PRODUCT_SHORT_NAME = "Lyf9";

export const REQUIRED_DISCLAIMER =
  "This is an AI-assisted explanation, not a diagnosis or prescription. Please discuss important findings with a qualified doctor.";

export const ENTRY_FLOW_DISCLAIMER =
  "Lyf9 AI provides AI-assisted report explanations, not diagnosis or prescription. Doctor review is required for medical decisions.";

export const CRITICAL_VALUE_DISCLAIMER =
  "This value may need urgent medical attention, especially if you have symptoms. Please contact a qualified doctor or seek urgent care.";

export const UNSUPPORTED_REPORT_FALLBACK =
  "This report type is not supported for automated interpretation yet. You can still store it in your Lyf9 AI health timeline, but Lyf9 AI will not generate AI-only medical insights for it. Please consult a qualified doctor for interpretation.";

export const SUPPORTED_REPORT_TYPES = [
  "CBC",
  "Lipid profile",
  "Thyroid profile",
  "Liver function test",
  "Kidney function test",
  "HbA1c/glucose",
  "Vitamin D, B12, ferritin",
  "Full-body checkups with supported panels",
  "Basic urine routine limited beta"
] as const;

export const UNSUPPORTED_REPORT_TYPES = [
  "Radiology scans",
  "X-ray, CT, MRI, ultrasound",
  "ECG/EEG",
  "Biopsy/histopathology",
  "Pregnancy/fetal reports",
  "Pediatric reports",
  "Cancer marker interpretation as standalone advice",
  "Emergency diagnosis",
  "Prescription change advice"
] as const;

export const CONSENT_VERSION = "private_beta_v1";

export const REQUIRED_CONSENT_TYPES = [
  "lab_report_processing",
  "ai_analysis"
] as const;

export const OPTIONAL_CONSENT_TYPES = [
  "doctor_review",
  "reminders_notifications",
  "marketing_communication"
] as const;

export const DESIGN_TOKENS = {
  colors: {
    ink: "#050505",
    charcoal: "#101010",
    card: "#171717",
    elevated: "#202020",
    ivory: "#F7F4ED",
    muted: "#A7A29A",
    dim: "#6F6A63",
    orange: "#FF6A3D",
    green: "#45D6A2",
    blue: "#5B7CFA",
    yellow: "#F5B65A",
    violet: "#C084FC",
    danger: "#FF4D4D",
    success: "#6FE7B1",
    cream: "#F6F1E8",
    lightCard: "#FFFDF7"
  },
  radius: {
    smallUi: "12px",
    compactCard: "20px",
    largeCard: "28px",
    featurePanel: "36px",
    pill: "999px"
  },
  layout: {
    maxContainer: "1280px",
    navbarHeight: "72px",
    announcementBarHeight: "36px"
  }
} as const;
