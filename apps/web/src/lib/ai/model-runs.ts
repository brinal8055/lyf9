import { createHash, randomUUID } from "crypto";

import type { ModelRunRecord, ProcessingJobRecord } from "../reports/types";

export function hashModelPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createModelRunRecord(input: {
  errorCode?: string | null;
  errorMessage?: string | null;
  extractedDocumentId?: string | null;
  input: Record<string, unknown>;
  job: ProcessingJobRecord;
  modelName: string;
  output?: Record<string, unknown> | null;
  promptVersion: string;
  provider: string;
  safetyFilterStatus?: ModelRunRecord["safetyFilterStatus"];
  schemaVersion: string;
  status: "succeeded" | "failed";
  taskType: ModelRunRecord["taskType"];
  tokenCount?: number | null;
}) {
  const output = input.output ?? null;
  return {
    costEstimate: 0,
    costEstimateMinorUnits: 0,
    createdAt: new Date().toISOString(),
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    extractedDocumentId: input.extractedDocumentId ?? null,
    id: randomUUID(),
    inputHash: hashModelPayload(input.input),
    labReportId: input.job.labReportId,
    latencyMs: 0,
    modelName: input.modelName,
    outputHash: output ? hashModelPayload(output) : null,
    outputJson: output,
    processingJobId: input.job.id,
    promptVersion: input.promptVersion,
    provider: input.provider,
    reportFileId: input.job.reportFileId,
    safetyFilterStatus: input.safetyFilterStatus ?? null,
    schemaVersion: input.schemaVersion,
    status: input.status,
    taskType: input.taskType,
    tokenCount: input.tokenCount ?? null,
    tokenInputCount: null,
    tokenOutputCount: null,
    userId: input.job.userId
  } satisfies ModelRunRecord;
}
