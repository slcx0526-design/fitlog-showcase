import type { Profile, Zone } from "./types";

// ============================================================
// 心率区间：渐进式
//   无数据         → 只给谈话测试（人人可用，不需设备）
//   有年龄         → Tanaka 公式估算最大心率，给出 bpm 区间
//   有静息心率     → Karvonen（心率储备法），区间更贴个人
//   有实测最大心率 → 覆盖估算
// 区间是参考，不是医疗建议。
// ============================================================

export interface ZoneMeta {
  zone: Zone;
  zh: string;
  en: string;
  pctLow: number; // 占比下界（最大心率 或 心率储备）
  pctHigh: number;
  talk: string; // 谈话测试，无设备也能照着估
}

export const ZONES: ZoneMeta[] = [
  { zone: 1, zh: "恢复", en: "RECOVERY", pctLow: 0.5, pctHigh: 0.6, talk: "很轻松，能轻松交谈甚至唱歌" },
  { zone: 2, zh: "有氧基础", en: "BASE", pctLow: 0.6, pctHigh: 0.7, talk: "能完整成句对话 · 燃脂主区" },
  { zone: 3, zh: "节奏", en: "TEMPO", pctLow: 0.7, pctHigh: 0.8, talk: "说话开始断续" },
  { zone: 4, zh: "阈值", en: "THRESHOLD", pctLow: 0.8, pctHigh: 0.9, talk: "只能蹦出几个词 · 间歇" },
  { zone: 5, zh: "最大", en: "VO₂MAX", pctLow: 0.9, pctHigh: 1.0, talk: "几乎说不出话 · 冲刺" },
];

export function zoneMeta(z: Zone): ZoneMeta {
  return ZONES[z - 1];
}

export function ageFromBirthYear(birthYear?: number): number | null {
  if (!birthYear || birthYear < 1900) return null;
  const age = new Date().getFullYear() - birthYear;
  if (age < 5 || age > 120) return null;
  return age;
}

export type MaxHRSource = "manual" | "estimated";

/** 最大心率：优先实测，否则按年龄 Tanaka 估算（208 − 0.7×年龄，比 220−年龄更准） */
export function maxHR(
  profile: Profile | undefined
): { bpm: number; source: MaxHRSource } | null {
  if (profile?.maxHR && profile.maxHR > 100 && profile.maxHR < 230) {
    return { bpm: profile.maxHR, source: "manual" };
  }
  const age = ageFromBirthYear(profile?.birthYear);
  if (age == null) return null;
  return { bpm: Math.round(208 - 0.7 * age), source: "estimated" };
}

/** 是否用 Karvonen（需静息心率且合理） */
function useKarvonen(profile: Profile | undefined, hrmax: number): boolean {
  const r = profile?.restingHR;
  return !!r && r >= 30 && r < hrmax;
}

/** 某区间的 bpm 范围；无法计算（缺最大心率）时返回 null */
export function zoneBpm(
  z: Zone,
  profile: Profile | undefined
): { low: number; high: number } | null {
  const m = maxHR(profile);
  if (!m) return null;
  const meta = zoneMeta(z);
  if (useKarvonen(profile, m.bpm)) {
    const reserve = m.bpm - (profile!.restingHR as number);
    const base = profile!.restingHR as number;
    return {
      low: Math.round(base + meta.pctLow * reserve),
      high: Math.round(base + meta.pctHigh * reserve),
    };
  }
  return {
    low: Math.round(meta.pctLow * m.bpm),
    high: Math.round(meta.pctHigh * m.bpm),
  };
}

/** 用平均心率反推区间；缺最大心率时返回 null */
export function zoneForBpm(bpm: number, profile: Profile | undefined): Zone | null {
  const m = maxHR(profile);
  if (!m || !bpm) return null;
  for (const meta of ZONES) {
    const r = zoneBpm(meta.zone, profile);
    if (r && bpm < r.high) return meta.zone;
  }
  return 5; // 高于 Z5 上界 → 封顶 Z5
}

/** 计算方法说明文案（tr 注入以便本地化） */
export function methodNote(
  profile: Profile | undefined,
  tr: (zh: string, params?: Record<string, string | number>) => string = (s) => s
): string {
  const m = maxHR(profile);
  if (!m) return tr("填入年龄即可显示你的具体心率区间");
  const k = useKarvonen(profile, m.bpm);
  if (m.source === "manual") {
    return k
      ? tr("基于实测最大心率 {bpm} + 静息心率（Karvonen）", { bpm: m.bpm })
      : tr("基于实测最大心率 {bpm}", { bpm: m.bpm });
  }
  return k
    ? tr("估算最大心率 {bpm} + 静息心率（Karvonen）· 估算值", { bpm: m.bpm })
    : tr("估算最大心率 {bpm}（按年龄）· 个体可差 ±10–12 bpm", { bpm: m.bpm });
}
