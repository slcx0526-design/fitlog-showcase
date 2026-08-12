"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { summarizeSessionExecution } from "@/lib/trainingExecution";
import { isWorkoutSessionClosed } from "@/lib/trainingMetrics";

type DailyItem = {
  id: "body" | "nutrition" | "activity";
  label: string;
  value: string;
  detail: string;
  done: boolean;
  href: string;
};

const tx = (locale: Locale, zh: string, en: string, ja: string) =>
  localeText(locale, zh, en, ja);

export default function DailyOverview() {
  const today = useToday();
  const { data } = useStore();
  const { locale } = useI18n();

  const items = useMemo<DailyItem[]>(() => {
    const day = data.days[today];
    const body = data.bodyWeights.find((entry) => entry.date === today)
      ?? data.waistEntries.find((entry) => entry.date === today);
    const calories = day?.nutrition?.calories ?? 0;
    const completedSets = summarizeSessionExecution(day?.workout).completionCredits;
    const cardioMinutes = (day?.cardio ?? []).reduce((sum, entry) => sum + entry.minutes, 0);
    const workoutClosed = isWorkoutSessionClosed(day?.workout);
    const activityDone = Boolean(workoutClosed || completedSets > 0 || cardioMinutes > 0);

    return [
      {
        id: "body",
        label: tx(locale, "身体", "Body", "身体"),
        value: body
          ? tx(locale, "已记录", "Logged", "記録済み")
          : tx(locale, "待记录", "Open", "未記録"),
        detail: body
          ? tx(locale, "今日测量", "Today", "今日")
          : tx(locale, "晨重或腰围", "Weight or waist", "体重またはウエスト"),
        done: Boolean(body),
        href: "/progress?tab=body",
      },
      {
        id: "nutrition",
        label: tx(locale, "饮食", "Nutrition", "食事"),
        value: calories > 0 ? `${calories} kcal` : tx(locale, "待记录", "Open", "未記録"),
        detail: calories > 0
          ? tx(locale, "今日摄入", "Today", "今日")
          : tx(locale, "记录真实摄入", "Log intake", "摂取を記録"),
        done: calories > 0,
        href: "/nutrition",
      },
      {
        id: "activity",
        label: tx(locale, "行动", "Activity", "行動"),
        value: completedSets > 0
          ? tx(locale, "{n} 组", "{n} sets", "{n} セット").replace("{n}", String(completedSets))
          : cardioMinutes > 0
            ? `${cardioMinutes} ${tx(locale, "分", "min", "分")}`
            : tx(locale, "待开始", "Open", "未開始"),
        detail: workoutClosed
          ? tx(locale, "训练已完成", "Workout complete", "トレーニング完了")
          : activityDone
            ? tx(locale, "今日已推进", "Logged today", "今日記録済み")
            : tx(locale, "训练或有氧", "Training or cardio", "トレーニングまたは有酸素"),
        done: activityDone,
        href: activityDone ? "/progress?tab=training" : "/train",
      },
    ];
  }, [data.bodyWeights, data.days, data.waistEntries, locale, today]);

  const completed = items.filter((item) => item.done).length;

  return (
    <section
      className="daily-overview mb-3"
      data-daily-overview
      aria-label={tx(locale, "今日记录状态", "Today's log status", "今日の記録状況")}
    >
      <div className="daily-overview__header">
        <div>
          <p>{tx(locale, "今日记录", "Today's log", "今日の記録")}</p>
          <span>{tx(locale, "身体、饮食与行动", "Body, nutrition, and activity", "身体・食事・行動")}</span>
        </div>
        <strong className="tnum">{completed}/3</strong>
      </div>
      <div className="daily-overview__items">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="daily-overview__item press"
            data-complete={item.done}
          >
            <span className="daily-overview__mark" aria-hidden="true">
              {item.done ? "✓" : "·"}
            </span>
            <span className="min-w-0">
              <span className="daily-overview__label">{item.label}</span>
              <strong className="daily-overview__value tnum">{item.value}</strong>
              <small>{item.detail}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
