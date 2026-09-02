import { Inngest } from "inngest";

export function isInngestConfigured() {
  const deployed = process.env.APP_ENV === "staging" || process.env.APP_ENV === "production";
  const cloudConfigured = Boolean(
    process.env.INNGEST_EVENT_KEY?.trim() && process.env.INNGEST_SIGNING_KEY?.trim()
  );

  if (deployed) return cloudConfigured;
  return cloudConfigured || process.env.INNGEST_DEV === "1";
}

export const inngest = new Inngest({
  eventKey: process.env.INNGEST_EVENT_KEY?.trim() || undefined,
  id: "lyf9",
  signingKey: process.env.INNGEST_SIGNING_KEY?.trim() || undefined
});
