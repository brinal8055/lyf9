type LogContext = Record<string, string | number | boolean | null | undefined>;

const sensitiveKeyFragments = [
  "address",
  "allerg",
  "birth",
  "condition",
  "email",
  "medicine",
  "name",
  "patient",
  "phone",
  "reporttext",
  "secret",
  "source_text",
  "symptom",
  "token"
];

export function logError(message: string, context: LogContext = {}) {
  console.error(JSON.stringify({ level: "error", message, ...safeContext(context) }));
}

export function logInfo(message: string, context: LogContext = {}) {
  if ((process.env.LOG_LEVEL ?? "info") === "silent") {
    return;
  }
  console.info(JSON.stringify({ level: "info", message, ...safeContext(context) }));
}

function safeContext(context: LogContext) {
  return Object.fromEntries(
    Object.entries(context)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, value]) => [key, typeof value === "string" ? scrubValue(value) : value])
  );
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replaceAll(/[^a-z]/g, "");
  return sensitiveKeyFragments.some((fragment) => normalized.includes(fragment.replaceAll("_", "")));
}

function scrubValue(value: string) {
  return value
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replaceAll(/\bBearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replaceAll(/\b(?:eyJ|sb_secret_)[A-Za-z0-9._-]+\b/g, "[redacted-token]");
}
