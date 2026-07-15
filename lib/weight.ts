import type { BodyWeightEntry } from "./types";

function localKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** YYYY-MM-DD 相减得到天数差（a - b，正数表示 a 更晚） */
function dayDiff(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00`);
  const db = Date.parse(`${b}T00:00:00`);
  return Math.round((da - db) / 86400000);
}

/** 按本地日历日期位移，绝不通过 UTC 序列化改写日期键。 */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localKey(d);
}

export interface WindowAvg {
  avg: number | null;
  count: number;
  start: string;
  end: string;
}

export function windowAverage(entries: BodyWeightEntry[], endDate: string, spanDays = 7): WindowAvg {
  const start = shiftDate(endDate, -(spanDays - 1));
  const inWindow = entries.filter((entry) => dayDiff(entry.date, start) >= 0 && dayDiff(endDate, entry.date) >= 0);
  const count = inWindow.length;
  const avg = count > 0 ? inWindow.reduce((sum, entry) => sum + entry.weight, 0) / count : null;
  return { avg, count, start, end: endDate };
}

export function weeklyComparison(entries: BodyWeightEntry[], today: string, weeksBack: number): { current: WindowAvg; previous: WindowAvg; delta: number | null } {
  const current = windowAverage(entries, today, 7);
  const previous = windowAverage(entries, shiftDate(today, -7 * weeksBack), 7);
  const delta = current.avg != null && previous.avg != null ? current.avg - previous.avg : null;
  return { current, previous, delta };
}

export function rollingMean(data: BodyWeightEntry[], spanDays = 7): number[] {
  return data.map((entry) => {
    const start = shiftDate(entry.date, -(spanDays - 1));
    const window = data.filter((item) => dayDiff(item.date, start) >= 0 && dayDiff(entry.date, item.date) >= 0);
    return window.reduce((sum, item) => sum + item.weight, 0) / window.length;
  });
}