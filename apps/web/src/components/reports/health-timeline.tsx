"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrendSeries } from "@/lib/reports/presentation";
import type {
  HealthInsightRecord,
  LabReportRecord,
  ProcessingJobRecord,
  ReminderRecord,
  ReportFileRecord
} from "@/lib/reports/types";

type TimelineItem = {
  insight: HealthInsightRecord | null;
  job: ProcessingJobRecord | null;
  labReport: LabReportRecord | null;
  markerCount: number;
  reportFile: ReportFileRecord;
};

type TimelinePayload = {
  reminders: ReminderRecord[];
  timeline: TimelineItem[];
  trendSeries: TrendSeries[];
};

export function HealthTimeline() {
  const [data, setData] = useState<TimelinePayload>({
    reminders: [],
    timeline: [],
    trendSeries: []
  });

  useEffect(() => {
    fetch("/api/timeline")
      .then((response) => response.json())
      .then((body: TimelinePayload) => setData(body));
  }, []);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Trends</CardTitle>
          <CardContent>Repeated biomarkers appear here when Lyf9 AI has at least two source values.</CardContent>
        </CardHeader>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.trendSeries.map((series) => (
            <TrendCard series={series} key={series.canonicalBiomarkerKey} />
          ))}
          {data.trendSeries.length === 0 ? (
            <p className="text-sm text-muted">Upload another supported report to see repeated-marker trends.</p>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Health timeline</CardTitle>
          <CardContent>Report history, extracted marker counts, and safety-gated insight status.</CardContent>
        </CardHeader>
        <div className="relative grid gap-4">
          {data.timeline.map((item) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={item.reportFile.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-ivory">{item.reportFile.originalFilename}</p>
                  <p className="mt-1 text-sm text-muted">
                    {new Date(item.reportFile.uploadedAt).toLocaleDateString()} ·{" "}
                    {item.labReport?.reportType?.replaceAll("_", " ") ?? "unclassified"} ·{" "}
                    {item.markerCount} markers
                  </p>
                </div>
                <Badge>{item.insight?.status.replaceAll("_", " ") ?? item.job?.currentState.replaceAll("_", " ")}</Badge>
              </div>
              {item.insight ? <p className="mt-3 text-sm text-muted">{item.insight.summary}</p> : null}
              {item.reportFile.unsupportedReason ? (
                <p className="mt-3 text-sm text-yellow">{item.reportFile.unsupportedReason}</p>
              ) : null}
              <Link className="mt-3 inline-block text-sm text-orange hover:underline" href={`/app/reports/${item.reportFile.id}`}>
                Open report
              </Link>
            </div>
          ))}
          {data.timeline.length === 0 ? <p className="text-sm text-muted">No reports yet.</p> : null}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retest reminders</CardTitle>
          <CardContent>Planning reminders only. Discuss timing with a qualified doctor.</CardContent>
        </CardHeader>
        <div className="grid gap-3">
          {data.reminders.map((reminder) => (
            <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4" key={reminder.id}>
              <p className="flex items-center gap-2 font-medium text-ivory">
                <CalendarClock className="size-4 text-orange" aria-hidden />
                {reminder.title}
              </p>
              <p className="mt-1 text-sm text-muted">
                {reminder.reminderDate} · {reminder.status}
              </p>
              {reminder.note ? <p className="mt-2 text-sm text-muted">{reminder.note}</p> : null}
            </div>
          ))}
          {data.reminders.length === 0 ? <p className="text-sm text-muted">No reminders scheduled.</p> : null}
        </div>
      </Card>
    </div>
  );
}

function TrendCard({ series }: { series: TrendSeries }) {
  const width = 280;
  const height = 96;
  const values = series.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = series.points.map((point, index) => {
    const x = series.points.length === 1 ? width / 2 : (index / (series.points.length - 1)) * width;
    const y = height - ((point.value - min) / range) * (height - 16) - 8;
    return { ...point, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-ivory">{series.label}</p>
          <p className="text-sm text-muted">
            {series.points.length} values · {series.points.at(-1)?.value} {series.points.at(-1)?.unit ?? ""}
          </p>
        </div>
        <Activity className="size-5 text-green" aria-hidden />
      </div>
      <svg className="mt-4 h-24 w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${series.label} trend`}>
        <path d={path} fill="none" stroke="#45D6A2" strokeLinecap="round" strokeWidth="3" />
        {points.map((point) => (
          <circle cx={point.x} cy={point.y} fill="#FF6A3D" key={`${point.reportFileId}-${point.timestamp}`} r="4" />
        ))}
      </svg>
    </div>
  );
}
