"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { workingSets } from "@/lib/trainingMetrics";

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
        label: "01 / VITALS",
        title: todayWeight ? `${todayWeight.weight.toFixed(1)} kg` : "晨间检查",
        detail: todayWeight ? "今日体重已记录" : latest ? `上次记录 ${latest.weight.toFixed(1)} kg · ${shortDate(latest.date)}` : "还没有体重基线",
        note: todayWeight ? "状态已留档" : "记录晨重，才有身体趋势",
        ready: !!todayWeight,
        href: "/data",
        action: todayWeight ? "查看趋势" : "记录晨重",
      },
      {
        id: "rations",
        label: "02 / RATIONS",
        title: calories > 0 ? `${calories} kcal` : "补给未记",
        detail: calories > 0 ? `蛋白 ${protein || 0} g · 今天的摄入已归档` : "先记总热量，再补宏量",
        note: calories > 0 ? "补给已确认" : "真实补给决定后续判断",
        ready: calories > 0,
        href: "/nutrition",
        action: calories > 0 ? "检查补给" : "记录补给",
      },
      {
        id: "route",
        label: "03 / ROUTE",
        title: trained ? `${completedSets} 组已推进` : cardio ? "有氧路线已完成" : "行动待开始",
        detail: trained ? "训练日志已写入今天" : cardio ? "有氧日志已写入今天" : "今天还没有训练或有氧记录",
        note: trained || cardio ? "路线已推进" : "选择下一段行动",
        ready: trained || cardio,
        href: trained || cardio ? "/progress?tab=training" : "/train",
        action: trained || cardio ? "查看路线" : "开始行动",
      },
    ];

    const next = stations.find((station) => !station.ready) ?? stations[2];
    return { stations, next, done: stations.filter((station) => station.ready).length };
  }, [data.bodyWeights, data.days, today]);

  if (mode !== "survival" || pathname !== "/") return null;

  return (
    <section className="survival-field-board" aria-label="今日野外行动板">
      <div className="survival-field-board__paperclip" aria-hidden="true" />
      <div className="survival-field-board__header">
        <div>
          <p className="survival-field-board__eyebrow">FIELD KIT // DAY {shortDate(today)}</p>
          <h2>今日路线</h2>
          <p>体征、补给、行动。每一项都来自你的真实记录。</p>
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
        <span>下一检查点</span>
        <b>{board.next.action}</b>
        <i aria-hidden="true">↗</i>
      </Link>
    </section>
  );
}
