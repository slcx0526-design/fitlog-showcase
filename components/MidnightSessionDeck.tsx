"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { formatSetCredit, summarizeSessionExecution } from "@/lib/trainingExecution";
import { formatRestTime, useRestTimer } from "@/lib/restTimer";

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

  const workout = data.days[today]?.workout;
  const session = useMemo(() => summarizeSessionExecution(workout), [workout]);

  if (mode !== "midnight" || !pathname.startsWith("/train") || !workout || workout.type === "rest" || workout.done) return null;

  const taskText = session.next ? session.next.exercise.name : session.rows.length ? "本次计划已完成" : "添加第一个动作";
  const taskMeta = session.next && session.next.plannedSets > 0
    ? `已完成 ${formatSetCredit(session.next.creditedSets)} / ${session.next.plannedSets} 个工作组`
    : session.rows.length ? "今天的训练计划已经完成" : "准备开始今天的训练时段";

  return (
    <section className="midnight-session-deck mb-3" aria-label="午夜训练日程" data-no-pulse>
      <div className="midnight-deck-stamp">
        <span className="midnight-deck-orbit" aria-hidden="true" />
        <span>MOONLIGHT SESSION</span>
        <span className="tnum ml-auto">{formatSetCredit(session.completionCredits)}{session.plannedSets ? ` / ${session.plannedSets}` : ""} SETS</span>
      </div>
      <div className="midnight-deck-grid">
        <div className="min-w-0 midnight-deck-next">
          <p className="midnight-deck-label">NEXT PERIOD</p>
          <p className="truncate text-[15px] font-bold text-white">{taskText}</p>
          <p className="tnum mt-1 text-[10px] text-cyan-100/65">{taskMeta}</p>
        </div>
        <div className="midnight-deck-rest">
          <p className="midnight-deck-label">BREAK TIME</p>
          {rest.isRunning ? (
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => rest.adjust(-15)} className="midnight-rest-adjust" aria-label="减少 15 秒">-15</button>
              <button type="button" onClick={() => rest.stop()} className="midnight-rest-core">
                <span className="tnum text-[20px] font-bold">{formatRestTime(rest.secondsLeft)}</span>
                <span>RESUME</span>
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
      <div className="midnight-deck-track" aria-label={session.completionPct != null ? `今日训练进度 ${session.completionPct}%` : "今日有效工作组"}>
        <span style={{ width: `${session.completionPct ?? 8}%` }} />
      </div>
    </section>
  );
}
