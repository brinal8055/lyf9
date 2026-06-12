import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, unauthorizedResponse } from "@/lib/auth/request";
import { createRetestReminder, listHealthTimeline } from "@/lib/reports/repository";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const timeline = await listHealthTimeline(user.id);
  return NextResponse.json({ reminders: timeline.reminders });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as {
    canonicalBiomarkerKey?: string | null;
    note?: string | null;
    reminderDate?: string;
    reportFileId?: string | null;
    title?: string;
  };

  if (!body.reminderDate || !body.title) {
    return NextResponse.json(
      { error: "Reminder title and date are required." },
      { status: 400 }
    );
  }

  const reminder = await createRetestReminder({
    canonicalBiomarkerKey: body.canonicalBiomarkerKey ?? null,
    note: body.note?.trim() || null,
    reminderDate: body.reminderDate,
    reportFileId: body.reportFileId ?? null,
    title: body.title.trim(),
    userId: user.id
  });

  return NextResponse.json({ reminder }, { status: 201 });
}
