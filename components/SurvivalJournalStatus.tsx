"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { workingSets } from "@/lib/trainingMetrics";

function displayDate(date: string) {
  const [, month, day] = date.split("-");
  return `${month}.${day}`;
}

function hasWorkingSet(day: ReturnType<typeof useStore>["data"]["days"][string] | undefined) {
  return day?.workout?.exercises.some((exercise) =>
    workingSets(exercise.sets).length > 0
  ) ?? false;
}

/** Compact field check-in for non-home Survival pages. */
export default function SurvivalJournalStatus() {
  const pathname = usePathname();
  const today = useToday();
  const { data } = useStore();
  const { mode } = useUIMode();

  const status = useMemo(() => {
    const day = data.days[today];
    const weight = data.bodyWeights.some((entry) => entry.date === today);
    const food = (day?.nutrition?.calories ?? 0) > 0;
    const training = !!day?.workout?.done || hasWorkingSet(day);
    const cardio = (day?.cardio ?? []).length > 0;
    return { weight, food, training, cardio };
  }, [data.bodyWeights, data.days, today]);

  if (mode !== "survival" || pathname === "/" || pathname.startsWith("/settings") || pathname.startsWith("/train")) return null;

  const completed = [status.weight, status.food, status.training || status.cardio].filter(Boolean).length;
  return (
    <section className="survival-journal-status" aria-label="今日野外记录">
      <div className="survival-journal-status__top">
        <div>
          <p className="survival-journal-status__eyebrow">FIELD ENTRY // {displayDate(today)}</p>
          <h2>今日生存记录</h2>
        </div>
        <span className="survival-journal-status__count">{completed}/3</span>
      </div>
      <div className="survival-journal-status__rows">
        <Entry done={status.weight} name="晨重" detail={status.weight ? "已留档" : "等待记录"} />
        <Entry done={status.food} name="补给" detail={status.food ? "热量已记" : "等待记录"} />
        <Entry done={status.training || status.cardio} name="行动" detail={status.training ? "训练已留档" : status.cardio ? "有氧已留档" : "等待行动"} />
      </div>
    </section>
  );
}

function Entry({ done, name, detail }: { done: boolean; name: string; detail: string }) {
  return (
    <div className="survival-journal-status__entry">
      <span className={done ? "survival-journal-status__mark is-done" : "survival-journal-status__mark"}>{done ? "✓" : "·"}</span>
      <span className="survival-journal-status__name">{name}</span>
      <span className="survival-journal-status__detail">{detail}</span>
    </div>
  );
}
