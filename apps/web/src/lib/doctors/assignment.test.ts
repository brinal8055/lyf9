import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/lib/auth/providers/supabase-server", () => ({
  createSupabaseServiceClient: () => ({ rpc: rpcMock })
}));

const { claimDoctorForReview } = await import("./assignment");

/**
 * Selection logic itself lives in SQL (claim_doctor_for_review) and is covered
 * by the live RLS/workflow suites. These tests pin the contract this module
 * owns: which specialty gets requested, that continuity is threaded through,
 * and that "nobody available" stays a non-throwing outcome.
 */
describe("claimDoctorForReview", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  function mockRpc({ claimed, previous }: { claimed: string | null; previous: string | null }) {
    rpcMock.mockImplementation((fn: string) =>
      Promise.resolve({
        data: fn === "previous_doctor_for_user" ? previous : claimed,
        error: null
      })
    );
  }

  it("derives the required specialty from the report type", async () => {
    mockRpc({ claimed: "doctor-1", previous: null });

    const result = await claimDoctorForReview({
      priority: "standard",
      reportType: "lipid",
      userId: "user-1"
    });

    expect(result.requiredSpecialty).toBe("cardiology");
    expect(result.assignedDoctorId).toBe("doctor-1");
    expect(result.reason).toBe("assigned");

    const claimCall = rpcMock.mock.calls.find(([fn]) => fn === "claim_doctor_for_review");
    expect(claimCall?.[1]).toMatchObject({
      p_priority: "standard",
      p_required_specialty: "cardiology"
    });
  });

  it("passes a null specialty for report types with no specialisation", async () => {
    mockRpc({ claimed: "doctor-1", previous: null });

    const result = await claimDoctorForReview({
      priority: "standard",
      reportType: "full_body_supported",
      userId: "user-1"
    });

    expect(result.requiredSpecialty).toBeNull();

    const claimCall = rpcMock.mock.calls.find(([fn]) => fn === "claim_doctor_for_review");
    expect(claimCall?.[1]).toMatchObject({ p_required_specialty: null });
  });

  it("threads the previous reviewer through as the continuity preference", async () => {
    mockRpc({ claimed: "doctor-9", previous: "doctor-9" });

    await claimDoctorForReview({
      priority: "standard",
      reportType: "cbc",
      userId: "user-1"
    });

    const claimCall = rpcMock.mock.calls.find(([fn]) => fn === "claim_doctor_for_review");
    expect(claimCall?.[1]).toMatchObject({ p_preferred_doctor: "doctor-9" });
  });

  it("reports no_doctor_available without throwing when nobody has capacity", async () => {
    mockRpc({ claimed: null, previous: null });

    const result = await claimDoctorForReview({
      priority: "standard",
      reportType: "cbc",
      userId: "user-1"
    });

    expect(result.assignedDoctorId).toBeNull();
    expect(result.reason).toBe("no_doctor_available");
  });

  it("forwards urgent priority so the overflow tier can engage", async () => {
    mockRpc({ claimed: "doctor-2", previous: null });

    await claimDoctorForReview({
      priority: "urgent",
      reportType: "kft",
      userId: "user-1"
    });

    const claimCall = rpcMock.mock.calls.find(([fn]) => fn === "claim_doctor_for_review");
    expect(claimCall?.[1]).toMatchObject({ p_priority: "urgent" });
  });

  it("throws when the claim itself fails", async () => {
    rpcMock.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "previous_doctor_for_user"
          ? { data: null, error: null }
          : { data: null, error: { message: "connection reset" } }
      )
    );

    await expect(
      claimDoctorForReview({ priority: "standard", reportType: "cbc", userId: "user-1" })
    ).rejects.toThrow(/doctor_claim_failed/);
  });
});
