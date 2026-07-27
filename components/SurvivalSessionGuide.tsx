"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { formatSetCredit, summarizeSessionExecution } from "@/lib/trainingExecution";
import { formatRestTime, useRestTimer } from "@/lib/restTimer";
import { localeText, useI18n, type Locale } from "@/lib/i18n";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

/** A quieter workout companion with actual next-action and recovery state. */
export default function SurvivalSessionGuide() {
  const pathname = usePathname();
  const today = useToday();
  const { mode } = useUIMode();
  const { data } = useStore();
  const rest = useRestTimer();
  const { locale } = useI18n();

  const workout = data.days[today]?.workout;
  const current = useMemo(() => summarizeSessionExecution(workout), [workout]);

  if (mode !== "survival" || !pathname.startsWith("/train") || !workout || workout.type === "rest" || workout.done) return null;

  return (
    <section className="survival-session-guide mb-3" aria-label={tx(locale, "训练进度与休息", "Training progress and rest", "トレーニング進捗と休憩")} data-no-pulse>
      <div className="survival-session-guide__top">
        <span>{tx(locale, "训练进度", "Training progress", "トレーニング進捗")}</span>
        <span className="tnum">{formatSetCredit(current.completionCredits)}{current.plannedSets ? ` / ${current.plannedSets}` : ""} {tx(locale, "组", "sets", "セット")}</span>
      </div>
      <div className="survival-session-guide__body">
        <div className="min-w-0">
          <p className="survival-session-guide__eyebrow">{tx(locale, "下一项", "Next", "次の種目")}</p>
          <p className="truncate survival-session-guide__exercise">{current.next?.exercise.name ?? (current.rows.length ? tx(locale, "本次计划已完成", "Session plan complete", "今回の予定は完了") : tx(locale, "添加第一个动作", "Add the first exercise", "最初の種目を追加"))}</p>
          <p className="tnum survival-session-guide__meta">
            {current.next && current.next.plannedSets > 0
              ? tx(locale, `已完成 ${formatSetCredit(current.next.creditedSets)} / ${current.next.plannedSets} 工作组`, `${formatSetCredit(current.next.creditedSets)} / ${current.next.plannedSets} working sets complete`, `${formatSetCredit(current.next.creditedSets)} / ${current.next.plannedSets} ワーキングセット完了`)
              : current.rows.length
                ? tx(locale, "今天的训练计划已经完成", "Today's training plan is complete", "今日のトレーニング予定は完了")
                : tx(locale, "准备开始今天的训练", "Ready to start today's training", "今日のトレーニングを開始")}
          </p>
        </div>
        <div className="survival-session-guide__rest">
          {rest.isRunning ? (
            <div className="survival-session-guide__rest-options">
              <button type="button" onClick={() => rest.adjust(-15)} aria-label="减少 15 秒">-15</button>
              <button type="button" onClick={() => rest.stop()} className="survival-session-guide__rest-main"><span className="tnum">{formatRestTime(rest.secondsLeft)}</span><small>继续</small></button>
              <button type="button" onClick={() => rest.adjust(15)} aria-label="增加 15 秒">+15</button>
            </div>
          ) : (
            <div className="survival-session-guide__rest-options">
              {[60, 90, 120].map((seconds) => (
                <button key={seconds} type="button" onClick={() => rest.start(seconds)}>{seconds}s</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="survival-session-guide__track"><span style={{ width: `${current.completionPct ?? 6}%` }} /></div>
    </section>
  );
}
