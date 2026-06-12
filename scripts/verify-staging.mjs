import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const artifactDir = path.join(process.cwd(), "artifacts", "staging-verification");
const now = () => new Date().toISOString();

const expectedTables = [
  "user_profiles",
  "user_roles",
  "user_health_profiles",
  "user_consents",
  "questionnaire_responses",
  "report_files",
  "lab_reports",
  "processing_jobs",
  "processing_job_steps",
  "extracted_documents",
  "biomarker_catalog",
  "biomarker_aliases",
  "biomarker_results",
  "health_insights",
  "health_risk_flags",
  "model_runs",
  "doctor_reviews",
  "doctor_review_comments",
  "audit_logs",
  "reminders",
  "payments",
  "feedback_events",
  "analytics_events"
];

const sections = {
  supabase: {
    required: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"],
    run: verifySupabase
  },
  rls: {
    required: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    run: verifyRls
  },
  workflow: {
    required: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DATABASE_URL",
      "LIVE_SUPABASE_WORKFLOW_JOB_ID"
    ],
    run: verifyWorkflow
  },
  s3: {
    required: ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_REPORT_BUCKET"],
    run: verifyS3
  },
  malware: {
    required: ["MALWARE_SCANNER_PROVIDER"],
    run: verifyMalware
  },
  marker: {
    required: ["DOCUMENT_PARSER_PROVIDER"],
    run: verifyMarker
  },
  textract: {
    required: ["OCR_PROVIDER", "AWS_TEXTRACT_REGION"],
    run: verifyTextract
  },
  openai: {
    required: ["AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL_EXTRACTION", "OPENAI_MODEL_EXPLANATION"],
    run: verifyOpenAi
  },
  e2e: {
    required: ["APP_BASE_URL", "NEXT_PUBLIC_APP_BASE_URL"],
    run: verifyE2E
  },
  "golden-live": {
    required: ["RUN_LIVE_OPENAI_EVAL", "AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL_EXTRACTION"],
    run: verifyGoldenLive
  }
};

const selected = selectedSections();
await mkdir(artifactDir, { recursive: true });
const results = [];

for (const section of selected) {
  const result = await runSection(section);
  results.push(result);
  await writeSection(section, result);
}

const latest = {
  generatedAt: now(),
  environment: process.env.APP_ENV ?? null,
  releaseVerdict: results.every((result) => result.status === "passed") ? "ready_for_review" : "no_go",
  syntheticOnly: true,
  results
};

await writeFile(path.join(artifactDir, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`);
await writeFile(path.join(artifactDir, "latest.md"), renderMarkdown(latest));

const hasBlockingResult = results.some((result) => result.status !== "passed");
if (hasBlockingResult) {
  process.exit(1);
}

function selectedSections() {
  const sectionArg = process.argv.find((arg) => arg.startsWith("--section="));
  const value = sectionArg?.split("=")[1] ?? "all";
  if (value === "all") return Object.keys(sections);
  const requested = value.split(",").map((item) => item.trim()).filter(Boolean);
  const unknown = requested.filter((section) => !sections[section]);
  if (unknown.length > 0) {
    throw new Error(`Unknown staging verification section(s): ${unknown.join(", ")}`);
  }
  return requested;
}

async function runSection(section) {
  const startedAt = now();
  const base = {
    checks: [],
    endedAt: null,
    section,
    startedAt,
    status: "blocked",
    syntheticOnly: true
  };

  if (process.env.APP_ENV === "production") {
    return finish(base, "failed", [
      check("environment_not_production", false, "Live verification refuses to run with APP_ENV=production.")
    ]);
  }

  if (process.env.APP_ENV !== "staging") {
    return finish(base, "blocked", [
      check("app_env_staging", false, "Set APP_ENV=staging to run live staging verification.")
    ]);
  }

  const missing = missingEnv(sections[section].required);
  if (missing.length > 0) {
    return finish(base, "blocked", [
      check("required_env_present", false, `Missing required env: ${missing.join(", ")}`)
    ]);
  }

  try {
    const result = await sections[section].run(base);
    return finish(base, result.status, result.checks);
  } catch (caught) {
    return finish(base, "failed", [
      check("unexpected_error", false, caught instanceof Error ? caught.message : "Unknown error")
    ]);
  }
}

async function verifySupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  const checks = [check("supabase_client_created", true)];
  const missingTables = [];

  for (const table of expectedTables) {
    const { error } = await client.from(table).select("*", { count: "exact", head: true });
    if (error) missingTables.push(table);
  }

  checks.push(check("expected_tables_queryable", missingTables.length === 0, missingTables.length ? `Missing or inaccessible tables: ${missingTables.join(", ")}` : undefined));
  checks.push(check("rls_inventory_verified_elsewhere", true, "RLS/JWT boundaries are verified by the dedicated RLS live harness."));

  return { checks, status: missingTables.length === 0 ? "passed" : "failed" };
}

function verifyRls() {
  return runNpmHarness("npm", ["--workspace", "apps/web", "run", "test:rls"], {
    RUN_LIVE_SUPABASE_RLS: "true"
  }, "live_rls_harness_passed");
}

function verifyWorkflow() {
  return runNpmHarness("npm", ["--workspace", "apps/web", "run", "test:workflow-live"], {
    RUN_LIVE_SUPABASE_WORKFLOW: "true"
  }, "live_workflow_harness_passed");
}

async function verifyS3() {
  const client = new S3Client({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    region: process.env.AWS_REGION
  });
  const bucket = process.env.S3_REPORT_BUCKET;
  const key = `staging-verification/${Date.now()}-${randomUUID()}.pdf`;
  const body = Buffer.from("%PDF-1.4\n% Lyf9 AI synthetic staging smoke file\n%%EOF\n");
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Body: body,
      Bucket: bucket,
      ContentType: "application/pdf",
      Key: key,
      Metadata: {
        synthetic: "true"
      }
    }),
    { expiresIn: Number(process.env.S3_UPLOAD_URL_EXPIRY_SECONDS ?? 900) }
  );

  const upload = await fetch(uploadUrl, {
    body,
    headers: { "content-type": "application/pdf" },
    method: "PUT"
  });
  const checks = [check("signed_upload_succeeded", upload.ok, `HTTP ${upload.status}`)];

  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  checks.push(check("metadata_read_succeeded", Boolean(head.ContentLength), `Stored bytes: ${head.ContentLength ?? 0}`));

  const downloadUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: Number(process.env.S3_DOWNLOAD_URL_EXPIRY_SECONDS ?? 300) }
  );
  const download = await fetch(downloadUrl);
  checks.push(check("signed_download_succeeded", download.ok, `HTTP ${download.status}`));

  const publicUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  const publicFetch = await fetch(publicUrl);
  checks.push(check("public_object_url_denied", !publicFetch.ok, `HTTP ${publicFetch.status}`));

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  checks.push(check("delete_succeeded", true));
  checks.push(check("app_route_audit_verified", false, "S3 direct smoke does not verify report_files rows or audit logs; run full staging E2E for that evidence."));

  return {
    checks,
    status: checks.every((item) => item.passed) ? "passed" : "blocked"
  };
}

function verifyMalware() {
  const provider = process.env.MALWARE_SCANNER_PROVIDER;
  const checks = [
    check("mock_scanner_not_used", provider !== "mock", "Mock scanner is not allowed for staging verification."),
    check("real_scanner_runner_available", false, "No live malware scanner runner is wired in this repository yet; staging must fail closed.")
  ];
  return { checks, status: "blocked" };
}

function verifyMarker() {
  const checks = [
    check("marker_selected", process.env.DOCUMENT_PARSER_PROVIDER === "marker"),
    check("marker_command_or_api_configured", Boolean(process.env.MARKER_COMMAND || process.env.MARKER_API_URL)),
    check("marker_runner_available", false, "MarkerProvider currently exposes the contract and fail-closed behavior; live command/API execution is not wired.")
  ];
  return { checks, status: "blocked" };
}

function verifyTextract() {
  const checks = [
    check("textract_selected", process.env.OCR_PROVIDER === "textract"),
    check("textract_region_configured", Boolean(process.env.AWS_TEXTRACT_REGION)),
    check("textract_runner_available", false, "Textract provider currently exposes the contract and fail-closed behavior; live OCR execution is not wired.")
  ];
  return { checks, status: "blocked" };
}

function verifyOpenAi() {
  const checks = [
    check("openai_selected", process.env.AI_PROVIDER === "openai"),
    check("openai_models_configured", Boolean(process.env.OPENAI_MODEL_EXTRACTION && process.env.OPENAI_MODEL_EXPLANATION)),
    check("openai_runner_available", false, "OpenAI Structured Outputs provider currently exposes the contract and fail-closed behavior; live requests are not wired.")
  ];
  return { checks, status: "blocked" };
}

function verifyE2E() {
  const checks = [
    check("synthetic_only", true),
    check("all_live_provider_sections_passed", false, "Full staging E2E is blocked until Supabase/RLS, workflow, S3, scanner, Marker, Textract, and OpenAI live checks pass.")
  ];
  return { checks, status: "blocked" };
}

function verifyGoldenLive() {
  const checks = [
    check("live_openai_eval_requested", process.env.RUN_LIVE_OPENAI_EVAL === "true"),
    check("synthetic_golden_only", true),
    check("live_openai_runner_available", false, "Live golden subset cannot run until OpenAI Structured Outputs execution is wired.")
  ];
  return { checks, status: "blocked" };
}

function runNpmHarness(command, args, extraEnv, checkName) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv
    },
    maxBuffer: 1024 * 1024
  });

  const output = sanitizeOutput(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim());
  const passed = result.status === 0;
  return {
    checks: [
      check(checkName, passed, output.slice(-4000) || `exit ${result.status}`)
    ],
    status: passed ? "passed" : "failed"
  };
}

function missingEnv(names) {
  return names.filter((name) => !process.env[name]);
}

function check(name, passed, detail) {
  return {
    detail: detail ?? null,
    name,
    passed
  };
}

function finish(base, status, checks) {
  return {
    ...base,
    checks,
    endedAt: now(),
    status
  };
}

async function writeSection(section, result) {
  await writeFile(path.join(artifactDir, `${section}.json`), `${JSON.stringify(result, null, 2)}\n`);
}

function renderMarkdown(report) {
  const rows = report.results
    .map((result) => `| ${result.section} | ${result.status} | ${result.checks.filter((item) => item.passed).length}/${result.checks.length} |`)
    .join("\n");
  const blockers = report.results
    .flatMap((result) => result.checks.filter((item) => !item.passed).map((item) => `- ${result.section}: ${item.name}${item.detail ? ` - ${item.detail}` : ""}`))
    .join("\n");

  return `# Live Staging Verification Artifact

Generated: ${report.generatedAt}

Environment: ${report.environment ?? "unset"}

Synthetic data only: ${report.syntheticOnly ? "yes" : "no"}

Release verdict: **${report.releaseVerdict}**

| Section | Status | Checks passed |
| --- | --- | ---: |
${rows}

## Blockers

${blockers || "- None"}
`;
}

function sanitizeOutput(value) {
  let sanitized = value;
  for (const key of Object.keys(process.env)) {
    if (key.includes("KEY") || key.includes("SECRET") || key.includes("TOKEN") || key.includes("PASSWORD")) {
      const secret = process.env[key];
      if (secret && secret.length > 3) {
        sanitized = sanitized.split(secret).join("[redacted]");
      }
    }
  }
  return sanitized;
}
