# Lyf9 AI Golden Dataset

This folder contains synthetic-only fixtures for private-beta QA.

Rules:

- No real PHI.
- No real patient names.
- No real phone numbers, addresses, lab IDs, or emails.
- All samples are synthetic extracted-document fixtures, not uploaded real reports.
- Live provider evaluation must be opt-in and must use synthetic fixtures only.

Default command:

```bash
npm run eval:golden
```

Live OpenAI evaluation is intentionally opt-in:

```bash
RUN_LIVE_OPENAI_EVAL=true npm run eval:golden
```
