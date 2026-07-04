import type { BodyWeightEntry } from "./types";

/** YYYY-MM-DD 相减得到天数差（a - b，正数表示 a 更晚） */
function dayDiff(a: string, b: string): number {
  const da = Date.parse(a + "T00:00:00");
  const db = Date.parse(b + "T00:00:00");
  return Math.round((da - db) / 86400000);
}

/** 把日期串往前推 n 天，返回 YYYY-MM-DD */
export function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface WindowAvg {
  avg: number | null; // 该窗口的平均体重；无记录为 null
  count: number; // 落在窗口内的记录数
  start: string; // 窗口起始日（含）
  end: string; // 窗口结束日（含）
}

/**
 * 计算「以 endDate 结尾、往前 spanDays 天」窗口的平均体重。
 * 窗口为闭区间 [endDate - (spanDays-1), endDate]，按日期窗口而非次数。
 */
export function windowAverage(
  entries: BodyWeightEntry[],
  endDate: string,
  spanDays = 7
): WindowAvg {
  const start = shiftDate(endDate, -(spanDays - 1));
  const inWindow = entries.filter(
    (e) => dayDiff(e.date, start) >= 0 && dayDiff(endDate, e.date) >= 0
  );
  const count = inWindow.length;
  const avg =
    count > 0 ? inWindow.reduce((s, e) => s + e.weight, 0) / count : null;
  return { avg, count, start, end: endDate };
}

/**
 * 本周（最近 7 天，以 today 结尾）平均，以及「往前 weeksBack 周」的对比窗口平均。
 * weeksBack=1 表示上一周（再往前 7 天的那个 7 天窗口）。
 */
export function weeklyComparison(
  entries: BodyWeightEntry[],
  today: string,
  weeksBack: number
): { current: WindowAvg; previous: WindowAvg; delta: number | null } {
  const current = windowAverage(entries, today, 7);
  const prevEnd = shiftDate(today, -7 * weeksBack);
  const previous = windowAverage(entries, prevEnd, 7);
  const delta =
    current.avg != null && previous.avg != null
      ? current.avg - previous.avg
      : null;
  return { current, previous, delta };
}

/**
 * 为图表生成「7 日滚动平均」序列：对每个数据点，取其日期往前 7 天窗口的均值。
 * 输入需已按日期升序。返回与输入等长的 number 数组。
 */
export function rollingMean(
  data: BodyWeightEntry[],
  spanDays = 7
): number[] {
  return data.map((d) => {
    const start = shiftDate(d.date, -(spanDays - 1));
    const win = data.filter(
      (e) => dayDiff(e.date, start) >= 0 && dayDiff(d.date, e.date) >= 0
    );
    return win.reduce((s, e) => s + e.weight, 0) / win.length;
  });
}
