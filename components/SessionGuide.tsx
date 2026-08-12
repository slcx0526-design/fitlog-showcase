"use client";

import { useMemo } from "react";
import type { WorkoutSession } from "@/lib/types";
import { useI18n, type Locale } from "@/lib/i18n";
import { formatSetCredit, summarizeSessionExecution } from "@/lib/trainingExecution";
import { formatRestTime, useRestTimer } from "@/lib/restTimer";
import { isWorkoutSessionClosed, summarizeWorkoutWork } from "@/lib/trainingMetrics";

const tx = (locale: Locale, zh: string, en: string, ja: string) =>
  locale === "en" ? en : locale === "ja" ? ja : zh;

export default function SessionGuide({ workout }: { workout: WorkoutSession | undefined }) {
  const { locale, tr } = useI18n();
  const rest = useRestTimer();
  const session = useMemo(() => summarizeSessionExecution(workout), [workout]);
  const recordedSets = useMemo(() => summarizeWorkoutWork(workout).recordedSets, [workout]);

  if (!workout || workout.type === "rest" || isWorkoutSessionClosed(workout)) return null;

  const next = session.next;
  const progressText = session.plannedSets > 0
    ? `${formatSetCredit(session.completionCredits)} / ${session.plannedSets}`
    : formatSetCredit(session.completionCredits);
  const task = next
    ? tr(next.exercise.name)
    : session.rows.length
      ? tx(locale, "本次计划已完成", "Session plan complete", "今回の予定は完了")
      : tx(locale, "添加第一个动作", "Add the first exercise", "最初の種目を追加");
  const taskDetail = next && next.plannedSets > 0
    ? tx(
        locale,
        `已完成 ${formatSetCredit(next.creditedSets)} / ${next.plannedSets} 组`,
        `${formatSetCredit(next.creditedSets)} / ${next.plannedSets} sets complete`,
        `${formatSetCredit(next.creditedSets)} / ${next.plannedSets} セット完了`,
      )
    : session.rows.length
      ? tx(locale, "按实际表现完成收尾", "Review and finish the session", "実績を確認して終了")
      : tx(locale, "选择动作后开始记录", "Choose an exercise to start logging", "種目を選んで記録を開始");

  function reviewSession() {
    document.getElementById("session-finish")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
  }

  return (
    <section
      className="session-guide mb-3"
      data-session-guide
      aria-label={tx(locale, "训练进度与休息计时", "Workout progress and rest timer", "トレーニング進捗と休憩タイマー")}
    >
      <div className="session-guide__summary">
        <div className="min-w-0">
          <p className="session-guide__label">{tx(locale, "下一项", "Next", "次の種目")}</p>
          <strong className="truncate">{task}</strong>
          <span className="tnum">{taskDetail}</span>
        </div>
        <div className="session-guide__count">
          <strong className="tnum">{progressText}</strong>
          <span>{tx(locale, "工作组", "working sets", "ワーキングセット")}</span>
        </div>
      </div>
      {session.completionPct != null && (
        <div
          className="session-guide__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={session.completionPct}
          aria-label={tx(locale, "训练完成进度", "Workout completion", "トレーニング進捗")}
        >
          <span style={{ width: `${session.completionPct}%` }} />
        </div>
      )}
      <div className="session-guide__controls">
        {rest.isRunning ? (
          <>
            <button type="button" onClick={() => rest.adjust(-15)} className="press" aria-label={tx(locale, "休息减少 15 秒", "Reduce rest by 15 seconds", "休憩を15秒短縮")}>-15</button>
            <button type="button" onClick={() => rest.stop()} className="press is-primary" aria-label={tx(locale, "结束休息", "End rest", "休憩を終了")}>
              <span className="tnum">{formatRestTime(rest.secondsLeft)}</span>
              <small>{tx(locale, "继续训练", "Resume", "再開")}</small>
            </button>
            <button type="button" onClick={() => rest.adjust(15)} className="press" aria-label={tx(locale, "休息增加 15 秒", "Add 15 seconds to rest", "休憩を15秒延長")}>+15</button>
          </>
        ) : (
          <>
            {[60, 90, 120].map((seconds) => (
              <button
                key={seconds}
                type="button"
                onClick={() => rest.start(seconds)}
                className="press"
                aria-label={tx(locale, `休息 ${seconds} 秒`, `Rest for ${seconds} seconds`, `${seconds}秒休憩`)}
              >
                {seconds}<small>{tx(locale, "秒", "s", "秒")}</small>
              </button>
            ))}
          </>
        )}
        {recordedSets > 0 && (
          <button type="button" onClick={reviewSession} className="press session-guide__finish">
            {tx(locale, "收尾", "Finish", "終了")}
          </button>
        )}
      </div>
    </section>
  );
}
