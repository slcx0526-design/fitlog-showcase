import type { DayLog, Schedule, TrainingType } from "./types";
import { addDaysKey, todayKey } from "./date";
import { workingSets } from "./prescription";

// 计划：0=周一 ... 6=周日
export const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const WEEKDAY_SHORT = ["一", "二", "三", "四", "五", "六", "日"];

/** JS getDay 是 0=周日，统一转换成 0=周一 */
export function weekdayIndexJS(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function todayWeekdayIndex(): number {
  return weekdayIndexJS(new Date());
}

export function dateKeyWeekdayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return weekdayIndexJS(new Date(y, m - 1, d));
}

export function getScheduledType(
  schedule: Schedule | undefined,
  weekdayIdx: number
): TrainingType | null {
  if (!schedule || schedule.split.length !== 7) return null;
  const t = schedule.split[weekdayIdx];
  return t === "" ? null : (t as TrainingType);
}

// ---- 完成状态判定 ----

export function isDayTrained(day: DayLog | undefined): boolean {
  const wk = day?.workout;
  if (!wk) return false;
  if (wk.type === "rest") return true;
  return wk.exercises.some((exercise) => workingSets(exercise.sets).length > 0);
}

export function isDayNutritionLogged(day: DayLog | undefined): boolean {
  return (day?.nutrition?.calories ?? 0) > 0;
}

export function isDayLogged(day: DayLog | undefined): boolean {
  return isDayTrained(day) || isDayNutritionLogged(day);
}

/** 训练日数量（不计 rest），用于减载提示等 */
export function trainingDayCountInLast(
  days: Record<string, DayLog>,
  n: number,
  anchorDate = todayKey()
): number {
  let count = 0;
  let cursor = anchorDate;
  for (let i = 0; i < n; i++) {
    const d = days[cursor];
    const wk = d?.workout;
    if (wk && wk.type !== "rest" && wk.exercises.some((exercise) => workingSets(exercise.sets).length > 0)) {
      count++;
    }
    cursor = addDaysKey(cursor, -1);
  }
  return count;
}

/** 从今天向前数：连续有任何记录（含 rest）的天数。今天没记录则从昨天开始数。 */
export function currentStreak(days: Record<string, DayLog>, anchorDate = todayKey()): number {
  let n = 0;
  let cursor = anchorDate;
  // 今天若没记录，允许从昨天起算（不打断昨晚没机会打开的情况）
  if (!isDayLogged(days[cursor])) {
    cursor = addDaysKey(cursor, -1);
  }
  while (n < 730) {
    if (!isDayLogged(days[cursor])) break;
    n++;
    cursor = addDaysKey(cursor, -1);
  }
  return n;
}
