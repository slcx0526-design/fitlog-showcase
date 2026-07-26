"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { buildPersonalCalibration, type MuscleCalibration } from "@/lib/personalization";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { useToast } from "@/lib/toast";
import { useI18n, type Locale } from "@/lib/i18n";

const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;

export default function PersonalCalibrationPanel() {
  const { data, setMuscleTarget } = useStore();
  const { locale, tr } = useI18n();
  const toast = useToast();
  const today = useToday();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => buildPersonalCalibration(data, today), [data, today]);
  const sampled = rows
    .filter((row) => row.sampledCycles > 0)
    .sort((a, b) => {
      const action = { reduce: 0, personalize: 1, maintain: 2, collect: 3 };
      return action[a.action] - action[b.action] || b.sampledCycles - a.sampledCycles;
    });
  const visible = showAll ? sampled : sampled.slice(0, 6);
  const ready = rows.filter((row) => row.confidence === "ready").length;
  const actionable = rows.filter((row) => row.action === "personalize" || row.action === "reduce").length;

  return (
    <section className="control-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-fg">{tx(locale, "个体容量校准", "Personal volume calibration", "個別ボリューム校正")}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{tx(locale, "只从完整建设周期、直接容量、同轨道趋势和训练难度推导；建议必须手动采用。", "Derived only from completed build cycles, direct volume, same-track trends, and session difficulty. Every change requires your approval.", "完了した構築サイクル、直接ボリューム、同一トラックの推移、セッション難度のみから算出し、変更は手動で承認します。")}</p>
        </div>
        <span className={"tnum shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold " + (actionable ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>
          {actionable
            ? tx(locale, `${actionable} 项可校准`, `${actionable} to calibrate`, `${actionable} 件を校正可能`)
            : ready
              ? tx(locale, `${ready} 项已稳定`, `${ready} stable`, `${ready} 件が安定`)
              : tx(locale, "收集中", "Collecting", "収集中")}
        </span>
      </div>

      {!sampled.length ? (
        <div className="mt-3 rounded-xl border border-dashed border-border px-3 py-4 text-center">
          <p className="text-[11px] text-muted">{tx(locale, "至少完成两个微周期后，系统才会尝试学习你的实际可恢复容量。", "Complete at least two microcycles before FitLog estimates your recoverable volume.", "少なくとも2つのマイクロサイクルを完了すると、回復可能なボリュームを推定します。")}</p>
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {visible.map((row) => {
              const open = expanded === row.muscle;
              const changed = row.currentTarget.low !== row.suggestedTarget.low || row.currentTarget.high !== row.suggestedTarget.high;
              const muscleLabel = tr(MUSCLE_LABELS[row.muscle]);
              return (
                <div key={row.muscle} className="rounded-xl bg-surface-2 px-2.5 py-2">
                  <button type="button" onClick={() => setExpanded(open ? null : row.muscle)} aria-expanded={open} className="press flex w-full items-center gap-2 text-left">
                    <span className="min-w-0 flex-1 text-[12px] font-semibold text-fg">{muscleLabel}</span>
                    <span className="tnum text-[10px] text-faint">{tx(locale, `${row.sampledCycles} 周期 · 典型 ${row.typicalDirectSets ?? "—"} 组`, `${row.sampledCycles} cycles · typical ${row.typicalDirectSets ?? "—"} sets`, `${row.sampledCycles}周期・標準 ${row.typicalDirectSets ?? "—"}セット`)}</span>
                    <span className={"rounded-md px-1.5 py-0.5 text-[9px] font-semibold " + (row.action === "reduce" ? "bg-warn-soft text-warn" : row.action === "personalize" ? "bg-accent-soft text-accent" : "bg-surface text-muted")}>
                      {row.action === "reduce"
                        ? tx(locale, "先降上限", "Lower ceiling", "上限を下げる")
                        : row.action === "personalize"
                          ? tx(locale, "可校准", "Calibrate", "校正可能")
                          : row.confidence === "ready"
                            ? tx(locale, "稳定", "Stable", "安定")
                            : tx(locale, "观察", "Observe", "観察")}
                    </span>
                  </button>
                  {open && (
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="text-[10px] leading-relaxed text-muted">{calibrationReason(row, locale, muscleLabel)}</p>
                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                        <Fact label={tx(locale, "当前目标", "Current target", "現在の目標")} value={`${row.currentTarget.low}–${row.currentTarget.high}`} />
                        <Fact label={tx(locale, "建议目标", "Suggested target", "提案目標")} value={`${row.suggestedTarget.low}–${row.suggestedTarget.high}`} accent={changed} />
                        <Fact label={tx(locale, "轨道变化", "Track trends", "トラック推移")} value={`↑${row.improvingTracks} · ↓${row.regressingTracks}`} />
                      </div>
                      <p className="mt-2 text-[9px] text-faint">{tx(locale, `难度样本 ${row.difficultySamples}`, `${row.difficultySamples} difficulty samples`, `難度サンプル ${row.difficultySamples}`)}{row.hardRate == null
                        ? tx(locale, " · 暂无吃力比例", " · no hard-session rate yet", "・高難度率は未算出")
                        : tx(locale, ` · 吃力 ${Math.round(row.hardRate * 100)}%`, ` · hard ${Math.round(row.hardRate * 100)}%`, `・高難度 ${Math.round(row.hardRate * 100)}%`)}</p>
                      {changed && (
                        <button
                          type="button"
                          onClick={() => {
                            setMuscleTarget(row.muscle, row.suggestedTarget.low, row.suggestedTarget.high);
                            toast.show(tx(locale, `${muscleLabel}目标已采用 ${row.suggestedTarget.low}–${row.suggestedTarget.high}`, `${muscleLabel} target set to ${row.suggestedTarget.low}–${row.suggestedTarget.high}`, `${muscleLabel}の目標を ${row.suggestedTarget.low}–${row.suggestedTarget.high} に設定しました`));
                          }}
                          className="press mt-2 h-9 w-full rounded-lg bg-fg text-[11px] font-semibold text-bg"
                        >
                          {tx(locale, "采用此校准", "Apply calibration", "この校正を適用")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {sampled.length > 6 && (
            <button type="button" onClick={() => setShowAll((value) => !value)} className="press mt-2 h-9 w-full rounded-lg text-[11px] font-semibold text-accent">
              {showAll
                ? tx(locale, "收起", "Show less", "閉じる")
                : tx(locale, `查看其余 ${sampled.length - 6} 个肌群`, `View ${sampled.length - 6} more muscles`, `残り${sampled.length - 6}部位を表示`)}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function calibrationReason(row: MuscleCalibration, locale: Locale, muscleLabel: string) {
  if (row.reasonKind === "insufficientCycles") {
    return tx(
      locale,
      `${muscleLabel}还没有两个完整建设周期的直接容量，先保持当前目标并继续记录。`,
      `${muscleLabel} does not yet have direct-volume evidence from two completed build cycles. Keep the current target and continue logging.`,
      `${muscleLabel}は完了した構築サイクル2回分の直接ボリュームがまだありません。現在の目標を維持して記録を続けます。`,
    );
  }
  if (row.reasonKind === "recoveryPressure") {
    return tx(
      locale,
      `典型容量 ${row.typicalDirectSets} 组，同时出现 ${row.regressingTracks} 条回落轨道和 ${Math.round((row.hardRate ?? 0) * row.difficultySamples)}/${row.difficultySamples} 次吃力记录；先收窄上限，不追加容量。`,
      `Typical volume is ${row.typicalDirectSets} sets, with ${row.regressingTracks} regressing tracks and ${Math.round((row.hardRate ?? 0) * row.difficultySamples)}/${row.difficultySamples} hard sessions. Narrow the ceiling before adding volume.`,
      `標準ボリュームは${row.typicalDirectSets}セットで、低下トラック${row.regressingTracks}件、高難度${Math.round((row.hardRate ?? 0) * row.difficultySamples)}/${row.difficultySamples}回です。追加せず上限を下げます。`,
    );
  }
  if (row.reasonKind === "positiveEvidence") {
    return tx(
      locale,
      `${row.sampledCycles} 个周期的典型直接容量为 ${row.typicalDirectSets} 组，${row.improvingTracks} 条轨道提升、${row.regressingTracks} 条回落；建议把目标贴近已验证的可恢复区间。`,
      `Across ${row.sampledCycles} cycles, typical direct volume is ${row.typicalDirectSets} sets with ${row.improvingTracks} improving and ${row.regressingTracks} regressing tracks. Move the target toward this demonstrated recoverable range.`,
      `${row.sampledCycles}周期の標準直接ボリュームは${row.typicalDirectSets}セットで、向上${row.improvingTracks}件、低下${row.regressingTracks}件です。実証された回復可能範囲に目標を近づけます。`,
    );
  }
  return tx(
    locale,
    `典型容量 ${row.typicalDirectSets} 组，但当前没有足够的正向表现证据支持改目标；保持 ${row.currentTarget.low}–${row.currentTarget.high}，继续观察。`,
    `Typical volume is ${row.typicalDirectSets} sets, but positive performance evidence is not strong enough to change the target. Keep ${row.currentTarget.low}–${row.currentTarget.high} and continue observing.`,
    `標準ボリュームは${row.typicalDirectSets}セットですが、目標変更を支える向上証拠が不足しています。${row.currentTarget.low}–${row.currentTarget.high}を維持して観察します。`,
  );
}

function Fact({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-lg bg-surface px-1.5 py-1.5"><p className="text-[8px] font-semibold text-faint">{label}</p><p className={"tnum mt-0.5 text-[10px] font-bold " + (accent ? "text-accent" : "text-fg")}>{value}</p></div>;
}
