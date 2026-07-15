"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { typeLabel } from "@/lib/exercises";
import type { DayLog, TrainingType } from "@/lib/types";
import HistoryRow from "./HistoryRow";

export default function LogReview() {
  const { data, getDay } = useStore();
  const today = useToday();
  const [targetDate, setTargetDate] = useState(today);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TrainingType | "all">("all");
  const [range, setRange] = useState<"30" | "90" | "all">("30");
  const recentDates = useMemo(() => calendarDates(today, range === "all" ? 365 : Number(range)), [today, range]);
  const dates = useMemo(() => {
    const known = new Set([...recentDates, ...Object.keys(data.days)]);
    const needle = query.trim().toLowerCase();
    return [...known].sort().reverse().filter((date) => {
      const day = data.days[date];
      if (range !== "all" && !recentDates.includes(date)) return false;
      if (typeFilter !== "all" && day?.workout?.type !== typeFilter) return false;
      return !needle || dayMatchesQuery(day, needle);
    }).slice(0, range === "all" ? 180 : Number(range));
  }, [data.days, query, range, recentDates, typeFilter]);

  return <div>
    <section className="control-card mb-3 p-3"><p className="text-[13px] font-semibold text-fg">补记或修改某一天</p><div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2"><input type="date" max={today} value={targetDate} onChange={(event) => { const next = event.target.value; setTargetDate(next && next <= today ? next : today); }} className="number-cell tnum h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-[14px] font-semibold text-fg outline-none focus:border-accent" aria-label="选择日期" /><Link href={`/train?date=${targetDate}`} className="choice-chip press flex h-10 items-center justify-center border border-border bg-surface px-3 text-[12px] font-semibold text-muted">训练</Link><Link href={`/nutrition?date=${targetDate}`} className="choice-chip press flex h-10 items-center justify-center border border-border bg-surface px-3 text-[12px] font-semibold text-muted">饮食</Link><Link href={`/cardio?date=${targetDate}`} className="choice-chip press flex h-10 items-center justify-center border border-border bg-surface px-3 text-[12px] font-semibold text-muted">有氧</Link></div></section>
    <section className="control-card mb-3 p-3"><p className="text-[13px] font-semibold text-fg">历史检索</p><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="历史检索" placeholder="搜动作、方式或备注" className="number-cell mt-2 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent" /><div className="mt-2 grid grid-cols-5 gap-1">{(["all", "push", "pull", "legs", "rest"] as const).map((item) => <button key={item} type="button" onClick={() => setTypeFilter(item)} className={"choice-chip press h-9 text-[12px] font-semibold " + (typeFilter === item ? "bg-fg text-bg" : "bg-surface-2 text-muted")}>{item === "all" ? "全部" : typeLabel(item)}</button>)}</div><div className="mt-2 grid grid-cols-3 gap-1">{(["30", "90", "all"] as const).map((item) => <button key={item} type="button" onClick={() => setRange(item)} className={"choice-chip press h-8 text-[11px] font-semibold " + (range === item ? "bg-accent-soft text-accent" : "bg-surface-2 text-faint")}>{item === "all" ? "全部档案" : `近 ${item} 天`}</button>)}</div></section>
    <p className="mb-3 text-[12px] text-muted">点开日期查看训练、饮食和有氧；共显示 {dates.length} 天。</p>
    <section className="control-card overflow-hidden">{dates.length ? dates.map((date) => <HistoryRow key={date} date={date} day={getDay(date)} />) : <Empty text="没有匹配的记录。" href="/progress?tab=log" cta="清空筛选" />}</section>
  </div>;
}

function calendarDates(today: string, count: number) { const [year, month, day] = today.split("-").map(Number); const end = new Date(year, month - 1, day); return Array.from({ length: count }, (_, index) => { const date = new Date(end); date.setDate(end.getDate() - index); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }); }
function dayMatchesQuery(day: DayLog | undefined, query: string) { if (!day) return false; const workout = day.workout?.exercises.map((exercise) => `${exercise.name} ${exercise.sets.map((set) => `${set.weight} ${set.reps} ${set.durationSeconds ?? ""} ${set.distanceMeters ?? ""}`).join(" ")}`).join(" ") ?? ""; const cardio = (day.cardio ?? []).map((entry) => `${entry.mode} ${entry.note ?? ""}`).join(" "); const nutrition = day.nutrition ? `${day.nutrition.calories} ${day.nutrition.protein} ${day.nutrition.carbs} ${day.nutrition.fat}` : ""; return `${workout} ${cardio} ${nutrition}`.toLowerCase().includes(query); }
function Empty({ text, href, cta }: { text: string; href: string; cta: string }) { return <div className="border-dashed px-4 py-7 text-center"><p className="text-[12px] text-faint">{text}</p><Link href={href} className="press mt-3 inline-flex rounded-lg bg-fg px-3 py-2 text-[12px] font-semibold text-bg">{cta}</Link></div>; }
