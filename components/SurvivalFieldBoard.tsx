"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { workingSets } from "@/lib/trainingMetrics";
import { localeText, useI18n, type Locale } from "@/lib/i18n";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

type FieldStation = {
  id: "vitals" | "rations" | "route";
  label: string;
  title: string;
  detail: string;
  note: string;
  ready: boolean;
  href: string;
  action: string;
};

function hasWorkingSet(day: ReturnType<typeof useStore>["data"]["days"][string] | undefined) {
  return day?.workout?.exercises.some((exercise) =>
    workingSets(exercise.sets).length > 0
  ) ?? false;
}

function latestWeight(weights: ReturnType<typeof useStore>["data"]["bodyWeights"]) {
  return [...weights].sort((a, b) => b.date.localeCompare(a.date))[0];
}

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${month}.${day}`;
}

/**
 * Survival is a usable field kit rather than a paper texture: it turns existing
 * body, nutrition and training records into three real checkpoints and sends
 * the user directly to the next missing log.
 */
export default function SurvivalFieldBoard() {
  const pathname = usePathname();
  const today = useToday();
  const { mode } = useUIMode();
  const { data } = useStore();
  const { locale } = useI18n();

  const board = useMemo(() => {
    const day = data.days[today];
    const todayWeight = data.bodyWeights.find((entry) => entry.date === today);
    const latest = latestWeight(data.bodyWeights);
    const calories = day?.nutrition?.calories ?? 0;
    const protein = day?.nutrition?.protein ?? 0;
    const trained = !!day?.workout?.done || hasWorkingSet(day);
    const cardio = (day?.cardio ?? []).length > 0;
    const completedSets = day?.workout?.exercises.reduce((sum, exercise) => sum + workingSets(exercise.sets).length, 0) ?? 0;

    const stations: FieldStation[] = [
      {
        id: "vitals",
        label: `01 · ${tx(locale, "体征", "Vitals", "体調")}`,
        title: todayWeight ? `${todayWeight.weight.toFixed(1)} kg` : tx(locale, "晨间检查", "Morning check", "朝の確認"),
        detail: todayWeight
          ? tx(locale, "今日体重已记录", "Today's weight is logged", "今日の体重を記録済み")
          : latest
            ? tx(locale, `上次 ${latest.weight.toFixed(1)} kg · ${shortDate(latest.date)}`, `Last ${latest.weight.toFixed(1)} kg · ${shortDate(latest.date)}`, `前回 ${latest.weight.toFixed(1)} kg · ${shortDate(latest.date)}`)
            : tx(locale, "还没有体重基线", "No weight baseline yet", "体重基準はまだありません"),
        note: todayWeight ? tx(locale, "状态已记录", "Status logged", "状態を記録済み") : tx(locale, "记录晨重以建立趋势", "Log morning weight to build a trend", "朝の体重で傾向を作成"),
        ready: !!todayWeight,
        href: "/data",
        action: todayWeight ? tx(locale, "查看趋势", "View trend", "傾向を見る") : tx(locale, "记录晨重", "Log weight", "朝の体重を記録"),
      },
      {
        id: "rations",
        label: `02 · ${tx(locale, "补给", "Fuel", "補給")}`,
        title: calories > 0 ? `${calories} kcal` : tx(locale, "饮食未记", "Nutrition open", "食事未記録"),
        detail: calories > 0
          ? tx(locale, `蛋白 ${protein || 0} g · 今日已记录`, `Protein ${protein || 0} g · logged today`, `たんぱく質 ${protein || 0} g · 記録済み`)
          : tx(locale, "先记录总热量", "Start with total calories", "まず総カロリーを記録"),
        note: calories > 0 ? tx(locale, "补给已确认", "Fuel confirmed", "補給を確認済み") : tx(locale, "真实摄入决定后续判断", "Actual intake supports later guidance", "実際の摂取が判断を支えます"),
        ready: calories > 0,
        href: "/nutrition",
        action: calories > 0 ? tx(locale, "查看饮食", "Review nutrition", "食事を見る") : tx(locale, "记录饮食", "Log nutrition", "食事を記録"),
      },
      {
        id: "route",
        label: `03 · ${tx(locale, "行动", "Activity", "行動")}`,
        title: trained
          ? tx(locale, `${completedSets} 组已完成`, `${completedSets} sets complete`, `${completedSets} セット完了`)
          : cardio
            ? tx(locale, "有氧已完成", "Cardio complete", "有酸素完了")
            : tx(locale, "行动待开始", "Activity open", "行動未開始"),
        detail: trained
          ? tx(locale, "训练日志已写入今天", "Training is logged for today", "今日のトレーニングを記録済み")
          : cardio
            ? tx(locale, "有氧日志已写入今天", "Cardio is logged for today", "今日の有酸素を記録済み")
            : tx(locale, "今天还没有训练或有氧记录", "No training or cardio logged today", "今日はトレーニングも有酸素も未記録"),
        note: trained || cardio ? tx(locale, "行动已记录", "Activity logged", "行動を記録済み") : tx(locale, "选择下一项行动", "Choose the next activity", "次の行動を選択"),
        ready: trained || cardio,
        href: trained || cardio ? "/progress?tab=training" : "/train",
        action: trained || cardio ? tx(locale, "查看进度", "View progress", "進捗を見る") : tx(locale, "开始行动", "Start", "開始"),
      },
    ];

    const next = stations.find((station) => !station.ready) ?? stations[2];
    return { stations, next, done: stations.filter((station) => station.ready).length };
  }, [data.bodyWeights, data.days, locale, today]);

  if (mode !== "survival" || pathname !== "/") return null;

  return (
    <section className="survival-field-board" aria-label={tx(locale, "Survival 今日记录", "Survival daily log", "Survival 今日の記録")}>
      <div className="survival-field-board__paperclip" aria-hidden="true" />
      <div className="survival-field-board__header">
        <div>
          <p className="survival-field-board__eyebrow">{tx(locale, "今日记录", "Daily log", "今日の記録")} · {shortDate(today)}</p>
          <h2>{tx(locale, "今日状态", "Today", "今日")}</h2>
          <p>{tx(locale, "体征、饮食和行动记录。", "Vitals, nutrition, and activity.", "体調・食事・行動の記録。")}</p>
        </div>
        <span className="survival-field-board__count"><b>{board.done}</b>/3</span>
      </div>

      <div className="survival-field-board__map" aria-hidden="true">
        <span className="survival-field-board__line" />
        {board.stations.map((station, index) => (
          <span key={station.id} className={"survival-field-board__pin " + (station.ready ? "is-ready" : "") + ` is-${index + 1}`}>{index + 1}</span>
        ))}
      </div>

      <div className="survival-field-board__stations">
        {board.stations.map((station) => (
          <Link key={station.id} href={station.href} className={"press survival-field-board__station " + (station.ready ? "is-ready" : "")} data-pulse-feedback={station.ready ? "confirm" : "start"}>
            <p>{station.label}</p>
            <strong>{station.title}</strong>
            <span>{station.detail}</span>
            <small>{station.note}</small>
          </Link>
        ))}
      </div>

      <Link href={board.next.href} className="press survival-field-board__next" data-pulse-feedback="start">
        <span>{tx(locale, "下一项", "Next", "次へ")}</span>
        <b>{board.next.action}</b>
        <i aria-hidden="true">↗</i>
      </Link>
    </section>
  );
}
