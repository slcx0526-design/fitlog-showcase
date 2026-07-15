"use client";

import type { SetRecord, SetTechnique } from "@/lib/types";
import { localeText, useI18n, type Locale } from "@/lib/i18n";

const TECHNIQUES: SetTechnique[] = ["normal", "dropSet", "restPause", "myoReps", "cluster", "technique", "rehab"];
const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

function techniqueCopy(technique: SetTechnique, locale: Locale) {
  if (technique === "dropSet") return { label: tx(locale, "掉重", "Drop set", "ドロップ"), detail: tx(locale, "最多 1.5", "Up to 1.5", "最大 1.5") };
  if (technique === "restPause") return { label: "Rest-pause", detail: tx(locale, "最多 1.5", "Up to 1.5", "最大 1.5") };
  if (technique === "myoReps") return { label: "Myo", detail: tx(locale, "最多 1.5", "Up to 1.5", "最大 1.5") };
  if (technique === "cluster") return { label: tx(locale, "集群", "Cluster", "クラスター"), detail: tx(locale, "不加成", "No bonus", "加算なし") };
  if (technique === "technique") return { label: tx(locale, "技术", "Technique", "フォーム"), detail: tx(locale, "最高 0.25", "Up to 0.25", "最大 0.25") };
  if (technique === "rehab") return { label: tx(locale, "康复", "Rehab", "リハビリ"), detail: tx(locale, "不进容量", "No volume", "集計外") };
  return { label: tx(locale, "普通", "Standard", "通常"), detail: tx(locale, "标准计入", "Standard count", "標準集計") };
}

export default function SetCapacityOptions({ set, onChange }: { set: SetRecord; onChange: (patch: Partial<SetRecord>) => void }) {
  const { locale } = useI18n();
  const completion = set.completion ?? "completed";
  const technique = set.technique ?? "normal";
  if (set.type === "warmup") return <div className="basis-full rounded-lg bg-surface-2 px-3 py-2 text-[10px] text-muted">{tx(locale, "旧热身记录仅保留历史，不计入训练容量。", "Legacy warm-up record kept for history and excluded from volume.", "旧ウォームアップ記録は履歴として保持し、ボリュームには含めません。")}</div>;
  return <div className="basis-full space-y-2 rounded-lg bg-surface-2 p-2">
    <section><p className="mb-1 text-[10px] font-semibold text-faint">{tx(locale, "完成质量", "Completion", "完了状態")}</p><div className="grid grid-cols-3 gap-1.5"><Choice label={tx(locale, "完整 1.0", "Complete 1.0", "完了 1.0")} active={completion === "completed"} onClick={() => onChange({ completion: "completed" })} /><Choice label={tx(locale, "部分 0.5", "Partial 0.5", "一部 0.5")} active={completion === "partial"} onClick={() => onChange({ completion: "partial" })} /><Choice label={tx(locale, "跳过 0", "Skipped 0", "スキップ 0")} active={completion === "skipped"} onClick={() => onChange({ completion: "skipped" })} /></div></section>
    <section><p className="mb-1 text-[10px] font-semibold text-faint">{tx(locale, "训练方法", "Set method", "セット方法")}</p><div className="grid grid-cols-3 gap-1.5">{TECHNIQUES.map((item) => { const copy = techniqueCopy(item, locale); return <button key={item} type="button" onClick={() => onChange({ technique: item })} className={"press rounded-md px-1 py-1.5 text-left " + (technique === item ? "bg-accent text-accent-fg" : "bg-surface text-muted")}><span className="block text-[10px] font-semibold">{copy.label}</span><span className="block text-[9px] opacity-75">{copy.detail}</span></button>; })}</div></section>
  </div>;
}

function Choice({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={"press h-9 rounded-md text-[11px] font-semibold " + (active ? "bg-accent text-accent-fg" : "bg-surface text-muted")}>{label}</button>;
}
