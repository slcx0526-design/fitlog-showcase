"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { workingSets } from "@/lib/trainingMetrics";
import { localeText, useI18n, type Locale } from "@/lib/i18n";

type BriefStep = { label: string; detail: string; done: boolean; href: string; cta: string };
const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

function hasWorkingSet(day: ReturnType<typeof useStore>["data"]["days"][string] | undefined) {
  return day?.workout?.exercises.some((exercise) =>
    workingSets(exercise.sets).length > 0
  ) ?? false;
}

function routeFor(steps: BriefStep[], locale: Locale) {
  return steps.find((step) => !step.done) ?? {
    label: tx(locale, "完成", "Done", "完了"),
    detail: tx(locale, "今日记录已完成", "Today's log is complete", "今日の記録は完了しました"),
    done: true,
    href: "/progress?tab=training",
    cta: tx(locale, "查看今日成果", "Review today", "今日を振り返る"),
  };
}

/** A home-only Pulse playbook built from real daily logs. */
export default function PulseDailyBrief() {
  const pathname = usePathname();
  const today = useToday();
  const { mode } = useUIMode();
  const { data } = useStore();
  const { locale } = useI18n();

  const brief = useMemo(() => {
    const day = data.days[today];
    const weightDone = data.bodyWeights.some((entry) => entry.date === today);
    const foodDone = (day?.nutrition?.calories ?? 0) > 0;
    const trainingDone = !!day?.workout?.done || hasWorkingSet(day);
    const cardioDone = (day?.cardio ?? []).length > 0;
    const steps: BriefStep[] = [
      {
        label: tx(locale, "晨间", "Check-in", "チェックイン"),
        detail: weightDone ? tx(locale, "晨重已记录", "Morning weight logged", "朝の体重を記録済み") : tx(locale, "记录今天的晨重", "Log today's morning weight", "今日の朝の体重を記録"),
        done: weightDone,
        href: "/data",
        cta: tx(locale, "记录体重", "Log weight", "体重を記録"),
      },
      {
        label: tx(locale, "补给", "Fuel", "補給"),
        detail: foodDone ? tx(locale, `已记录 ${day?.nutrition?.calories} kcal`, `${day?.nutrition?.calories} kcal logged`, `${day?.nutrition?.calories} kcal 記録済み`) : tx(locale, "记录真实摄入", "Log actual intake", "実際の摂取を記録"),
        done: foodDone,
        href: "/nutrition",
        cta: tx(locale, "记录饮食", "Log nutrition", "食事を記録"),
      },
      {
        label: tx(locale, "行动", "Move", "行動"),
        detail: trainingDone
          ? tx(locale, "训练已推进", "Training logged", "トレーニング記録済み")
          : cardioDone
            ? tx(locale, "有氧已推进", "Cardio logged", "有酸素を記録済み")
            : tx(locale, "完成一次训练或有氧", "Complete training or cardio", "トレーニングか有酸素を実行"),
        done: trainingDone || cardioDone,
        href: trainingDone || cardioDone ? "/progress?tab=training" : "/train",
        cta: trainingDone || cardioDone ? tx(locale, "查看进度", "View progress", "進捗を見る") : tx(locale, "开始行动", "Start", "開始"),
      },
    ];
    const complete = steps.filter((step) => step.done).length;
    const next = routeFor(steps, locale);
    const headline = complete === 3
      ? tx(locale, "今天的记录已经完成。", "Today's log is complete.", "今日の記録は完了しました。")
      : complete === 2
        ? tx(locale, "还差最后一项。", "One item left.", "残り1項目です。")
        : complete === 1
          ? tx(locale, "继续完成下一项。", "Continue with the next item.", "次の項目を続けましょう。")
          : tx(locale, "先完成一项，让记录开始。", "Complete one item to get started.", "まず1項目を記録しましょう。");
    return { steps, complete, next, headline };
  }, [data.bodyWeights, data.days, locale, today]);

  if (mode !== "pulse" || pathname !== "/") return null;

  return (
    <section className="pulse-daily-brief" aria-label={tx(locale, "Pulse 今日安排", "Pulse daily plan", "Pulse 今日の予定")}>
      <div className="pulse-daily-brief__top">
        <div>
          <p className="pulse-daily-brief__kicker">{tx(locale, "今日安排", "Today's plan", "今日の予定")}</p>
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
