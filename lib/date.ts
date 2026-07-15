// ============================================================
// 日期工具：统一使用本地时区的 YYYY-MM-DD 作为键
// 字符串可直接按字典序比较 / 排序
// ============================================================

export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return toKey(new Date());
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysKey(key: string, delta: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + delta);
  return toKey(d);
}

/** 返回从今天往前 n 天的键（含今天），最新在前 */
export function lastNDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(toKey(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

/** 指定日期所在自然周（周一→周日）的 7 个键，按时间正序 */
export function weekKeysFor(anchorKey: string): string[] {
  const anchor = fromKey(anchorKey);
  const dow = (anchor.getDay() + 6) % 7; // 0 = 周一
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - dow);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    out.push(toKey(monday));
    monday.setDate(monday.getDate() + 1);
  }
  return out;
}

/** 当前自然周（周一→周日）的 7 个键，按时间正序 */
export function currentWeekKeys(): string[] {
  return weekKeysFor(todayKey());
}

// ---- 本地化日期显示（zh / ja / en） ----
export type DateLocale = "zh" | "ja" | "en";

const WD: Record<DateLocale, string[]> = {
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const REL: Record<DateLocale, { today: string; yesterday: string }> = {
  zh: { today: "今天", yesterday: "昨天" },
  ja: { today: "今日", yesterday: "昨日" },
  en: { today: "Today", yesterday: "Yest." },
};

/** zh：6月4日 周三 ｜ ja：6月4日（水）｜ en：Jun 4 · Wed */
export function formatDisplay(key: string, locale: DateLocale = "zh"): string {
  const d = fromKey(key);
  const mo = d.getMonth();
  const day = d.getDate();
  const wd = WD[locale][d.getDay()];
  if (locale === "en") return `${MONTHS_EN[mo]} ${day} · ${wd}`;
  if (locale === "ja") return `${mo + 1}月${day}日（${wd}）`;
  return `${mo + 1}月${day}日 ${wd}`;
}

/** 历史列表用的紧凑格式 */
export function formatCompact(key: string, locale: DateLocale = "zh"): { wd: string; md: string } {
  const d = fromKey(key);
  return {
    wd: WD[locale][d.getDay()],
    md: `${d.getMonth() + 1}.${d.getDate()}`,
  };
}

/** 例：今天 / 昨天 / 周三 */
export function relativeLabel(key: string, locale: DateLocale = "zh"): string {
  if (key === todayKey()) return REL[locale].today;
  if (key === addDaysKey(todayKey(), -1)) return REL[locale].yesterday;
  return WD[locale][fromKey(key).getDay()];
}

/**
 * "刚刚" / "12s 前" / "3m 前" / "1h 前"。
 * 超过 24 小时返回 null（再老就没参考价值了）。
 */
export function timeSince(iso: string | undefined, nowMs: number, locale: DateLocale = "zh"): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (s < 5) return locale === "ja" ? "たった今" : locale === "en" ? "just now" : "刚刚";
  if (s < 60) return `${s}s 前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m 前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h 前`;
  return null;
}

/** "X 天前 / 今天 / 昨天" —— 给"上次备份"标签用 */
export function daysAgo(iso: string | undefined, locale: DateLocale = "zh"): { days: number; label: string } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const then = new Date(t);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const days = Math.round((a - b) / 86400000);
  const label =
    days === 0
      ? REL[locale].today
      : days === 1
      ? REL[locale].yesterday
      : locale === "ja"
      ? `${days}日前`
      : locale === "en"
      ? `${days}d ago`
      : `${days} 天前`;
  return { days, label };
}

/** 校验 YYYY-MM-DD 且不晚于今天；非法或未来日期返回 null */
export function validPastOrToday(key: string | null | undefined): string | null {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = fromKey(key);
  if (Number.isNaN(d.getTime())) return null;
  // 规范化回 key，排除像 2026-02-31 这种越界日期
  if (toKey(d) !== key) return null;
  if (key > todayKey()) return null; // 不允许未来
  return key;
}
