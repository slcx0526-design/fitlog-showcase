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

/**
 * Midnight is a moonlit schedule deck: calm blue-white hierarchy, immediate
 * next-set guidance and a compact break clock. It remains fully original.
 */
export default function MidnightSessionDeck() {
  const pathname = usePathname();
  const today = useToday();
  const { mode } = useUIMode();
  const { data } = useStore();
  const rest = useRestTimer();
  const { locale } = useI18n();

  const workout = data.days[today]?.workout;
  const session = useMemo(() => summarizeSessionExecution(workout), [workout]);

  if (mode !== "midnight" || !pathname.startsWith("/train") || !workout || workout.type === "rest" || workout.done) return null;

  const taskText = session.next
    ? session.next.exercise.name
    : session.rows.length
      ? tx(locale, "本次计划已完成", "Session plan complete", "今回の予定は完了")
      : tx(locale, "添加第一个动作", "Add the first exercise", "最初の種目を追加");
  const taskMeta = session.next && session.next.plannedSets > 0
    ? tx(locale, `已完成 ${formatSetCredit(session.next.creditedSets)} / ${session.next.plannedSets} 个工作组`, `${formatSetCredit(session.next.creditedSets)} / ${session.next.plannedSets} working sets complete`, `${formatSetCredit(session.next.creditedSets)} / ${session.next.plannedSets} ワーキングセット完了`)
    : session.rows.length
      ? tx(locale, "今天的训练计划已经完成", "Today's training plan is complete", "今日のトレーニング予定は完了")
      : tx(locale, "准备开始今天的训练", "Ready to start today's training", "今日のトレーニングを開始");

  return (
    <section className="midnight-session-deck mb-3" aria-label={tx(locale, "午夜训练进度", "Midnight training progress", "ミッドナイト進捗")} data-no-pulse>
      <div className="midnight-deck-stamp">
        <span className="midnight-deck-orbit" aria-hidden="true" />
        <span>{tx(locale, "训练进度", "Training progress", "トレーニング進捗")}</span>
        <span className="tnum ml-auto">{formatSetCredit(session.completionCredits)}{session.plannedSets ? ` / ${session.plannedSets}` : ""} {tx(locale, "组", "sets", "セット")}</span>
      </div>
      <div className="midnight-deck-grid">
        <div className="min-w-0 midnight-deck-next">
          <p className="midnight-deck-label">{tx(locale, "下一项", "Next", "次の種目")}</p>
          <p className="truncate text-[15px] font-bold text-white">{taskText}</p>
          <p className="tnum mt-1 text-[10px] text-cyan-100/65">{taskMeta}</p>
        </div>
        <div className="midnight-deck-rest">
          <p className="midnight-deck-label">{tx(locale, "休息计时", "Rest timer", "休憩タイマー")}</p>
          {rest.isRunning ? (
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => rest.adjust(-15)} className="midnight-rest-adjust" aria-label="减少 15 秒">-15</button>
              <button type="button" onClick={() => rest.stop()} className="midnight-rest-core">
                <span className="tnum text-[20px] font-bold">{formatRestTime(rest.secondsLeft)}</span>
                <span>{tx(locale, "继续", "Resume", "再開")}</span>
              </button>
              <button type="button" onClick={() => rest.adjust(15)} className="midnight-rest-adjust" aria-label="增加 15 秒">+15</button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {[60, 90, 120].map((seconds) => (
                <button key={seconds} type="button" onClick={() => rest.start(seconds)} className="midnight-rest-preset">
                  {seconds}s
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="midnight-deck-track" aria-label={session.completionPct != null ? tx(locale, `今日训练进度 ${session.completionPct}%`, `Training progress ${session.completionPct}%`, `トレーニング進捗 ${session.completionPct}%`) : tx(locale, "今日有效工作组", "Today's working sets", "今日のワーキングセット")}>
        <span style={{ width: `${session.completionPct ?? 8}%` }} />
      </div>
    </section>
  );
}
