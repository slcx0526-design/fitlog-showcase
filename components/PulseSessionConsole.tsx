"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { formatSetCredit, summarizeSessionExecution } from "@/lib/trainingExecution";
import { formatRestTime, useRestTimer } from "@/lib/restTimer";

export default function PulseSessionConsole() {
  const pathname = usePathname(); const today = useToday(); const { mode } = useUIMode(); const { data } = useStore();
  const rest = useRestTimer();
  const workout = data.days[today]?.workout;
  const summary = useMemo(() => summarizeSessionExecution(workout), [workout]);
  if (mode !== "pulse" || !pathname.startsWith("/train") || !workout || workout.type === "rest" || workout.done) return null;
  const progress = summary.completionPct ?? 0;
  const nextLine = summary.next && summary.next.plannedSets > 0 ? `已完成 ${formatSetCredit(summary.next.creditedSets)} / ${summary.next.plannedSets} 组 · 继续推进` : summary.rows.length ? "本次计划已完成" : "选择动作开始记录";

  return <section className="pulse-session-console mb-3" aria-label="训练行动面板" data-no-pulse>
    <div className="pulse-console-top"><span className="pulse-live-dot" aria-hidden="true" /><span>行动面板</span><span className="pulse-console-top__slash" aria-hidden="true">//</span><span>进行中</span><span className="tnum ml-auto">{formatSetCredit(summary.completionCredits)}{summary.plannedSets > 0 ? ` / ${summary.plannedSets}` : ""} 组</span></div>
    <div className="pulse-console-body"><div className="pulse-console-ribbon"><span>下一项</span><i aria-hidden="true" /></div><div className="flex items-end justify-between gap-3"><div className="min-w-0"><p className="truncate pulse-console-action">{summary.next ? summary.next.exercise.name : summary.rows.length ? "本次计划已完成" : "添加第一个动作"}</p><p className="tnum mt-1 text-[11px] text-white/65">{nextLine}</p></div><span className="pulse-console-count tnum">{progress}%</span></div><div className="pulse-console-progress" aria-label={`训练进度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div></div>
    <div className="pulse-rest-row">{rest.isRunning ? <><button type="button" onClick={() => rest.adjust(-15)} className="pulse-rest-adjust">-15</button><button type="button" onClick={() => rest.stop()} className="pulse-rest-main"><span className="pulse-console-label">休息</span><span className="tnum text-[20px] font-extrabold">{formatRestTime(rest.secondsLeft)}</span><span className="text-[10px] font-bold tracking-wider">返回训练</span></button><button type="button" onClick={() => rest.adjust(15)} className="pulse-rest-adjust">+15</button></> : <><button type="button" onClick={() => rest.start(60)} className="pulse-rest-adjust">60秒</button><button type="button" onClick={() => rest.start(90)} className="pulse-rest-main"><span className="pulse-console-label">休息</span><span className="text-[14px] font-extrabold">90 秒</span><span className="text-[10px] font-bold tracking-wider">保持节奏</span></button><button type="button" onClick={() => rest.start(120)} className="pulse-rest-adjust">120秒</button></>}</div>
  </section>;
}
