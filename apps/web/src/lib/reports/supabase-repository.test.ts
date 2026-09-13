import { describe, expect, it } from "vitest";

import { toFeedbackEvent, toHealthInsight, toHealthRiskFlag } from "./supabase-repository";

const timestamp = "2026-09-13T10:00:00.000Z";

describe("Supabase report row mapping", () => {
  it("maps a persisted patient explanation to the app domain shape", () => {
    const insight = toHealthInsight({
      ai_model_run_id: "model-run-1",
      created_at: timestamp,
      disclaimer: "Stored disclaimer",
      doctor_review_required: false,
      explanation_json: {
        disclaimer: "Explanation disclaimer",
        markers_needing_attention: [
          {
            biomarker_result_id: "marker-1",
            display_name: "Hemoglobin",
            explanation: "This result is outside the provided lab range.",
            value_display: "10.2 g/dL"
          }
        ],
        normal_markers: [
          {
            biomarker_result_id: "marker-2",
            display_name: "WBC",
            value_display: "7200 /cumm"
          }
        ],
        possible_relevance: ["Review the trend with your doctor."],
        questions_to_ask_doctor: ["Could prior results help interpret this change?"],
        retest_suggestion: "Discuss retest timing with your doctor.",
        source_biomarker_ids: ["marker-1", "marker-2"],
        summary: "One marker may need attention."
      },
      id: "insight-1",
      lab_report_id: "report-1",
      published_at: timestamp,
      report_file_id: "file-1",
      safety_flags: [],
      safety_status: "passed",
      source_biomarker_ids: ["marker-1", "marker-2"],
      status: "ai_only_ready",
      summary: "Stored summary",
      updated_at: timestamp,
      user_id: "user-1"
    });

    expect(insight).toMatchObject({
      disclaimer: "Explanation disclaimer",
      markersNeedingAttention: [
        {
          biomarkerResultId: "marker-1",
          title: "Hemoglobin",
          valueLabel: "10.2 g/dL"
        }
      ],
      normalMarkers: [{ biomarkerResultId: "marker-2", title: "WBC" }],
      questionsToAskDoctor: ["Could prior results help interpret this change?"],
      status: "ai_only_ready",
      summary: "One marker may need attention."
    });
  });

  it("normalizes legacy review statuses and safety flags", () => {
    expect(
      toHealthInsight({
        created_at: timestamp,
        disclaimer: "Disclaimer",
        id: "insight-2",
        lab_report_id: "report-1",
        output_json: { summary: "Review required" },
        status: "doctor_review_pending",
        summary: "Review required",
        updated_at: timestamp,
        user_id: "user-1"
      })
    ).toMatchObject({ doctorReviewRequired: true, status: "doctor_review_required" });

    expect(
      toHealthRiskFlag({
        created_at: timestamp,
        flag_type: "unsafe_ai_output",
        id: "flag-1",
        lab_report_id: "report-1",
        reason: "Safety filter matched.",
        severity: "high",
        source: "safety_filter",
        status: "open",
        user_id: "user-1"
      })
    ).toMatchObject({ flagType: "unsafe_language", severity: "critical" });
  });

  it("publishes the persisted doctor-edited summary while retaining the AI draft", () => {
    const insight = toHealthInsight({
      created_at: timestamp,
      explanation_json: { summary: "Original AI summary." },
      id: "insight-reviewed",
      lab_report_id: "report-1",
      status: "doctor_reviewed",
      summary: "Doctor-reviewed summary.",
      updated_at: timestamp,
      user_id: "user-1"
    });

    expect(insight.summary).toBe("Doctor-reviewed summary.");
    expect(insight.explanationJson).toMatchObject({ summary: "Original AI summary." });
  });

  it("maps persisted feedback fields", () => {
    expect(
      toFeedbackEvent({
        confusing_text: "Reference range",
        created_at: timestamp,
        feedback_surface: "report_result",
        free_text: "Please add more context.",
        helpful: "yes",
        id: "feedback-1",
        report_file_id: "file-1",
        status: "new",
        user_id: "user-1",
        would_trust_doctor_review: "yes"
      })
    ).toMatchObject({
      confusingText: "Reference range",
      feedbackSurface: "report_result",
      reportFileId: "file-1",
      wouldTrustDoctorReview: "yes"
    });
  });
});
