import { describe, expect, it } from "vitest";

import { createSupabaseServiceClient } from "../auth/providers/supabase-server";
import { createSupabaseAtomicWorkflowProvider } from ".";

const runLiveWorkflow = process.env.RUN_LIVE_SUPABASE_WORKFLOW === "true";

describe.skipIf(!runLiveWorkflow)("live Supabase workflow RPC claiming", () => {
  it("allows only one worker to atomically claim the same seeded job", async () => {
    const jobId = process.env.LIVE_SUPABASE_WORKFLOW_JOB_ID;
    if (!jobId) {
      throw new Error("LIVE_SUPABASE_WORKFLOW_JOB_ID is required when RUN_LIVE_SUPABASE_WORKFLOW=true.");
    }

    const now = new Date().toISOString();
    const serviceClient = createSupabaseServiceClient();
    const reset = await serviceClient
      .from("processing_jobs")
      .update({
        locked_by: null,
        locked_until: null,
        next_run_at: null,
        status: "queued",
        updated_at: now,
        worker_id: null
      })
      .eq("id", jobId);

    if (reset.error) {
      throw new Error(reset.error.message);
    }

    const workflow = createSupabaseAtomicWorkflowProvider();
    const [first, second] = await Promise.all([
      workflow.claimNextJob({ leaseSeconds: 300, now, workerId: "live-worker-a" }),
      workflow.claimNextJob({ leaseSeconds: 300, now, workerId: "live-worker-b" })
    ]);

    const claims = [first, second].filter(Boolean);
    expect(claims).toHaveLength(1);
    expect(claims[0]?.id).toBe(jobId);
    expect(["live-worker-a", "live-worker-b"]).toContain(claims[0]?.lockedBy);
  });
});
