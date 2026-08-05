import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { processReport } from "@/inngest/process-report";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processReport],
});
