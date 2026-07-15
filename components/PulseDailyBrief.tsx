"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { workingSets } from "@/lib/prescription";

type BriefStep = { label: string; detail: string; done: boolean; href: string; cta: string };

function hasWorkingSet(day: ReturnType<typeof useStore>["data"]["days"][string] | undefined) {
  return day?.workout?.exercises.some((exercise) =>
    workingSets(exercise.sets).length > 0
  ) ?? false;
}

function routeFor(steps: BriefStep[]) {
  return steps.find((step) => !step.done) ?? { label: "DONE", detail: "今日记录已完成", done: true, href: "/progress?tab=training", cta: "查看今日成果" };
}

/** A home-only Pulse playbook built from real daily logs. */
export default function PulseDailyBrief() {
  const pathname = usePathname();
  const today = useToday();
  const { mode } = useUIMode();
  const { data } = useStore();

  const brief = useMemo(() => {
    const day = data.days[today];
    const weightDone = data.bodyWeights.some((entry) => entry.date === today);
    const foodDone = (day?.nutrition?.calories ?? 0) > 0;
    const trainingDone = !!day?.workout?.done || hasWorkingSet(day);
    const cardioDone = (day?.cardio ?? []).length > 0;
    const steps: BriefStep[] = [
      { label: "CHECK-IN", detail: weightDone ? "晨重已归档" : "记录今天的晨重", done: weightDone, href: "/data", cta: "记录体重" },
      { label: "FUEL", detail: foodDone ? `已记录 ${day?.nutrition?.calories} kcal` : "记录真实补给", done: foodDone, href: "/nutrition", cta: "记录饮食" },
      { label: "MOVE", detail: trainingDone ? "训练已推进" : cardioDone ? "有氧已推进" : "完成一次训练或有氧", done: trainingDone || cardioDone, href: trainingDone || cardioDone ? "/progress?tab=training" : "/train", cta: trainingDone || cardioDone ? "查看进度" : "开始行动" },
    ];
    const complete = steps.filter((step) => step.done).length;
    const next = routeFor(steps);
    const headline = complete === 3
      ? "今天的剧本已经完成。"
      : complete === 2
        ? "最后一项，收好今天的成果。"
        : complete === 1
          ? "节奏已经启动，继续推进下一步。"
          : "先完成一项，让今天正式开始。";
    return { steps, complete, next, headline };
  }, [data.bodyWeights, data.days, today]);

  if (mode !== "pulse" || pathname !== "/") return null;

  return (
    <section className="pulse-daily-brief" aria-label="Pulse 今日行动简报">
      <div className="pulse-daily-brief__top">
        <div>
          <p className="pulse-daily-brief__kicker">TODAY&apos;S PLAYBOOK</p>
          <h2>{brief.headline}</h2>
        </div>
        <span className="pulse-daily-brief__score tnum">{brief.complete}<small>/3</small></span>
      </div>
      <div className="pulse-daily-brief__steps">
        {brief.steps.map((step, index) => (
          <div key={step.label} className={"pulse-daily-brief__step " + (step.done ? "is-done" : "") }>
            <span className="pulse-daily-brief__index">0{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p>{step.label}</p>
              <span className="truncate">{step.detail}</span>
            </div>
            <span className="pulse-daily-brief__mark">{step.done ? "✓" : "!"}</span>
          </div>
        ))}
      </div>
      <Link href={brief.next.href} className="press pulse-daily-brief__cta" data-pulse-feedback="start">
        <span>{brief.next.cta}</span>
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
