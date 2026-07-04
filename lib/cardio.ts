import { fromKey, toKey } from "./date";
import type { CardioEntry, CutPlan, DayLog, Zone } from "./types";

/**
 * Cardio is tracked as a weekly execution target, not as a same-day calorie
 * adjustment. The default is deliberately conservative and can be changed by
 * the user inside the cut plan or Cardio page.
 */
export const DEFAULT_WEEKLY_CARDIO_MINUTES = 120;

export function weeklyCardioGoal(plan: CutPlan | undefined): number {
  const value = plan?.weeklyCardioMinutes;
  if (!value || !Number.isFinite(value)) return DEFAULT_WEEKLY_CARDIO_MINUTES;
  return Math.min(420, Math.max(30, Math.round(value)));
}

export function cardioMinutes(entries: CardioEntry[] | undefined): number {
  return (entries ?? []).reduce(
    (sum, entry) => sum + (Number.isFinite(entry.minutes) ? Math.max(0, entry.minutes) : 0),
    0,
  );
}

export interface CardioWeekSummary {
  dates: string[];
  totalMinutes: number;
  targetMinutes: number;
  progress: number;
  activeDays: number;
  sessions: number;
  zoneMinutes: Record<Zone, number>;
  unclassifiedMinutes: number;
  modeMinutes: Array<{ mode: string; minutes: number }>;
  dayMinutes: Record<string, number>;
}

/** Calendar week containing the supplied date, Monday through Sunday. */
export function weekKeysForDate(anchorDate?: string): string[] {
  const base = anchorDate ? fromKey(anchorDate) : new Date();
  const weekday = (base.getDay() + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - weekday);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return toKey(day);
  });
}

export function cardioWeekSummary(
  days: Record<string, DayLog>,
  plan: CutPlan | undefined,
  anchorDate?: string,
): CardioWeekSummary {
  const dates = weekKeysForDate(anchorDate);
  const targetMinutes = weeklyCardioGoal(plan);
  const zoneMinutes: Record<Zone, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const byMode = new Map<string, number>();
  const dayMinutes: Record<string, number> = {};
  let totalMinutes = 0;
  let sessions = 0;
  let activeDays = 0;
  let unclassifiedMinutes = 0;

  for (const date of dates) {
    const entries = days[date]?.cardio ?? [];
    const minutes = cardioMinutes(entries);
    dayMinutes[date] = minutes;
    if (minutes > 0) activeDays += 1;
    totalMinutes += minutes;
    sessions += entries.length;

    for (const entry of entries) {
      const safeMinutes = Number.isFinite(entry.minutes) ? Math.max(0, entry.minutes) : 0;
      const mode = entry.mode?.trim() || "有氧";
      byMode.set(mode, (byMode.get(mode) ?? 0) + safeMinutes);
      if (entry.zone) zoneMinutes[entry.zone] += safeMinutes;
      else unclassifiedMinutes += safeMinutes;
    }
  }

  return {
    dates,
    totalMinutes,
    targetMinutes,
    progress: targetMinutes > 0 ? Math.min(1, totalMinutes / targetMinutes) : 0,
    activeDays,
    sessions,
    zoneMinutes,
    unclassifiedMinutes,
    modeMinutes: Array.from(byMode.entries())
      .map(([mode, minutes]) => ({ mode, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
    dayMinutes,
  };
}
