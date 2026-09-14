import { NextRequest, NextResponse } from "next/server";

import { inngest, isInngestConfigured } from "@/inngest/client";
import { getRequestUser, requestMetadata, unauthorizedResponse } from "@/lib/auth/request";
import { shouldUseSupabaseAuth } from "@/lib/auth/supabase-auth";
import { completeUpload } from "@/lib/reports/repository";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ reportFileId: string }> }
) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const params = await context.params;
  const usesSupabase = shouldUseSupabaseAuth();

  if (usesSupabase && !isInngestConfigured()) {
    return NextResponse.json(
      { error: "Report processing is temporarily unavailable." },
      { status: 503 }
    );
  }

  try {
    const result = await completeUpload({
      ...requestMetadata(request),
      reportFileId: params.reportFileId,
      userId: user.id,
    });

    // In Supabase mode, completeUpload only persists state — fire the saga to start processing.
    // In local mock mode, completeUpload already runs processUploadedReport synchronously.
    if (usesSupabase) {
      await inngest.send({
        data: {
          jobId: result.job.id,
          labReportId: result.job.labReportId,
          reportFileId: params.reportFileId,
          userId: user.id,
        },
        name: "report/confirmed",
      });
    }

    return NextResponse.json(result);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "upload_complete_failed";
    const status = message === "report_not_found" ? 404 : 400;
    return NextResponse.json({ error: "Upload could not be completed." }, { status });
  }
}
