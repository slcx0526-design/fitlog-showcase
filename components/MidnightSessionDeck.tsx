"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { pulseFeedback } from "@/lib/feedback";
import { plannedWorkingSets, workingSets } from "@/lib/trainingMetrics";

function workingSetCount(sets: Parameters<typeof workingSets>[0]) {
  return workingSets(sets).length;
}

function timeCode(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * Midnight is a moonlit schedule deck: calm blue-white hierarchy, immediate
 * next-set guidance and a compact break clock. It remains fully original.
 */
export default function MidnightSessionDeck() {
  const pathname = usePathname();
  const today = useToday();
  const { mode } = useUIMode();
  const { data } = useStore();
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const workout = data.days[today]?.workout;
  const session = useMemo(() => {
    const exercises = workout?.exercises ?? [];
    const total = exercises.reduce((sum, exercise) => sum + workingSetCount(exercise.sets), 0);
    const planned = exercises.reduce((sum, exercise) => sum + plannedWorkingSets(exercise), 0);
    const active = exercises.find((exercise) => {
      const target = plannedWorkingSets(exercise);
      return target > 0 && workingSetCount(exercise.sets) < target;
    }) ?? exercises.find((exercise) => workingSetCount(exercise.sets) === 0) ?? exercises[0];
    const activeTarget = active ? plannedWorkingSets(active) : 0;
    const activeDone = active ? workingSetCount(active.sets) : 0;
    return { total, planned, active, activeTarget, activeDone };
  }, [workout]);

  useEffect(() => {
    if (!restEndsAt) return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [restEndsAt]);

  const secondsLeft = restEndsAt ? Math.max(0, Math.ceil((restEndsAt - now) / 1000)) : 0;
  useEffect(() => {
    if (restEndsAt && secondsLeft === 0) {
      setRestEndsAt(null);
      pulseFeedback("finish");
    }
  }, [restEndsAt, secondsLeft]);

  if (mode !== "midnight" || !pathname.startsWith("/train") || !workout || workout.type === "rest") return null;

  const taskText = session.active ? session.active.name : "添加第一个动作";
  const taskMeta = session.active && session.activeTarget > 0
    ? `第 ${Math.min(session.activeDone + 1, session.activeTarget)} / ${session.activeTarget} 个工作组`
    : "准备开始今天的训练时段";

  const startRest = (seconds: number) => {
    setNow(Date.now());
    setRestEndsAt(Date.now() + seconds * 1000);
    pulseFeedback("start");
  };

  const adjustRest = (seconds: number) => {
    setNow(Date.now());
    setRestEndsAt((current) => Math.max(Date.now(), current ?? Date.now()) + seconds * 1000);
    pulseFeedback("tap");
  };

  return (
    <section className="midnight-session-deck mb-3" aria-label="午夜训练日程">
      <div className="midnight-deck-stamp">
        <span className="midnight-deck-orbit" aria-hidden="true" />
        <span>MOONLIGHT SESSION</span>
        <span className="tnum ml-auto">{session.total}{session.planned ? ` / ${session.planned}` : ""} SETS</span>
      </div>
      <div className="midnight-deck-grid">
        <div className="min-w-0 midnight-deck-next">
          <p className="midnight-deck-label">NEXT PERIOD</p>
          <p className="truncate text-[15px] font-bold text-white">{taskText}</p>
          <p className="tnum mt-1 text-[10px] text-cyan-100/65">{taskMeta}</p>
        </div>
        <div className="midnight-deck-rest">
          <p className="midnight-deck-label">BREAK TIME</p>
          {restEndsAt ? (
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => adjustRest(-15)} data-pulse-feedback="tap" className="midnight-rest-adjust" aria-label="减少 15 秒">−15</button>
              <button type="button" onClick={() => setRestEndsAt(null)} data-pulse-feedback="confirm" className="midnight-rest-core">
                <span className="tnum text-[20px] font-bold">{timeCode(secondsLeft)}</span>
                <span>RESUME</span>
              </button>
              <button type="button" onClick={() => adjustRest(15)} data-pulse-feedback="tap" className="midnight-rest-adjust" aria-label="增加 15 秒">+15</button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {[60, 90, 120].map((seconds) => (
                <button key={seconds} type="button" onClick={() => startRest(seconds)} data-pulse-feedback="start" className="midnight-rest-preset">
                  {seconds}s
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="midnight-deck-track" aria-label={session.planned ? `今日训练进度 ${Math.round(Math.min(1, session.total / session.planned) * 100)}%` : "今日有效工作组"}>
        <span style={{ width: `${session.planned ? Math.min(100, Math.round((session.total / session.planned) * 100)) : 8}%` }} />
      </div>
    </section>
  );
}
