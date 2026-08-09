"use client";

import Link from "next/link";
import { useMemo } from "react";
import TrainingWorkspaceNav from "@/components/TrainingWorkspaceNav";
import { buildAdaptiveResponseModel } from "@/lib/adaptiveResponse";
import { adaptiveText } from "@/lib/adaptiveText";
import { useToday } from "@/lib/hooks";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { useStore } from "@/lib/store";

export default function AdaptiveOutcomesPage() {
  const { loaded, data } = useStore();
  const { locale } = useI18n();
  const today = useToday();
  const model = useMemo(() => buildAdaptiveResponseModel(data, today), [data, today]);
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

  if (!loaded) {
    return <div className="adaptive-workspace space-y-3"><div className="h-20 rounded-lg bg-surface-2" /><div className="h-64 rounded-lg bg-surface-2" /></div>;
  }

  const confidence = {
    low: t("不足", "Low", "不足"),
    building: t("建立中", "Building", "構築中"),
    ready: t("充分", "Ready", "十分"),
  }[model.confidence];
  const tolerance = {
    unknown: t("未知", "Unknown", "不明"),
    low: t("偏低", "Low", "低め"),
    balanced: t("平衡", "Balanced", "適正"),
    high: t("偏高", "High", "高め"),
  }[model.tolerance];
  const nextVolume = model.volumeBias > 0
    ? t(`下一周期可尝试 +${Math.round(model.volumeBias * 100)}% 容量`, `Try +${Math.round(model.volumeBias * 100)}% volume next cycle`, `次周期はボリューム +${Math.round(model.volumeBias * 100)}% を検討`)
    : model.volumeBias < 0
      ? t(`下一周期优先减少 ${Math.abs(Math.round(model.volumeBias * 100))}% 容量`, `Reduce volume by ${Math.abs(Math.round(model.volumeBias * 100))}% next cycle`, `次周期はボリュームを ${Math.abs(Math.round(model.volumeBias * 100))}% 削減`)
      : t("下一周期维持当前容量", "Hold current volume next cycle", "次周期も現在のボリュームを維持");
  const nextFrequency = model.trainingDayDelta > 0
    ? t("恢复允许时增加 1 个训练日", "Add one training day when recovery allows", "回復が許せばトレーニング日を1日追加")
    : model.trainingDayDelta < 0
      ? t("下一周期减少 1 个训练日", "Remove one training day next cycle", "次周期はトレーニング日を1日減らす")
      : t("维持当前训练频率", "Hold current training frequency", "現在の頻度を維持");

  return (
    <div className="adaptive-workspace pb-8">
      <header className="page-heading">
        <div>
          <p className="page-heading__eyebrow">{t("训练反应", "Training response", "トレーニング反応")}</p>
          <h1>{t("个人训练反应", "Personal response", "個人トレーニング反応")}</h1>
          <p className="page-heading__meta">{t("完整周期之间的剂量与结果比较", "Dose and outcome comparisons across completed cycles", "完了周期間の負荷と結果を比較")}</p>
        </div>
      </header>

      <TrainingWorkspaceNav active="outcomes" />

      <div className="adaptive-layout mt-4">
        <div className="space-y-3">
          <section className="control-card p-4">
            <SectionTitle title={t("当前结论", "Current conclusion", "現在の結論")} detail={t("长期结果只影响下一周期", "Long-term outcomes affect only the next cycle", "長期結果は次周期だけに反映")} />
            <div className="grid grid-cols-2 gap-2">
              <Fact label={t("置信度", "Confidence", "信頼度")} value={confidence} />
              <Fact label={t("容量耐受", "Tolerance", "ボリューム耐性")} value={tolerance} />
              <Fact label={t("有效周期", "Valid cycles", "有効周期")} value={String(model.evaluatedCycles)} />
              <Fact label={t("周期比较", "Comparisons", "周期比較")} value={String(model.comparableTransitions)} />
            </div>

            <div className="adaptive-conclusion mt-3" data-confidence={model.confidence}>
              <p className="text-[14px] font-semibold leading-relaxed text-fg">{adaptiveText(locale, model.summary)}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Recommendation label={t("容量", "Volume", "ボリューム")} value={nextVolume} />
                <Recommendation label={t("频率", "Frequency", "頻度")} value={nextFrequency} />
              </div>
              {model.reasons.length > 0 && <details className="adaptive-inline-details mt-3"><summary>{t("查看判断依据", "View reasoning", "判断根拠を見る")}</summary><div className="mt-2 space-y-1">{model.reasons.map((reason) => <p key={reason}>{adaptiveText(locale, reason)}</p>)}</div></details>}
            </div>
          </section>

          <section className="control-card overflow-hidden">
            <div className="p-4">
              <SectionTitle title={t("周期结果", "Cycle outcomes", "周期結果")} detail={t("仅统计已结束且至少含两次有效训练的周期", "Completed cycles with at least two valid sessions", "終了済みで有効なトレーニングが2回以上ある周期のみ")} />
            </div>
            {model.cycles.length ? (
              <div className="soft-divider border-t">
                {model.cycles.map((cycle) => (
                  <div key={cycle.microcycleId} className="adaptive-result-row soft-divider border-t px-4 py-3 first:border-t-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold text-fg">{formatCycleDate(cycle.startedAt, locale)} – {formatCycleDate(cycle.endedAt, locale)}</p>
                        <p className="mt-0.5 text-[11px] text-faint">{cycle.phase === "build" ? t("构建周期", "Build cycle", "構築周期") : t("减载周期", "Deload cycle", "デロード周期")} · {t(`${cycle.sessions} 次训练`, `${cycle.sessions} sessions`, `${cycle.sessions} セッション`)}</p>
                      </div>
                      <span className="adaptive-scale tnum">{Math.round(cycle.averageAdaptiveScale * 100)}%</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <MiniFact label={t("完成率", "Completion", "完了率")} value={`${cycle.completionPct}%`} />
                      <MiniFact label={t("困难占比", "Hard sessions", "高難度比率")} value={cycle.hardRatio == null ? t("未知", "Unknown", "不明") : `${Math.round(cycle.hardRatio * 100)}%`} />
                      <MiniFact label={t("进阶兑现", "Progression", "進行達成")} value={cycle.progressionPct == null ? t("样本不足", "Insufficient", "データ不足") : `${cycle.progressionPct}%`} />
                      <MiniFact label={t("恢复均值", "Recovery", "平均回復")} value={cycle.recoveryAverage == null ? t("样本不足", "Insufficient", "データ不足") : String(cycle.recoveryAverage)} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="soft-divider border-t px-4 py-4">
                <p className="text-[13px] font-semibold text-fg">{t("模型进度 0 / 2 个可比较周期", "Model progress: 0 / 2 comparable cycles", "モデル進捗：比較可能な周期 0 / 2")}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{t("继续完成当前微周期并记录训练难度，结束两轮后自动生成比较。", "Complete the current microcycle and log session difficulty. Comparisons appear after two cycles.", "現在の微周期を完了し、難易度を記録してください。2周期後に比較が作成されます。")}</p>
                <Link href="/train" className="press mt-3 inline-flex h-10 items-center rounded-md bg-fg px-3 text-[12px] font-semibold text-bg">{t("继续训练", "Continue training", "トレーニングを続ける")}</Link>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-3">
          <section className="control-card p-4">
            <SectionTitle title={t("相邻周期比较", "Adjacent-cycle comparison", "隣接周期の比較")} detail={t("训练量变化后，结果是否同步改善", "Whether outcomes improved with the dose change", "負荷変更後に結果も改善したか")} />
            {model.transitions.length ? (
              <div className="space-y-2">
                {model.transitions.map((transition) => (
                  <div key={`${transition.fromMicrocycleId}:${transition.toMicrocycleId}`} className="control-strip rounded-md px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] font-semibold text-fg">{t("训练量", "Training load", "トレーニング量")} {Math.round(transition.loadRatio * 100)}%</p>
                      <span className="adaptive-outcome" data-outcome={transition.outcome}>{transition.outcome === "positive" ? t("改善", "Improved", "改善") : transition.outcome === "negative" ? t("恶化", "Declined", "悪化") : t("稳定", "Stable", "安定")}</span>
                    </div>
                    <div className="mt-2 space-y-1">{transition.reasons.map((reason) => <p key={reason} className="text-[11px] text-muted">{adaptiveText(locale, reason)}</p>)}</div>
                  </div>
                ))}
              </div>
            ) : <p className="text-[12px] leading-relaxed text-faint">{t("完成第二个可比较构建周期后显示。", "Appears after the second comparable build cycle.", "比較可能な構築周期を2つ完了すると表示されます。")}</p>}
          </section>

          <details className="adaptive-disclosure control-card">
            <summary>
              <span><strong>{t("自动化边界", "Automation boundaries", "自動化の境界")}</strong><small>{t("历史不改写，增量须经过周期审核", "History stays immutable; increases require cycle review", "履歴は変更せず、増量は周期レビューで確認")}</small></span>
              <Chevron />
            </summary>
            <div className="soft-divider space-y-2 border-t px-4 py-3 text-[12px] leading-relaxed text-muted">
              <p>{t("已完成训练和历史周期快照不会被修改。", "Completed workouts and historical cycle snapshots are never modified.", "完了済みトレーニングと過去の周期スナップショットは変更しません。")}</p>
              <p>{t("高耐受只允许在周期审核时逐步加量。", "High tolerance permits gradual increases only during cycle review.", "高い耐性による増量は周期レビュー時のみ段階的に行います。")}</p>
              <p>{t("自动频率每次最多变化 1 天，增加训练日需要高置信数据和明确授权。", "Automatic frequency changes are capped at one day; increases require ready evidence and explicit permission.", "自動頻度変更は1日まで。追加には十分なデータと明示的な許可が必要です。")}</p>
              <p>{t("全部结果在本地计算，不上传训练记录。", "All results are calculated locally; workout records are not uploaded.", "結果はすべて端末内で計算し、記録はアップロードしません。")}</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return <div className="mb-3"><h2 className="text-[16px] font-semibold text-fg">{title}</h2><p className="mt-0.5 text-[11px] leading-relaxed text-faint">{detail}</p></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="adaptive-fact"><p>{label}</p><strong>{value}</strong></div>;
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return <div className="adaptive-mini-fact"><p>{label}</p><strong>{value}</strong></div>;
}

function Recommendation({ label, value }: { label: string; value: string }) {
  return <div className="adaptive-recommendation"><p>{label}</p><strong>{value}</strong></div>;
}

function Chevron() {
  return <svg className="adaptive-chevron" aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function formatCycleDate(date: string, locale: Locale) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, { month: "short", day: "numeric" }).format(parsed);
}
