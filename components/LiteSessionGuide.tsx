"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { useI18n, type Locale } from "@/lib/i18n";
import { formatSetCredit, summarizeSessionExecution } from "@/lib/trainingExecution";
import { formatRestTime, useRestTimer } from "@/lib/restTimer";

const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;

export default function LiteSessionGuide() {
  const pathname = usePathname();
  const today = useToday();
  const { mode } = useUIMode();
  const { locale, tr } = useI18n();
  const { data } = useStore();
  const rest = useRestTimer();
  const workout = data.days[today]?.workout;
  const session = useMemo(() => summarizeSessionExecution(workout), [workout]);

  if (mode !== "lite" || !pathname.startsWith("/train") || !workout || workout.type === "rest" || workout.done) return null;

  const next = session.next;
  const progressText = session.plannedSets > 0
    ? `${formatSetCredit(session.completionCredits)} / ${session.plannedSets}`
    : formatSetCredit(session.completionCredits);

  return <section className="control-card mb-3 overflow-hidden" aria-label={tx(locale, "训练进度与休息计时", "Workout progress and rest timer", "トレーニング進捗と休憩タイマー")}>
    <div className="px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{tx(locale, "下一项", "Next", "次の種目")}</p>
        <span className="tnum shrink-0 text-[11px] font-semibold text-muted">{progressText} {tx(locale, "组", "sets", "セット")}</span>
      </div>
      <p className="mt-1 truncate text-[15px] font-semibold text-fg">{next ? tr(next.exercise.name) : session.rows.length ? tx(locale, "本次计划已完成", "Session plan complete", "今回の予定は完了しました") : tx(locale, "添加第一个动作", "Add the first exercise", "最初の種目を追加")}</p>
      <p className="tnum mt-0.5 text-[10px] text-faint">{next && next.plannedSets > 0
        ? tx(locale, `已完成 ${formatSetCredit(next.creditedSets)} / ${next.plannedSets} 组`, `${formatSetCredit(next.creditedSets)} / ${next.plannedSets} sets complete`, `${formatSetCredit(next.creditedSets)} / ${next.plannedSets} セット完了`)
        : session.rows.length ? tx(locale, "按实际表现继续记录", "Continue logging actual performance", "実際の内容を続けて記録") : tx(locale, "选择动作后开始记录", "Choose an exercise to start logging", "種目を選んで記録を開始")}</p>
      {session.completionPct != null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-label={tx(locale, `训练进度 ${session.completionPct}%`, `Workout progress ${session.completionPct}%`, `トレーニング進捗 ${session.completionPct}%`)}><span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${session.completionPct}%` }} /></div>}
    </div>
    <div className="control-strip grid grid-cols-3 gap-1 border-x-0 border-b-0 p-1">
      {rest.isRunning ? <>
        <button type="button" onClick={() => rest.adjust(-15)} className="choice-chip press h-10 text-[12px] font-semibold text-muted" aria-label={tx(locale, "休息减少 15 秒", "Reduce rest by 15 seconds", "休憩を15秒短縮")}>-15</button>
        <button type="button" onClick={() => rest.stop()} className="choice-chip press h-10 bg-fg text-[12px] font-semibold text-bg" aria-label={tx(locale, "结束休息", "End rest", "休憩を終了")}><span className="tnum">{formatRestTime(rest.secondsLeft)}</span></button>
        <button type="button" onClick={() => rest.adjust(15)} className="choice-chip press h-10 text-[12px] font-semibold text-muted" aria-label={tx(locale, "休息增加 15 秒", "Add 15 seconds to rest", "休憩を15秒延長")}>+15</button>
      </> : [60, 90, 120].map((seconds) => <button key={seconds} type="button" onClick={() => rest.start(seconds)} className="choice-chip press h-10 text-[12px] font-semibold text-muted">{seconds}{tx(locale, "秒", "s", "秒")}</button>)}
    </div>
  </section>;
}
