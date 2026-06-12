type LogContext = Record<string, string | number | boolean | null | undefined>;

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
    Object.entries(context).filter(([key]) => !key.toLowerCase().includes("secret"))
  );
}
