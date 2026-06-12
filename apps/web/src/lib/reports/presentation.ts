import type {
  BiomarkerResultRecord,
  HealthInsightRecord,
  LabReportRecord,
  ReportFileRecord
} from "./types";

export type MarkerGroupKey = "critical" | "needs_attention" | "monitor" | "normal";

export type MarkerCardModel = {
  biomarker: BiomarkerResultRecord;
  explanation: string | null;
  group: MarkerGroupKey;
  previousValue: {
    reportFileId: string;
    unit: string | null;
    value: number | string;
  } | null;
};

export type TrendSeries = {
  canonicalBiomarkerKey: string;
  label: string;
  points: Array<{
    flag: string;
    reportFileId: string;
    timestamp: string;
    unit: string | null;
    value: number;
  }>;
};

export function groupMarker(marker: BiomarkerResultRecord): MarkerGroupKey {
  if (marker.isCritical || marker.systemFlag === "critical") {
    return "critical";
  }

  if (marker.systemFlag === "high" || marker.systemFlag === "low") {
    return "needs_attention";
  }

  if (
    marker.systemFlag === "borderline" ||
    marker.systemFlag === "unknown" ||
    marker.reviewRouting === "soft_review" ||
    marker.reviewRouting === "manual_review_required"
  ) {
    return "monitor";
  }

  return "normal";
}

export function buildMarkerCards(input: {
  currentMarkers: BiomarkerResultRecord[];
  insight: HealthInsightRecord | null;
  previousMarkers: BiomarkerResultRecord[];
  reportFilesByLabReportId: Map<string, ReportFileRecord>;
}): MarkerCardModel[] {
  return input.currentMarkers.map((marker) => ({
    biomarker: marker,
    explanation: explanationForMarker(marker.id, input.insight),
    group: groupMarker(marker),
    previousValue: previousValueForMarker(marker, input.previousMarkers, input.reportFilesByLabReportId)
  }));
}

export function buildTrendSeries(input: {
  markers: BiomarkerResultRecord[];
  reportFilesByLabReportId: Map<string, ReportFileRecord>;
}): TrendSeries[] {
  const byKey = new Map<string, BiomarkerResultRecord[]>();

  for (const marker of input.markers) {
    if (!marker.canonicalBiomarkerKey || marker.valueNumeric === null) {
      continue;
    }
    byKey.set(marker.canonicalBiomarkerKey, [
      ...(byKey.get(marker.canonicalBiomarkerKey) ?? []),
      marker
    ]);
  }

  return Array.from(byKey.entries())
    .map(([canonicalBiomarkerKey, markers]) => {
      const points = markers
        .map((marker) => {
          const reportFile = input.reportFilesByLabReportId.get(marker.labReportId);
          if (!reportFile || marker.valueNumeric === null) {
            return null;
          }
          return {
            flag: marker.systemFlag,
            reportFileId: reportFile.id,
            timestamp: reportFile.uploadedAt,
            unit: marker.unit,
            value: marker.valueNumeric
          };
        })
        .filter((point): point is NonNullable<typeof point> => point !== null)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      return {
        canonicalBiomarkerKey,
        label: markers[0].canonicalName ?? markers[0].rawName,
        points
      };
    })
    .filter((series) => series.points.length >= 2)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function reportFilesByLabReportId(
  labReports: LabReportRecord[],
  reportFiles: ReportFileRecord[]
) {
  return new Map(
    labReports
      .map((labReport) => {
        const reportFile = reportFiles.find((candidate) => candidate.id === labReport.reportFileId);
        return reportFile ? ([labReport.id, reportFile] as const) : null;
      })
      .filter((entry): entry is readonly [string, ReportFileRecord] => entry !== null)
  );
}

function explanationForMarker(markerId: string, insight: HealthInsightRecord | null) {
  if (!insight) {
    return null;
  }

  return (
    insight.markersNeedingAttention.find((marker) => marker.biomarkerResultId === markerId)
      ?.explanation ?? null
  );
}

function previousValueForMarker(
  marker: BiomarkerResultRecord,
  previousMarkers: BiomarkerResultRecord[],
  filesByLabReportId: Map<string, ReportFileRecord>
) {
  if (!marker.canonicalBiomarkerKey) {
    return null;
  }

  const currentFile = filesByLabReportId.get(marker.labReportId);
  const previous = previousMarkers
    .filter(
      (candidate) =>
        candidate.canonicalBiomarkerKey === marker.canonicalBiomarkerKey &&
        candidate.labReportId !== marker.labReportId
    )
    .map((candidate) => ({
      marker: candidate,
      reportFile: filesByLabReportId.get(candidate.labReportId)
    }))
    .filter(
      (entry): entry is { marker: BiomarkerResultRecord; reportFile: ReportFileRecord } => {
        if (!entry.reportFile) {
          return false;
        }
        return !currentFile || entry.reportFile.uploadedAt < currentFile.uploadedAt;
      }
    )
    .sort((a, b) => b.reportFile.uploadedAt.localeCompare(a.reportFile.uploadedAt))[0];

  if (!previous) {
    return null;
  }

  return {
    reportFileId: previous.reportFile.id,
    unit: previous.marker.unit,
    value: previous.marker.valueNumeric ?? previous.marker.valueText ?? "unknown"
  };
}
