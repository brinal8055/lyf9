export function reportUploadsEnabled() {
  return process.env.REPORT_UPLOADS_ENABLED !== "false";
}
