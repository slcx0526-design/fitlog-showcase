import type {
  AppData,
  BodyWeightEntry,
  HealthDailySummary,
  HealthSyncState,
} from "./types";

export const APPLE_HEALTH_PAYLOAD_VERSION = 1;

export interface AppleHealthDayPayload {
  date: string;
  steps?: number;
  activeEnergyKcal?: number;
  exerciseMinutes?: number;
  restingHeartRate?: number;
  heartRateVariabilityMs?: number;
  sleepMinutes?: number;
}

export interface AppleHealthWeightPayload {
  date: string;
  weightKg: number;
}

export interface AppleHealthSnapshot {
  schemaVersion: typeof APPLE_HEALTH_PAYLOAD_VERSION;
  generatedAt: string;
  rangeStart?: string;
  rangeEnd?: string;
  days: AppleHealthDayPayload[];
  bodyWeights: AppleHealthWeightPayload[];
}

export interface AppleHealthMergeSummary {
  importedDays: number;
  updatedDays: number;
  importedWeights: number;
  updatedWeights: number;
  preservedManualWeights: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const [year, month, day] = value.split("-").map(Number);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

function bounded(
  value: unknown,
  min: number,
  max: number,
  decimals = 0,
): number | undefined {
  if (!isFiniteNumber(value) || value < min || value > max) return undefined;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function parseDay(input: unknown): AppleHealthDayPayload | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (!isDateKey(value.date)) return null;
  const day: AppleHealthDayPayload = {
    date: value.date,
    steps: bounded(value.steps, 0, 200_000),
    activeEnergyKcal: bounded(value.activeEnergyKcal, 0, 20_000, 1),
    exerciseMinutes: bounded(value.exerciseMinutes, 0, 1_440, 1),
    restingHeartRate: bounded(value.restingHeartRate, 20, 250, 1),
    heartRateVariabilityMs: bounded(value.heartRateVariabilityMs, 0, 1_000, 1),
    sleepMinutes: bounded(value.sleepMinutes, 0, 1_440, 1),
  };
  const hasMetric = Object.entries(day).some(([key, metric]) => key !== "date" && metric != null);
  return hasMetric ? day : null;
}

function parseWeight(input: unknown): AppleHealthWeightPayload | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (!isDateKey(value.date)) return null;
  const weightKg = bounded(value.weightKg, 30, 300, 2);
  return weightKg == null ? null : { date: value.date, weightKg };
}

function newestByDate<T extends { date: string }>(entries: T[]) {
  const byDate = new Map<string, T>();
  for (const entry of entries) byDate.set(entry.date, entry);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeAppleHealthSnapshot(input: unknown): AppleHealthSnapshot {
  if (!input || typeof input !== "object") throw new Error("Apple Health 数据格式不正确");
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== APPLE_HEALTH_PAYLOAD_VERSION) {
    throw new Error("Apple Health 数据版本不受支持");
  }
  if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))) {
    throw new Error("Apple Health 同步时间无效");
  }
  const days = newestByDate(
    (Array.isArray(value.days) ? value.days : [])
      .map(parseDay)
      .filter((day): day is AppleHealthDayPayload => Boolean(day)),
  );
  const bodyWeights = newestByDate(
    (Array.isArray(value.bodyWeights) ? value.bodyWeights : [])
      .map(parseWeight)
      .filter((entry): entry is AppleHealthWeightPayload => Boolean(entry)),
  );
  return {
    schemaVersion: APPLE_HEALTH_PAYLOAD_VERSION,
    generatedAt: value.generatedAt,
    ...(isDateKey(value.rangeStart) ? { rangeStart: value.rangeStart } : {}),
    ...(isDateKey(value.rangeEnd) ? { rangeEnd: value.rangeEnd } : {}),
    days,
    bodyWeights,
  };
}

function healthSummary(day: AppleHealthDayPayload, updatedAt: string): HealthDailySummary {
  return {
    source: "appleHealth",
    updatedAt,
    ...(day.steps != null ? { steps: day.steps } : {}),
    ...(day.activeEnergyKcal != null ? { activeEnergyKcal: day.activeEnergyKcal } : {}),
    ...(day.exerciseMinutes != null ? { exerciseMinutes: day.exerciseMinutes } : {}),
    ...(day.restingHeartRate != null ? { restingHeartRate: day.restingHeartRate } : {}),
    ...(day.heartRateVariabilityMs != null ? { heartRateVariabilityMs: day.heartRateVariabilityMs } : {}),
    ...(day.sleepMinutes != null ? { sleepMinutes: day.sleepMinutes } : {}),
  };
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const sameHealthFacts = (left: HealthDailySummary, right: HealthDailySummary) => {
  const { updatedAt: _leftUpdatedAt, ...leftFacts } = left;
  const { updatedAt: _rightUpdatedAt, ...rightFacts } = right;
  return same(leftFacts, rightFacts);
};

export function mergeAppleHealthSnapshot(
  current: AppData,
  snapshotInput: unknown,
): { data: AppData; summary: AppleHealthMergeSummary } {
  const snapshot = normalizeAppleHealthSnapshot(snapshotInput);
  const summary: AppleHealthMergeSummary = {
    importedDays: 0,
    updatedDays: 0,
    importedWeights: 0,
    updatedWeights: 0,
    preservedManualWeights: 0,
  };
  const days = { ...current.days };
  for (const imported of snapshot.days) {
    const existing = days[imported.date] ?? { date: imported.date };
    const nextHealth = healthSummary(imported, snapshot.generatedAt);
    if (!existing.health) summary.importedDays += 1;
    else if (!sameHealthFacts(existing.health, nextHealth)) summary.updatedDays += 1;
    else continue;
    days[imported.date] = { ...existing, health: nextHealth };
  }

  const weights = new Map(current.bodyWeights.map((entry) => [entry.date, entry]));
  for (const imported of snapshot.bodyWeights) {
    const existing = weights.get(imported.date);
    const next: BodyWeightEntry = {
      date: imported.date,
      weight: imported.weightKg,
      source: "appleHealth",
    };
    if (!existing) {
      weights.set(imported.date, next);
      summary.importedWeights += 1;
    } else if (existing.source === "appleHealth") {
      if (!same(existing, next)) {
        weights.set(imported.date, next);
        summary.updatedWeights += 1;
      }
    } else {
      summary.preservedManualWeights += 1;
    }
  }

  const healthSync: HealthSyncState = {
    provider: "appleHealth",
    lastSyncedAt: snapshot.generatedAt,
    ...(snapshot.rangeStart ? { rangeStart: snapshot.rangeStart } : {}),
    ...(snapshot.rangeEnd ? { rangeEnd: snapshot.rangeEnd } : {}),
    importedDays: snapshot.days.length,
    importedWeights: snapshot.bodyWeights.length,
  };
  return {
    data: {
      ...current,
      days,
      bodyWeights: [...weights.values()].sort((a, b) => a.date.localeCompare(b.date)),
      healthSync,
    },
    summary,
  };
}
