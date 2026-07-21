"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { formatSetCredit, summarizeSessionExecution } from "@/lib/trainingExecution";
import { formatRestTime, useRestTimer } from "@/lib/restTimer";

/** A quieter workout companion with actual next-action and recovery state. */
export default function SurvivalSessionGuide() {
  const pathname = usePathname();
  const today = useToday();
  const { mode } = useUIMode();
  const { data } = useStore();
  const rest = useRestTimer();

  const workout = data.days[today]?.workout;
  const current = useMemo(() => summarizeSessionExecution(workout), [workout]);

  if (mode !== "survival" || !pathname.startsWith("/train") || !workout || workout.type === "rest" || workout.done) return null;

  return (
    <section className="survival-session-guide mb-3" aria-label="训练野外指引" data-no-pulse>
      <div className="survival-session-guide__top">
        <span>ROUTE CARD</span>
        <span className="tnum">{formatSetCredit(current.completionCredits)}{current.plannedSets ? ` / ${current.plannedSets}` : ""} SETS</span>
      </div>
      <div className="survival-session-guide__body">
        <div className="min-w-0">
          <p className="survival-session-guide__eyebrow">NEXT CHECKPOINT</p>
          <p className="truncate survival-session-guide__exercise">{current.next?.exercise.name ?? (current.rows.length ? "本次计划已完成" : "添加第一个动作")}</p>
          <p className="tnum survival-session-guide__meta">
            {current.next && current.next.plannedSets > 0
              ? `已完成 ${formatSetCredit(current.next.creditedSets)} / ${current.next.plannedSets} 工作组`
              : current.rows.length ? "今天的训练路线已经完成" : "准备开始今天的行动"}
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
