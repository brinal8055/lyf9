import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole, requestMetadata } from "@/lib/auth/request";
import { readAssignedDoctorPrivateReport } from "@/lib/reports/repository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const auth = await requireRequestRole(request, ["doctor"]);

  if (auth.response) {
    return auth.response;
  }

  const { reviewId } = await params;

  try {
    const result = await readAssignedDoctorPrivateReport({
      doctorEmail: auth.user.id,
      ...requestMetadata(request),
      reviewId
    });

    return new NextResponse(result.bytes, {
      headers: {
        "Content-Disposition": `attachment; filename="${result.reportFile.originalFilename}"`,
        "Content-Type": result.reportFile.mimeType
      }
    });
  } catch {
    return NextResponse.json({ error: "Review report not found." }, { status: 404 });
  }
}
