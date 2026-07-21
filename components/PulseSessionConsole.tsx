"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { pulseFeedback } from "@/lib/feedback";
import { plannedWorkingSets, workingSets } from "@/lib/trainingMetrics";

function validWorkingSets(sets: Parameters<typeof workingSets>[0]) { return workingSets(sets).length; }
function mmss(seconds: number) { const safe = Math.max(0, seconds); return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`; }

export default function PulseSessionConsole() {
  const pathname = usePathname(); const today = useToday(); const { mode } = useUIMode(); const { data } = useStore();
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null); const [now, setNow] = useState(() => Date.now());
  const workout = data.days[today]?.workout;
  const summary = useMemo(() => {
    const exercises = workout?.exercises ?? []; const completed = exercises.reduce((sum, exercise) => sum + validWorkingSets(exercise.sets), 0); const planned = exercises.reduce((sum, exercise) => sum + plannedWorkingSets(exercise), 0);
    const next = exercises.find((exercise) => { const goal = plannedWorkingSets(exercise); return goal > 0 && validWorkingSets(exercise.sets) < goal; }) ?? exercises.find((exercise) => validWorkingSets(exercise.sets) === 0) ?? exercises[0];
    return { completed, planned, next, nextGoal: next ? plannedWorkingSets(next) : 0, nextDone: next ? validWorkingSets(next.sets) : 0 };
  }, [workout]);
  useEffect(() => { if (!restEndsAt) return; const tick = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(tick); }, [restEndsAt]);
  const restSeconds = restEndsAt ? Math.max(0, Math.ceil((restEndsAt - now) / 1000)) : 0;
  useEffect(() => { if (restEndsAt && restSeconds === 0) { setRestEndsAt(null); pulseFeedback("finish"); } }, [restEndsAt, restSeconds]);
  if (mode !== "pulse" || !pathname.startsWith("/train") || !workout || workout.type === "rest") return null;
  const progress = summary.planned > 0 ? Math.min(100, Math.round((summary.completed / summary.planned) * 100)) : 0;
  const startRest = (seconds = 90) => { setNow(Date.now()); setRestEndsAt(Date.now() + seconds * 1000); pulseFeedback("start"); };
  const adjustRest = (seconds: number) => { setNow(Date.now()); setRestEndsAt((current) => Math.max(Date.now(), current ?? Date.now()) + seconds * 1000); pulseFeedback("tap"); };
  const nextLine = summary.next && summary.nextGoal > 0 ? `第 ${Math.min(summary.nextDone + 1, summary.nextGoal)} / ${summary.nextGoal} 组 · 继续推进` : "选择动作开始记录";

  return <section className="pulse-session-console mb-3" aria-label="训练行动面板">
    <div className="pulse-console-top"><span className="pulse-live-dot" aria-hidden="true" /><span>行动面板</span><span className="pulse-console-top__slash" aria-hidden="true">//</span><span>进行中</span><span className="tnum ml-auto">{summary.completed}{summary.planned > 0 ? ` / ${summary.planned}` : ""} 组</span></div>
    <div className="pulse-console-body"><div className="pulse-console-ribbon"><span>下一项</span><i aria-hidden="true" /></div><div className="flex items-end justify-between gap-3"><div className="min-w-0"><p className="truncate pulse-console-action">{summary.next ? summary.next.name : "添加第一个动作"}</p><p className="tnum mt-1 text-[11px] text-white/65">{nextLine}</p></div><span className="pulse-console-count tnum">{progress}%</span></div><div className="pulse-console-progress" aria-label={`训练进度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div></div>
    <div className="pulse-rest-row">{restEndsAt ? <><button type="button" onClick={() => adjustRest(15)} data-pulse-feedback="tap" className="pulse-rest-adjust">+15</button><button type="button" onClick={() => setRestEndsAt(null)} data-pulse-feedback="confirm" className="pulse-rest-main"><span className="pulse-console-label">休息</span><span className="tnum text-[20px] font-extrabold">{mmss(restSeconds)}</span><span className="text-[10px] font-bold tracking-wider">返回训练</span></button><button type="button" onClick={() => adjustRest(-15)} data-pulse-feedback="tap" className="pulse-rest-adjust">−15</button></> : <><button type="button" onClick={() => startRest(60)} data-pulse-feedback="start" className="pulse-rest-adjust">60秒</button><button type="button" onClick={() => startRest(90)} data-pulse-feedback="start" className="pulse-rest-main"><span className="pulse-console-label">休息</span><span className="text-[14px] font-extrabold">90 秒</span><span className="text-[10px] font-bold tracking-wider">保持节奏</span></button><button type="button" onClick={() => startRest(120)} data-pulse-feedback="start" className="pulse-rest-adjust">120秒</button></>}</div>
  </section>;
}
