"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { pulseFeedback } from "@/lib/feedback";
import { plannedWorkingSets, workingSets } from "@/lib/trainingMetrics";

function workSets(sets: Parameters<typeof workingSets>[0]) {
  return workingSets(sets).length;
}

function timeLeft(seconds: number) {
  const value = Math.max(0, seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

/** A quieter workout companion with actual next-action and recovery state. */
export default function SurvivalSessionGuide() {
  const pathname = usePathname();
  const today = useToday();
  const { mode } = useUIMode();
  const { data } = useStore();
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const workout = data.days[today]?.workout;
  const current = useMemo(() => {
    const exercises = workout?.exercises ?? [];
    const done = exercises.reduce((count, exercise) => count + workSets(exercise.sets), 0);
    const planned = exercises.reduce((count, exercise) => count + plannedWorkingSets(exercise), 0);
    const next = exercises.find((exercise) => {
      const target = plannedWorkingSets(exercise);
      return target > 0 && workSets(exercise.sets) < target;
    }) ?? exercises.find((exercise) => workSets(exercise.sets) === 0) ?? exercises[0];
    const nextDone = next ? workSets(next.sets) : 0;
    const nextTarget = next ? plannedWorkingSets(next) : 0;
    return { done, planned, next, nextDone, nextTarget };
  }, [workout]);

  useEffect(() => {
    if (!restUntil) return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [restUntil]);

  const restSeconds = restUntil ? Math.max(0, Math.ceil((restUntil - clock) / 1000)) : 0;
  useEffect(() => {
    if (restUntil && restSeconds === 0) {
      setRestUntil(null);
      pulseFeedback("finish");
    }
  }, [restUntil, restSeconds]);

  if (mode !== "survival" || !pathname.startsWith("/train") || !workout || workout.type === "rest") return null;

  const startRest = (seconds: number) => {
    setClock(Date.now());
    setRestUntil(Date.now() + seconds * 1000);
    pulseFeedback("start");
  };

  return (
    <section className="survival-session-guide mb-3" aria-label="训练野外指引">
      <div className="survival-session-guide__top">
        <span>ROUTE CARD</span>
        <span className="tnum">{current.done}{current.planned ? ` / ${current.planned}` : ""} SETS</span>
      </div>
      <div className="survival-session-guide__body">
        <div className="min-w-0">
          <p className="survival-session-guide__eyebrow">NEXT CHECKPOINT</p>
          <p className="truncate survival-session-guide__exercise">{current.next?.name ?? "添加第一个动作"}</p>
          <p className="tnum survival-session-guide__meta">
            {current.next && current.nextTarget > 0
              ? `工作组 ${Math.min(current.nextDone + 1, current.nextTarget)} / ${current.nextTarget}`
              : "准备开始今天的行动"}
          </p>
        </div>
        <div className="survival-session-guide__rest">
          {restUntil ? (
            <button type="button" onClick={() => setRestUntil(null)} data-pulse-feedback="confirm" className="survival-session-guide__rest-main">
              <span className="tnum">{timeLeft(restSeconds)}</span>
              <small>继续行动</small>
            </button>
          ) : (
            <div className="survival-session-guide__rest-options">
              {[60, 90, 120].map((seconds) => (
                <button key={seconds} type="button" onClick={() => startRest(seconds)} data-pulse-feedback="start">{seconds}s</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="survival-session-guide__track"><span style={{ width: `${current.planned ? Math.min(100, Math.round((current.done / current.planned) * 100)) : 6}%` }} /></div>
    </section>
  );
}
