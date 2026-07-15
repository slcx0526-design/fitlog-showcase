"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { buildCutCoachReview } from "@/lib/cutCoach";
import { DEFAULT_CUT_VOLUME_SCALE, isCutModeActive } from "@/lib/cutMode";
import { buildWeeklyCutTrainingPlan } from "@/lib/cutTraining";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { useI18n, type Locale } from "@/lib/i18n";

const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;

export default function CutTrainingNotice() {
  const { data, loaded } = useStore();
  const { locale, tr } = useI18n();
  const today = useToday();
  const active = isCutModeActive(data.cutPlan);
  const review = useMemo(() => buildCutCoachReview(data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, today), [data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, today]);
  const training = useMemo(() => buildWeeklyCutTrainingPlan({ plan: data.cutPlan, templates: data.templates, customExercises: data.customExercises, schedule: data.schedule }), [data.cutPlan, data.templates, data.customExercises, data.schedule]);
  if (!loaded || !active) return null;
  const scale = data.cutPlan?.trainingVolumeScale ?? DEFAULT_CUT_VOLUME_SCALE;
  const caution = review.state === "slowDown" || review.state === "guardrail";
  const planReady = training.normalWeeklySets > 0;
  const setUnit = tx(locale, "组", "sets", "セット");
  return <div className={"mb-3 rounded-xl border px-3 py-2.5 " + (caution ? "border-warn/35 bg-warn-soft" : "border-accent/35 bg-accent-soft")}>
    <p className={"text-[11px] font-semibold uppercase tracking-wide " + (caution ? "text-warn" : "text-accent")}>CUT · TRAINING</p>
    <p className="mt-0.5 text-[13px] font-semibold text-fg">{tx(locale, `工作组按 ${Math.round(scale * 100)}% 执行，重量不纳入计算`, `Working sets run at ${Math.round(scale * 100)}%; load is not part of the calculation`, `ワーキングセットは ${Math.round(scale * 100)}% で実施。重量は計算に含めません`)}</p>
    {planReady ? <><p className="tnum mt-1 text-[11px] text-muted">{tx(locale, `周工作组 ${training.normalWeeklySets} → ${training.cutWeeklySets} · 有效容量 ${training.normalWeeklyVolume} → ${training.cutWeeklyVolume}`, `Weekly work sets ${training.normalWeeklySets} → ${training.cutWeeklySets} · effective volume ${training.normalWeeklyVolume} → ${training.cutWeeklyVolume}`, `週間ワーキングセット ${training.normalWeeklySets} → ${training.cutWeeklySets} · 有効ボリューム ${training.normalWeeklyVolume} → ${training.cutWeeklyVolume}`)}</p><details className="mt-2 rounded-lg bg-surface/70 px-2.5 py-2"><summary className="cursor-pointer text-[11px] font-semibold text-fg">{tx(locale, "查看每次与每周组数", "View session and weekly sets", "各回と週間セット数を見る")}</summary><div className="mt-2 space-y-2">{training.templates.map((template) => <div key={template.templateId} className="soft-divider border-t pt-2 first:border-t-0 first:pt-0"><p className="flex items-center justify-between gap-2 text-[11px] font-semibold text-fg"><span className="min-w-0 truncate">{tr(template.templateName)} · {tx(locale, `每周 ${template.weeklySessions} 次`, `${template.weeklySessions}× / week`, `週 ${template.weeklySessions} 回`)}</span><span className="tnum shrink-0">{template.normalSetsPerSession} → {template.cutSetsPerSession} {setUnit}</span></p><div className="mt-1 space-y-1">{template.exercises.map((exercise) => <p key={exercise.exerciseId} className="flex items-center justify-between gap-2 text-[10px]"><span className="min-w-0 truncate text-muted">{tr(exercise.name)}{exercise.isMain ? ` · ${tx(locale, "主项", "Main", "メイン")}` : ""}</span><span className="tnum shrink-0 text-fg">{exercise.normalSets} → {exercise.cutSets}</span></p>)}</div><p className="tnum mt-1 text-[10px] text-faint">{tx(locale, `周组数 ${template.normalWeeklySets} → ${template.cutWeeklySets}`, `Weekly sets ${template.normalWeeklySets} → ${template.cutWeeklySets}`, `週間セット数 ${template.normalWeeklySets} → ${template.cutWeeklySets}`)}</p></div>)}</div></details>{training.muscleVolumes.length > 0 && <details className="mt-2 rounded-lg bg-surface/70 px-2.5 py-2"><summary className="cursor-pointer text-[11px] font-semibold text-fg">{tx(locale, "查看各肌群有效周容量", "View effective weekly volume by muscle", "筋群ごとの有効週間ボリュームを見る")}</summary><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">{training.muscleVolumes.map((item) => <p key={item.muscle} className="flex items-center justify-between gap-2 text-[10px]"><span className="text-muted">{tr(MUSCLE_LABELS[item.muscle])}</span><span className="tnum text-fg">{item.normalWeeklySets} → {item.cutWeeklySets}</span></p>)}</div></details>}</> : <p className="mt-1 text-[11px] text-muted">{tx(locale, "套用训练模板后，会显示本次和本周的工作组与有效容量。", "Apply a training template to see session and weekly work sets and effective volume.", "トレーニングテンプレートを適用すると、各回と週間のワーキングセット・有効ボリュームが表示されます。")}</p>}
    <p className="mt-2 text-[10px] leading-relaxed text-muted">{tx(locale, "不自动降重量、不统计吨位；主动作保留，负重按当天状态自行调整。", "Loads are not auto-reduced and tonnage is not counted. Keep main movements and adjust load for the day.", "重量は自動で下げず、トン数も集計しません。メイン種目は維持し、負荷は当日の状態で調整します。")}</p>
  </div>;
}