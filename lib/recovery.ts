import type { DayLog, RecoveryCheckIn } from "./types";
import { shiftDate } from "./weight";

export type RecoveryDayState = "partial" | "ready" | "caution" | "low";

export interface RecoveryDayScore {
  date: string;
  score: number;
  signalCount: number;
  state: RecoveryDayState;
  components: {
    sleepHours?: number;
    sleepQuality?: number;
    energy?: number;
    soreness?: number;
    stress?: number;
  };
}

export interface RecoverySummary {
  today: RecoveryDayScore | null;
  latest: RecoveryDayScore | null;
  days7: RecoveryDayScore[];
  days28: RecoveryDayScore[];
  checkIns7d: number;
  checkIns28d: number;
  scoredDays7d: number;
  average7d: number | null;
  average28d: number | null;
  changeFromBaseline: number | null;
  lowDays7d: number;
  sustainedLow: boolean;
}

const round = (value: number) => Math.round(value);
const ratingScore = (value: number) => (value - 1) * 25;
const inverseRatingScore = (value: number) => (5 - value) * 25;

/** A transparent product heuristic, not a clinical sleep score. */
function sleepHoursScore(hours: number) {
  if (hours >= 7 && hours <= 9) return 100;
  if (hours < 7) return Math.max(0, 100 - (7 - hours) * 25);
  return Math.max(40, 100 - (hours - 9) * 15);
}

export function scoreRecoveryCheckIn(log: RecoveryCheckIn | undefined, date: string): RecoveryDayScore | null {
  if (!log) return null;
  const components: RecoveryDayScore["components"] = {};
  if (log.sleepHours != null) components.sleepHours = sleepHoursScore(log.sleepHours);
  if (log.sleepQuality != null) components.sleepQuality = ratingScore(log.sleepQuality);
  if (log.energy != null) components.energy = ratingScore(log.energy);
  if (log.soreness != null) components.soreness = inverseRatingScore(log.soreness);
  if (log.stress != null) components.stress = inverseRatingScore(log.stress);
  const values = Object.values(components).filter((value): value is number => typeof value === "number");
  if (!values.length) return null;
  const score = round(values.reduce((sum, value) => sum + value, 0) / values.length);
  const state: RecoveryDayState = values.length < 2
    ? "partial"
    : score >= 70 ? "ready" : score >= 50 ? "caution" : "low";
  return { date, score, signalCount: values.length, state, components };
}

function average(rows: RecoveryDayScore[]) {
  return rows.length ? round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : null;
}

export function summarizeRecovery(days: Record<string, DayLog>, today: string): RecoverySummary {
  const start28 = shiftDate(today, -27);
  const start7 = shiftDate(today, -6);
  const rows = Object.entries(days)
    .filter(([date, day]) => date >= start28 && date <= today && Boolean(day.recovery))
    .map(([date, day]) => scoreRecoveryCheckIn(day.recovery, date))
    .filter((row): row is RecoveryDayScore => Boolean(row))
    .sort((a, b) => b.date.localeCompare(a.date));
  const days7 = rows.filter((row) => row.date >= start7);
  const eligible7 = days7.filter((row) => row.signalCount >= 2);
  const eligible28 = rows.filter((row) => row.signalCount >= 2);
  const prior = eligible28.filter((row) => row.date < start7);
  const average7d = average(eligible7);
  const average28d = average(eligible28);
  const priorAverage = average(prior);
  const lowDays7d = eligible7.filter((row) => row.score < 50).length;
  const recentThree = eligible7.slice(0, 3);
  const sustainedLow = eligible7.length >= 3 && (
    (average7d != null && average7d < 55 && lowDays7d >= 2)
    || recentThree.filter((row) => row.score < 50).length >= 2
  );
  return {
    today: rows.find((row) => row.date === today) ?? null,
    latest: rows[0] ?? null,
    days7,
    days28: rows,
    checkIns7d: days7.length,
    checkIns28d: rows.length,
    scoredDays7d: eligible7.length,
    average7d,
    average28d,
    changeFromBaseline: average7d != null && priorAverage != null && eligible7.length >= 3 && prior.length >= 3
      ? average7d - priorAverage
      : null,
    lowDays7d,
    sustainedLow,
  };
}
