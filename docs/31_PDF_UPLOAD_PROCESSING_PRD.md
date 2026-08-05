# 31 — PDF Upload & AI Processing Pipeline
## Product Requirements Document + Architecture

*Last updated: June 2026 | Status: Design-complete, ready for implementation*
*Architecture decision: Saga Orchestration pattern (Inngest) — approved by TL, replaces Redis queue approach*

---

## 1. Problem Statement

Users upload physical or digital lab reports in PDF or image format. The goal is to ingest those files safely, extract every biomarker with exact source values, and surface a structured, doctor-reviewable explanation — all without any human touching the raw file outside of audit trails.

The pipeline must:
- Accept PDFs and images with sub-2 s upload acknowledgement
- Process multiple files in parallel without double-processing
- Extract structured data with zero hallucinated values
- Always produce a valid typed output schema — never free-form text alone
- Fail safely with a clear status if any layer cannot complete

---

## 2. User Journey

```
User                    Lyf9 Web              Processing Pipeline           Storage
 │                         │                          │                        │
 │  Select / drag PDF      │                          │                        │
 │─────────────────────────▶                          │                        │
 │                         │  POST /api/reports/init  │                        │
 │                         │─────────────────────────▶                        │
 │  Signed upload URL      │                          │  Create job record     │
 │◀─────────────────────────                         │◀───────────────────────│
 │                         │                          │                        │
 │  PUT file to storage    │                          │                        │
 │──────────────────────────────────────────────────────────────────────────▶ │
 │                         │                          │                        │
 │  POST /api/reports/confirm                         │                        │
 │─────────────────────────▶                          │                        │
 │                         │  inngest.send(report/confirmed)                    │
 │  ← 202 Accepted         │─────────────────────────▶                        │
 │                         │                          │                        │
 │  Poll /api/reports/{id}/status (or SSE/webhook)    │                        │
 │─────────────────────────▶                          │                        │
 │  ← { status, progress } │                          │                        │
```

**User-visible states:**

| Phase | Label shown | Detail |
|-------|-------------|--------|
| Upload | Uploading… | Progress bar from PUT |
| Scan | Checking file… | Malware / MIME scan |
| Reading | Reading report… | Text extraction |
| Analysing | Analysing biomarkers… | AI extraction |
| Review | Doctor review needed | Routing to doctor |
| Ready | Results ready | Link to result page |
| Error | Processing failed | With support link |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1 — Ingestion                                            │
│  Next.js /api/reports/*  →  Supabase Storage private bucket     │
│  Validates: MIME, size, checksum, consent cookie, auth session  │
└────────────────────────────┬────────────────────────────────────┘
                             │ processing_job record created
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2 — Saga Orchestration  (Inngest durable functions)      │
│  • ProcessReportSaga triggered by "report/confirmed" event      │
│  • Each step() is a durable checkpoint — crash-safe resume     │
│  • Malware scan → classify → metadata → extract → AI → route   │
│  • Compensating transactions roll back on failure               │
│  • State lives in Postgres, not a queue                         │
└────────────────────────────┬────────────────────────────────────┘
                             │ classified, clean file confirmed
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3 — Document Extraction                                  │
│  • Primary: Marker API  (tables, headers → structured markdown) │
│  • Fallback: AWS Textract OCR  (image-heavy or scanned PDFs)   │
│  • Output: raw_markdown + page_metadata JSON                    │
│  • Stored in extracted_documents table                          │
└────────────────────────────┬────────────────────────────────────┘
                             │ markdown + metadata ready
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4 — AI Structured Output  (OpenAI gpt-4o)               │
│  • Prompt: system rules + extracted markdown                    │
│  • Response format: strict Zod schema → JSON                    │
│  • Output: BiomarkerExtractionResult validated at schema level  │
│  • Safety filter: validateSafeExplanation() before storing      │
│  • Stored in biomarker_results + model_runs tables              │
└────────────────────────────┬────────────────────────────────────┘
                             │ validated structured result
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 5 — Routing & Storage                                    │
│  • Route to doctor review if critical / low-confidence         │
│  • Generate patient-facing health_insights record               │
│  • Mark report_file status = published / doctor_review_required │
│  • Trigger notification to user                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Layer 1 — Ingestion API

### Endpoints

**`POST /api/reports/init`** — Pre-upload initialisation

Request:
```typescript
{
  filename: string;        // "report_jan_2026.pdf"
  mimeType: string;        // "application/pdf" | "image/jpeg" | "image/png"
  fileSizeBytes: number;
  sha256Checksum: string;  // hex, computed client-side before upload
}
```

Response `201`:
```typescript
{
  reportFileId: string;         // UUID
  uploadUrl: string;            // signed Supabase Storage PUT URL (10 min TTL)
  uploadKey: string;            // storage object key
  expiresAt: string;            // ISO timestamp
}
```

Errors:
- `400` — invalid MIME, file too large (>20 MB), missing checksum
- `401` — not authenticated
- `403` — consent cookie `required-consent=true` missing
- `409` — duplicate checksum for this user (same file already processed)

---

**`POST /api/reports/confirm`** — Trigger processing after upload completes

Request:
```typescript
{
  reportFileId: string;
  uploadKey: string;
}
```

Response `202`:
```typescript
{
  reportFileId: string;
  jobId: string;
  status: "queued";
  pollUrl: string;   // "/api/reports/{reportFileId}/status"
}
```

---

**`GET /api/reports/[id]/status`** — Poll or SSE stream for progress

Response:
```typescript
{
  reportFileId: string;
  status: ReportProcessingStatus;  // enum from types.ts
  currentStep: string;
  completedSteps: string[];
  estimatedSecondsRemaining: number | null;
  resultUrl: string | null;        // non-null when published
  errorCode: string | null;
}
```

---

### Validation Rules

| Field | Rule |
|-------|------|
| `mimeType` | `application/pdf`, `image/jpeg`, `image/png`, `image/webp` only |
| `fileSizeBytes` | Max 20 MB |
| `sha256Checksum` | Hex string, 64 chars — verified server-side after upload |
| Auth | Valid Supabase session cookie required |
| Consent | `required-consent=true` cookie required |
| RLS | Storage bucket is private; only service-role key can write |

---

## 5. Layer 2 — Saga Orchestration (Inngest)

### Why Inngest over Redis

The TL-approved decision replaces a Redis queue + worker poll model with **Inngest durable functions**. Key reasons:

| Concern | Redis approach | Inngest Saga |
| ------- | ------------- | ----------- |
| Crash recovery | Replay from queue top | Resume from last `step.run()` checkpoint |
| Partial failure | Whole job reruns | Only failing step reruns |
| Double-processing | Atomic BRPOPLPUSH | Inngest guarantees exactly-once per event |
| State location | Redis memory + DB | Postgres only — no extra infra |
| Observability | Custom logs | Built-in execution graph dashboard |
| Compensating txns | Manual dead-letter | Structured `catch` with undo steps |
| Local dev | Docker Redis | `npx inngest-cli@latest dev` |

### Saga Setup

```typescript
// apps/web/src/inngest/client.ts
import { Inngest } from "inngest";
export const inngest = new Inngest({ id: "lyf9" });
```

```typescript
// apps/web/src/app/api/inngest/route.ts  ← Inngest webhook handler
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { processReport } from "@/inngest/process-report";

export const { GET, POST, PUT } = serve({ client: inngest, functions: [processReport] });
```

### ProcessReportSaga — Full Orchestrator

```typescript
// apps/web/src/inngest/process-report.ts

export const processReport = inngest.createFunction(
  {
    id: "process-report",
    retries: 3,
    concurrency: { limit: 10 },        // max 10 reports in parallel
  },
  { event: "report/confirmed" },

  async ({ event, step }) => {
    const { reportFileId } = event.data;
    const completedSteps: string[] = [];

    try {
      // ── Step 1: Malware scan ─────────────────────────────────────
      // step.run() is a durable checkpoint — if this server restarts,
      // Inngest replays from here using the cached result, not re-running.
      const scanResult = await step.run("malware-scan", async () => {
        await updateReportStatus(reportFileId, "scan_pending");
        const result = await runMalwareScan(reportFileId);
        await updateReportStatus(reportFileId, "scan_passed");
        return result;
      });
      completedSteps.push("malware-scan");

      // ── Step 2: Classify report ──────────────────────────────────
      const classification = await step.run("classify-report", async () => {
        return await classifyReport(reportFileId, scanResult.storageKey);
      });
      completedSteps.push("classify-report");

      if (classification.type === "unsupported") {
        await step.run("mark-unsupported", async () => {
          await updateReportStatus(reportFileId, "unsupported");
          await notifyUser(reportFileId, "unsupported");
        });
        return { status: "unsupported", reportFileId };
      }

      // ── Step 3: Extract metadata (cheap, pre-AI) ─────────────────
      const metadata = await step.run("extract-metadata", async () => {
        return await extractReportMetadata(reportFileId);
      });
      completedSteps.push("extract-metadata");

      // ── Step 4: Document extraction (Marker → Textract fallback) ─
      const extraction = await step.run("extract-document", async () => {
        await updateReportStatus(reportFileId, "text_extraction_pending");
        const result = await extractDocument(reportFileId, classification.type);
        await updateReportStatus(reportFileId, "text_extracted");
        return result;
      });
      completedSteps.push("extract-document");

      // ── Step 5: AI biomarker extraction ──────────────────────────
      const biomarkers = await step.run("extract-biomarkers", async () => {
        await updateReportStatus(reportFileId, "biomarker_extraction_pending");
        const result = await extractBiomarkers(
          extraction.rawMarkdown,
          classification.type,
        );
        await updateReportStatus(reportFileId, "biomarker_extracted");
        return result;
      });
      completedSteps.push("extract-biomarkers");

      // ── Step 6: Route and publish ─────────────────────────────────
      await step.run("route-and-publish", async () => {
        await routeAndPublish(reportFileId, biomarkers, metadata);
      });

      return { status: "published", reportFileId };

    } catch (error) {
      // ── Saga compensation — undo committed steps in reverse ───────
      await step.run("compensate", async () => {
        for (const s of [...completedSteps].reverse()) {
          await compensate(reportFileId, s);
        }
        await updateReportStatus(reportFileId, "failed");
        await notifyUser(reportFileId, "failed");
      });
      throw error;   // re-throw so Inngest marks the run as failed
    }
  },
);
```

### Compensating Transactions

Each step has a corresponding undo that runs if a later step fails:

```typescript
// apps/web/src/inngest/compensations.ts

const COMPENSATIONS: Record<string, (id: string) => Promise<void>> = {
  "malware-scan":      async (id) => { /* scan result is idempotent — no-op */ },
  "classify-report":   async (id) => { /* no side effects to reverse */ },
  "extract-metadata":  async (id) => { /* metadata write is safe to leave */ },
  "extract-document":  async (id) => {
    await supabase.from("extracted_documents").delete().eq("report_file_id", id);
  },
  "extract-biomarkers": async (id) => {
    await supabase.from("biomarker_results").delete().eq("report_file_id", id);
    await supabase.from("model_runs").update({ status: "compensated" }).eq("report_file_id", id);
  },
};

export async function compensate(reportFileId: string, stepName: string) {
  await COMPENSATIONS[stepName]?.(reportFileId);
  await writeJobStep(reportFileId, stepName, "compensated");
}
```

### Classification Signals (TypeScript, not Python)

```typescript
// apps/web/src/lib/reports/classification.ts

const CLASSIFICATION_SIGNALS: Record<string, string[]> = {
  CBC:      ["haemoglobin", "hb", "wbc", "platelet", "rbc"],
  Lipid:    ["ldl", "hdl", "triglyceride", "cholesterol"],
  Thyroid:  ["tsh", "t3", "t4", "free t3", "free t4"],
  Liver:    ["sgot", "sgpt", "alt", "ast", "bilirubin"],
  Kidney:   ["creatinine", "bun", "gfr", "uric acid"],
  HbA1c:   ["hba1c", "glycated haemoglobin", "fasting glucose"],
  Vitamins: ["vitamin d", "vitamin b12", "ferritin", "iron"],
};

export function classifyReportText(text: string): string {
  const lower = text.toLowerCase();
  for (const [type, signals] of Object.entries(CLASSIFICATION_SIGNALS)) {
    const matchCount = signals.filter((s) => lower.includes(s)).length;
    if (matchCount >= 2) return type;
  }
  return "unsupported";
}
```

### Triggering the Saga from the API

```typescript
// apps/web/src/app/api/reports/confirm/route.ts

await inngest.send({
  name: "report/confirmed",
  data: { reportFileId, uploadKey, userId: session.userId },
});
```

No worker to deploy, no Redis to manage. The Inngest webhook handler (`/api/inngest`) receives execution instructions from Inngest's cloud scheduler.

---

## 6. Layer 3 — Document Extraction

### DocumentParser Interface

```typescript
// apps/web/src/lib/reports/parser.ts
interface DocumentParser {
  extract(input: DocumentParserInput): Promise<DocumentParserOutput>;
}

interface DocumentParserInput {
  storageKey: string;
  mimeType: string;
  reportFileId: string;
}

interface DocumentParserOutput {
  rawMarkdown: string;
  pageMetadata: PageMetadata[];
  extractionMethod: "native_text" | "ocr";
  confidence: number;
  tableCount: number;
  pageCount: number;
}

interface PageMetadata {
  pageNumber: number;
  hasTable: boolean;
  textLength: number;
  ocrApplied: boolean;
}
```

### Primary Path: Marker API

Marker converts PDFs and images to well-structured markdown, preserving table structure. This is the default path for native-text PDFs.

```typescript
// apps/web/src/lib/reports/providers/marker-parser.ts
class MarkerDocumentParser implements DocumentParser {
  async extract(input: DocumentParserInput): Promise<DocumentParserOutput> {
    const fileBuffer = await downloadFromStorage(input.storageKey);
    const response = await this.markerClient.convert(fileBuffer, {
      outputFormats: ["markdown"],
      extractTables: true,
    });
    return {
      rawMarkdown: response.markdown,
      pageMetadata: response.pages.map(mapPageMeta),
      extractionMethod: "native_text",
      confidence: response.confidence ?? 1.0,
      tableCount: response.tableCount,
      pageCount: response.pageCount,
    };
  }
}
```

### Fallback Path: AWS Textract OCR

Triggered when Marker returns `confidence < 0.6` or `textLength < 200`.

```typescript
class TextractDocumentParser implements DocumentParser {
  async extract(input: DocumentParserInput): Promise<DocumentParserOutput> {
    const job = await this.textract.startDocumentAnalysis({
      FeatureTypes: ["TABLES", "FORMS"],
      DocumentLocation: { S3Object: { Bucket: BUCKET, Name: input.storageKey } },
    });
    const result = await this.poll(job.JobId);
    return {
      rawMarkdown: blocksToMarkdown(result.Blocks),
      pageMetadata: buildPageMeta(result.Blocks),
      extractionMethod: "ocr",
      confidence: result.DocumentMetadata?.Pages ? 0.85 : 0.5,
      tableCount: countTables(result.Blocks),
      pageCount: result.DocumentMetadata?.Pages ?? 1,
    };
  }
}
```

### Storage

All extraction output is stored in `extracted_documents`:

```sql
-- From migration 202606060006
CREATE TABLE extracted_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_file_id UUID NOT NULL REFERENCES report_files(id),
  raw_markdown TEXT NOT NULL,
  page_metadata JSONB NOT NULL,
  extraction_method TEXT NOT NULL,  -- 'native_text' | 'ocr'
  confidence NUMERIC(3,2) NOT NULL,
  table_count INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Layer 4 — AI Structured Output

This is the most critical layer. All output is validated against a Zod schema at the OpenAI response level — the model cannot return free-form text.

### System Prompt

```typescript
const EXTRACTION_SYSTEM_PROMPT = `
You are a biomarker extraction engine. Your ONLY job is to extract structured data
from the provided lab report markdown.

Rules you MUST follow:
1. Extract ONLY values explicitly stated in the report. Never infer or calculate.
2. Use the EXACT numeric value shown — never round or estimate.
3. If a value is missing or unclear, set it to null. Never guess.
4. Normal ranges come FROM the report, not from your training data.
5. Do NOT include patient name, address, or contact details in output.
6. Do NOT generate any medical diagnosis, prognosis, or treatment advice.
7. The "explanation" field must use language like "may indicate", "can be associated with".
   Never use "you have", "you are", "you should take".
`.trim();
```

### Zod Schema (Structured Output)

```typescript
// apps/web/src/lib/ai/extraction-schema.ts

const BiomarkerValueSchema = z.object({
  canonicalKey: z.string(),
  reportedName: z.string(),
  value: z.number(),
  unit: z.string(),
  referenceRangeLow: z.number().nullable(),
  referenceRangeHigh: z.number().nullable(),
  status: z.enum(["normal", "low", "high", "critical_low", "critical_high", "unknown"]),
  pageNumber: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  rawText: z.string(),          // verbatim text from report for auditability
});

const SafeExplanationSchema = z.object({
  summary: z.string().max(600),
  keyFindings: z.array(z.string()).max(5),
  flags: z.array(z.enum(["abnormal_found", "critical_found", "low_confidence", "partial_data"])),
});

export const BiomarkerExtractionResultSchema = z.object({
  reportType: z.string(),
  labName: z.string().nullable(),
  reportDate: z.string().nullable(),          // ISO date string
  biomarkers: z.array(BiomarkerValueSchema),
  explanation: SafeExplanationSchema,
  requiresDoctorReview: z.boolean(),
  extractionConfidence: z.number().min(0).max(1),
  modelVersion: z.string(),
  tokensUsed: z.number().int(),
});

export type BiomarkerExtractionResult = z.infer<typeof BiomarkerExtractionResultSchema>;
```

### OpenAI Call

```typescript
// apps/web/src/lib/ai/extractor.ts

export async function extractBiomarkers(
  markdown: string,
  reportType: string,
): Promise<BiomarkerExtractionResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "biomarker_extraction",
        strict: true,
        schema: zodToJsonSchema(BiomarkerExtractionResultSchema),
      },
    },
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: buildExtractionPrompt(markdown, reportType) },
    ],
    temperature: 0,               // deterministic extraction
    max_tokens: 4096,
  });

  const raw = JSON.parse(response.choices[0].message.content!);
  const result = BiomarkerExtractionResultSchema.parse(raw);  // throws ZodError if invalid

  return result;
}
```

### Safety Filter (mandatory)

```typescript
// Before storing — always run through safety.ts
const safetyCheck = validateSafeExplanation(result.explanation.summary);
if (!safetyCheck.passed) {
  throw new SafetyViolation(safetyCheck.violations);
}
```

### model_runs Record

Every AI call writes a `model_runs` row:

```sql
INSERT INTO model_runs (
  report_file_id, model_id, prompt_tokens, completion_tokens,
  input_hash, output_json, latency_ms, status
) VALUES (...)
```

This enables cost tracking, replay for debugging, and audit trail.

---

## 8. Layer 5 — Routing & Storage

### Routing Logic

```typescript
function routeResult(result: BiomarkerExtractionResult): ProcessingRoute {
  const hasCritical = result.biomarkers.some(b =>
    b.status === "critical_low" || b.status === "critical_high"
  );
  const isLowConfidence = result.extractionConfidence < 0.65;
  const requiresDoctor = result.requiresDoctorReview;

  if (hasCritical) return "critical_review_required";
  if (isLowConfidence) return "low_confidence_review_required";
  if (requiresDoctor) return "doctor_review_required";
  return "publish";
}
```

### What Gets Stored Where

| Data | Table | Notes |
|------|-------|-------|
| File record | `report_files` | Status, storage key, checksum, metadata |
| Raw markdown | `extracted_documents` | Full extraction output |
| Individual biomarkers | `biomarker_results` | One row per marker |
| Health insights | `health_insights` | Patient-facing explanation |
| AI run log | `model_runs` | Tokens, latency, raw JSON |
| Job steps | `processing_job_steps` | Resumable step audit |
| Doctor queue | `doctor_reviews` | If routing = doctor needed |
| Audit | `audit_logs` | Every state transition |

### `biomarker_results` Insert

```typescript
const biomarkerRows = result.biomarkers.map((b) => ({
  report_file_id: reportFileId,
  canonical_key: b.canonicalKey,
  reported_name: b.reportedName,
  value: b.value,
  unit: b.unit,
  reference_range_low: b.referenceRangeLow,
  reference_range_high: b.referenceRangeHigh,
  status: b.status,
  confidence: b.confidence,
  raw_text: b.rawText,           // source audit trail
  source_page: b.pageNumber,
}));

await supabase.from("biomarker_results").insert(biomarkerRows);
```

---

## 9. End-to-End State Machine

```
uploaded
  └─▶ scan_pending
        ├─▶ scan_failed          (terminal — notify user)
        └─▶ scan_passed
              ├─▶ unsupported    (terminal — show fallback UI)
              └─▶ classified
                    └─▶ text_extraction_pending
                          ├─▶ extraction_failed   (terminal)
                          └─▶ text_extracted
                                └─▶ biomarker_extraction_pending
                                      ├─▶ extraction_failed   (terminal)
                                      └─▶ biomarker_extracted
                                            └─▶ validated
                                                  └─▶ insight_generation_pending
                                                        └─▶ insight_generated
                                                              ├─▶ doctor_review_required
                                                              │     └─▶ doctor_reviewed
                                                              │           └─▶ published
                                                              └─▶ published
```

All transitions are written atomically to `processing_job_steps` before state change.

---

## 10. Error Handling & Retry Strategy

| Failure | Retry | Max Attempts | Terminal State |
|---------|-------|-------------|----------------|
| Storage PUT timeout | Yes | 3 × exponential | `extraction_failed` |
| Malware scan timeout | Yes | 2 | `scan_failed` |
| Marker API 5xx | Yes | 3 | falls back to Textract |
| Textract job timeout | Yes | 2 | `extraction_failed` |
| OpenAI rate limit | Yes | 5 × backoff | `extraction_failed` |
| OpenAI ZodError | No | 1 retry with simplified prompt | `extraction_failed` |
| Safety filter failure | No | 0 | `extraction_failed` |
| DB write failure | Yes | 3 | rollback, alert oncall |

Dead jobs write to `processing_jobs.failed_at` + `error_context` JSONB. Users see a friendly message; oncall sees the full stack.

---

## 11. Saga Concurrency Model

Inngest manages all concurrency — no separate worker fleet to deploy or monitor.

```
User uploads report A        User uploads report B        User uploads report C
        │                            │                            │
        ▼                            ▼                            ▼
inngest.send("report/confirmed") ×3
        │
        ▼
┌──────────────────────────────────────────────────┐
│  Inngest Scheduler (cloud)                        │
│  concurrency: { limit: 10 }                       │
│                                                  │
│  Run A: malware-scan ✓ → classify ✓ → extract…  │
│  Run B: malware-scan ✓ → classify ✓ → extract…  │
│  Run C: malware-scan → (in progress)             │
└──────────────────────────────────────────────────┘
        │  HTTP callbacks to /api/inngest
        ▼
┌──────────────────────────────────────────────────┐
│  Next.js serverless function (Vercel)             │
│  Stateless — each step.run() is one invocation   │
│  No workers, no Redis, no persistent processes   │
└──────────────────────────────────────────────────┘
```

**Exactly-once guarantee**: Inngest deduplicates events by `reportFileId`. Sending the same `report/confirmed` event twice for the same file will only trigger one saga run.

**Scaling path**: Increase `concurrency.limit` — no infra changes needed. For 1000+ reports/day, move to Inngest's Enterprise plan with dedicated executors.

---

## 12. Security

| Concern | Mitigation |
|---------|-----------|
| Malware in PDF | ClamAV scan before any parsing |
| SSRF via Marker/Textract | Allowlisted outbound IPs, no user-controlled URLs |
| Data isolation | RLS — users see only their own `report_files` |
| PII in AI prompt | Patient name stripped from markdown before sending to OpenAI |
| Storage access | All reads via short-lived signed URLs (15 min TTL) |
| Prompt injection | System prompt uses role separation; user markdown is in a separate `user` message |
| Model hallucination | Strict JSON schema + ZodError retry + `rawText` source audit |
| Secret exposure | All API keys in env vars, never in DB or logs |

---

## 13. Implementation Task List

### Phase A — Ingestion layer (3–4 days)
- [ ] `POST /api/reports/init` — validate, create `report_files` row, return signed URL
- [ ] `POST /api/reports/confirm` — verify checksum, enqueue job, return 202
- [ ] `GET /api/reports/[id]/status` — poll endpoint
- [ ] Client-side SHA-256 checksum before upload (Web Crypto API)
- [ ] Consent cookie gate in middleware

### Phase B — Saga orchestration setup (1–2 days)

- [ ] Install Inngest: `npm install inngest` in `apps/web`
- [ ] `apps/web/src/inngest/client.ts` — Inngest client
- [ ] `apps/web/src/app/api/inngest/route.ts` — webhook handler
- [ ] `apps/web/src/inngest/process-report.ts` — `ProcessReportSaga` function
- [ ] `apps/web/src/inngest/compensations.ts` — undo handlers per step
- [ ] `apps/web/src/lib/reports/classification.ts` — keyword classifier
- [ ] Wire `inngest.send()` in `/api/reports/confirm`
- [ ] Local dev: `npx inngest-cli@latest dev` (no Docker Redis needed)

### Phase C — Document extraction (3–4 days)
- [ ] `DocumentParser` interface (already scaffolded)
- [ ] `MarkerDocumentParser` implementation
- [ ] `TextractDocumentParser` implementation + OCR fallback trigger
- [ ] `extracted_documents` table migration (already exists)
- [ ] Confidence threshold routing logic

### Phase D — AI extraction (3–4 days)
- [ ] `BiomarkerExtractionResultSchema` Zod schema
- [ ] `extractBiomarkers()` OpenAI call with strict JSON schema
- [ ] `model_runs` writer
- [ ] Safety filter integration (`validateSafeExplanation`)
- [ ] ZodError retry with simplified prompt fallback

### Phase E — Routing & storage (2 days)
- [ ] `routeResult()` logic
- [ ] `biomarker_results` batch insert
- [ ] `health_insights` insert
- [ ] Doctor review queue enqueue
- [ ] Notification trigger (email/push when ready)
- [ ] `published` state → result page available

### Phase F — Testing (2–3 days)
- [ ] Golden dataset: 10 real (anonymised) lab reports with expected output
- [ ] Unit tests: each schema, parser, safety filter
- [ ] Integration test: full pipeline on mock PDF
- [ ] Safety test: attempt to inject diagnosis language → must fail

**Total estimate: 15–18 engineer-days**

---

## 14. Key Files to Create / Modify

```
apps/web/src/app/api/
  reports/
    init/route.ts              ← NEW
    confirm/route.ts           ← MODIFY (add inngest.send)
    [id]/status/route.ts       ← NEW
  inngest/
    route.ts                   ← NEW (Inngest webhook handler)

apps/web/src/inngest/
  client.ts                    ← NEW (Inngest client singleton)
  process-report.ts            ← NEW (ProcessReportSaga function)
  compensations.ts             ← NEW (per-step undo handlers)

apps/web/src/lib/ai/
  extraction-schema.ts         ← NEW (Zod schema)
  extractor.ts                 ← NEW (OpenAI call)

apps/web/src/lib/reports/
  classification.ts            ← NEW (keyword classifier)
  providers/
    marker-parser.ts           ← NEW
    textract-parser.ts         ← NEW
```

> `apps/worker/` is no longer needed for report processing — the saga orchestration runs entirely inside Next.js serverless functions via Inngest. The worker process may still be retained for other background tasks (e.g. scheduled reminders).

---

*This document supersedes and extends `11_WORKFLOW_AND_PROCESSING_PIPELINE.md` for the PDF upload feature specifically. Refer to `13_AI_STRUCTURED_OUTPUTS_AND_MODEL_RUNS.md` for the full OpenAI schema catalogue.*
