import type { AppData, HealthDailySummary } from "./types";
import { shiftDate } from "./weight";

export type HealthInsightMetricKey = "sleep" | "heartRateVariability" | "restingHeartRate";
export type HealthInsightMetricState = "unknown" | "stable" | "caution" | "low";
export type HealthReadinessStatus = "insufficient" | "stable" | "caution" | "low";
export type HealthReadinessConfidence = "low" | "building" | "ready";
export type HealthTrainingAdjustment = "collect" | "normal" | "conservative" | "recovery";

export interface HealthMetricInsight {
  metric: HealthInsightMetricKey;
  current: number | null;
  baseline: number | null;
  sampleCount: number;
  delta: number | null;
  deltaPercent: number | null;
  state: HealthInsightMetricState;
}

export interface HealthReadinessSummary {
  observationDate: string | null;
  baselineStart: string | null;
  baselineEnd: string | null;
  baselineDays: number;
  qualifiedSignals: number;
  adverseSignals: number;
  status: HealthReadinessStatus;
  confidence: HealthReadinessConfidence;
  suggestedAdjustment: HealthTrainingAdjustment;
  metrics: HealthMetricInsight[];
}

const MINIMUM_BASELINE_SAMPLES = 7;
const READY_BASELINE_SAMPLES = 14;
const READINESS_METRICS: HealthInsightMetricKey[] = [
  "sleep",
  "heartRateVariability",
  "restingHeartRate",
];

const metricValue = (
  health: HealthDailySummary | undefined,
  metric: HealthInsightMetricKey,
): number | undefined => {
  if (metric === "sleep") return health?.sleepMinutes;
  if (metric === "heartRateVariability") return health?.heartRateVariabilityMs;
  return health?.restingHeartRate;
};

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function metricState(
  metric: HealthInsightMetricKey,
  current: number,
  baseline: number,
): HealthInsightMetricState {
  const delta = current - baseline;
  if (metric === "sleep") {
    if (current < 330 || delta <= -120) return "low";
    if (current < 390 || delta <= -60) return "caution";
    return "stable";
  }
  if (metric === "heartRateVariability") {
    const ratio = current / baseline;
    if (ratio <= 0.7) return "low";
    if (ratio <= 0.85) return "caution";
    return "stable";
  }
  if (delta >= 10 || current / baseline >= 1.15) return "low";
  if (delta >= 5 || current / baseline >= 1.08) return "caution";
  return "stable";
}

function insightForMetric(
  data: AppData,
  metric: HealthInsightMetricKey,
  observationDate: string,
  baselineStart: string,
  baselineEnd: string,
): HealthMetricInsight {
  const current = metricValue(data.days[observationDate]?.health, metric) ?? null;
  const values = Object.entries(data.days)
    .filter(([date]) => date >= baselineStart && date <= baselineEnd)
    .map(([, day]) => metricValue(day.health, metric))
    .filter((value): value is number => typeof value === "number");
  const baseline = median(values);
  const qualified = current != null
    && baseline != null
    && baseline > 0
    && values.length >= MINIMUM_BASELINE_SAMPLES;
  if (!qualified) {
    return {
      metric,
      current,
      baseline,
      sampleCount: values.length,
      delta: null,
      deltaPercent: null,
      state: "unknown",
    };
  }
  const delta = current - baseline;
  return {
    metric,
    current,
    baseline,
    sampleCount: values.length,
    delta,
    deltaPercent: (delta / baseline) * 100,
    state: metricState(metric, current, baseline),
  };
}

export function buildHealthReadiness(data: AppData, today: string): HealthReadinessSummary {
  const latestAllowed = shiftDate(today, -1);
  const observationDate = Object.keys(data.days)
    .filter((date) => date >= latestAllowed && date <= today)
    .map((date) => ({
      date,
      signalCount: READINESS_METRICS.filter((metric) => (
        metricValue(data.days[date]?.health, metric) != null
      )).length,
    }))
    .filter((row) => row.signalCount > 0)
    .sort((left, right) => right.signalCount - left.signalCount || right.date.localeCompare(left.date))[0]?.date ?? null;
  if (!observationDate) {
    return {
      observationDate: null,
      baselineStart: null,
      baselineEnd: null,
      baselineDays: 0,
      qualifiedSignals: 0,
      adverseSignals: 0,
      status: "insufficient",
      confidence: "low",
      suggestedAdjustment: "collect",
      metrics: [],
    };
  }

  const baselineStart = shiftDate(observationDate, -28);
  const baselineEnd = shiftDate(observationDate, -1);
  const baselineDays = Object.entries(data.days)
    .filter(([date, day]) => (
      date >= baselineStart
      && date <= baselineEnd
      && READINESS_METRICS.some((metric) => metricValue(day.health, metric) != null)
    ))
    .length;
  const metrics = READINESS_METRICS.map((metric) => (
    insightForMetric(data, metric, observationDate, baselineStart, baselineEnd)
  ));
  const qualified = metrics.filter((metric) => metric.state !== "unknown");
  const lowSignals = qualified.filter((metric) => metric.state === "low").length;
  const cautionSignals = qualified.filter((metric) => metric.state === "caution").length;
  const adverseSignals = lowSignals + cautionSignals;
  const confidence: HealthReadinessConfidence = qualified.length === 3
    && baselineDays >= READY_BASELINE_SAMPLES
    && metrics.every((metric) => metric.sampleCount >= READY_BASELINE_SAMPLES)
    ? "ready"
    : qualified.length >= 2
      ? "building"
      : "low";

  let status: HealthReadinessStatus;
  if (lowSignals >= 2 || (lowSignals >= 1 && cautionSignals >= 1)) status = "low";
  else if (adverseSignals >= 1) status = "caution";
  else if (qualified.length >= 2) status = "stable";
  else status = "insufficient";

  const suggestedAdjustment: HealthTrainingAdjustment = status === "low" && confidence !== "low"
    ? "recovery"
    : status === "caution" || status === "low"
      ? "conservative"
      : status === "stable"
        ? "normal"
        : "collect";

  return {
    observationDate,
    baselineStart,
    baselineEnd,
    baselineDays,
    qualifiedSignals: qualified.length,
    adverseSignals,
    status,
    confidence,
    suggestedAdjustment,
    metrics,
  };
}
