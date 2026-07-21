"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { typeLabel } from "@/lib/exercises";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { dayHasLogContent, daySearchText } from "@/lib/trainingHistory";
import type { TrainingType } from "@/lib/types";
import HistoryRow from "./HistoryRow";

type Range = "30" | "90" | "all";
const PAGE_SIZE = 60;
const FILTER_TYPES: Array<TrainingType | "all"> = ["all", "push", "pull", "legs", "custom", "rest"];
const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

export default function LogReview() {
  const { data, getDay } = useStore();
  const { locale, tr } = useI18n();
  const today = useToday();
  const [targetDate, setTargetDate] = useState(today);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TrainingType | "all">("all");
  const [range, setRange] = useState<Range>("30");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const recentDateSet = useMemo(() => new Set(calendarDates(today, Number(range === "all" ? 1 : range))), [range, today]);
  const matchingDates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return Object.keys(data.days)
      .filter((date) => date <= today)
      .sort()
      .reverse()
      .filter((date) => {
        const day = data.days[date];
        if (!dayHasLogContent(day)) return false;
        if (range !== "all" && !recentDateSet.has(date)) return false;
        if (typeFilter !== "all" && day.workout?.type !== typeFilter) return false;
        if (!needle) return true;
        const typeText = day.workout ? `${typeLabel(day.workout.type)} ${tr(typeLabel(day.workout.type))}` : "";
        return `${daySearchText(day)} ${typeText}`.toLowerCase().includes(needle);
      });
  }, [data.days, query, range, recentDateSet, today, tr, typeFilter]);
  const dates = matchingDates.slice(0, visibleLimit);
  const filtered = Boolean(query.trim() || typeFilter !== "all" || range !== "30");

  useEffect(() => setVisibleLimit(PAGE_SIZE), [query, range, typeFilter]);

  function resetFilters() {
    setQuery("");
    setTypeFilter("all");
    setRange("30");
  }

  return <div>
    <section className="control-card mb-3 p-3">
      <p className="text-[13px] font-semibold text-fg">{tx(locale, "补记或修改某一天", "Backfill or edit a day", "日付を選んで追記・編集")}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <input
          type="date"
          max={today}
          value={targetDate}
          onChange={(event) => { const next = event.target.value; setTargetDate(next && next <= today ? next : today); }}
          className="number-cell tnum col-span-3 h-10 min-w-0 rounded-xl border border-border bg-surface-2 px-3 text-[14px] font-semibold text-fg outline-none focus:border-accent"
          aria-label={tx(locale, "选择日期", "Choose date", "日付を選択")}
        />
        <LogLink href={`/train?date=${targetDate}`} label={tx(locale, "训练", "Training", "トレーニング")} />
        <LogLink href={`/nutrition?date=${targetDate}`} label={tx(locale, "饮食", "Nutrition", "食事")} />
        <LogLink href={`/cardio?date=${targetDate}`} label={tx(locale, "有氧", "Cardio", "有酸素")} />
      </div>
    </section>

    <section className="control-card mb-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-fg">{tx(locale, "历史检索", "History search", "履歴検索")}</p>
        {filtered && <button type="button" onClick={resetFilters} className="press rounded-lg bg-surface-2 px-2 py-1 text-[10px] font-semibold text-accent">{tx(locale, "重置", "Reset", "リセット")}</button>}
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={tx(locale, "历史检索", "Search history", "履歴を検索")}
        placeholder={tx(locale, "搜动作、轨道、方式或备注", "Search exercise, track, mode, or note", "種目・トラック・方法・メモを検索")}
        className="number-cell mt-2 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent"
      />
      <div className="mt-2 grid grid-cols-3 gap-1">
        {FILTER_TYPES.map((item) => <button
          key={item}
          type="button"
          onClick={() => setTypeFilter(item)}
          aria-pressed={typeFilter === item}
          className={"choice-chip press h-9 min-w-0 truncate px-1 text-[12px] font-semibold " + (typeFilter === item ? "bg-fg text-bg" : "bg-surface-2 text-muted")}
        >{item === "all" ? tx(locale, "全部", "All", "すべて") : tr(typeLabel(item))}</button>)}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {(["30", "90", "all"] as const).map((item) => <button
          key={item}
          type="button"
          onClick={() => setRange(item)}
          aria-pressed={range === item}
          className={"choice-chip press h-8 text-[11px] font-semibold " + (range === item ? "bg-accent-soft text-accent" : "bg-surface-2 text-faint")}
        >{item === "all" ? tx(locale, "全部档案", "All history", "全履歴") : tx(locale, `近 ${item} 天`, `${item} days`, `${item}日`)}</button>)}
      </div>
    </section>

    <div className="mb-3 flex items-center justify-between gap-3 text-[11px] text-muted">
      <p>{tx(locale, `找到 ${matchingDates.length} 个有记录日期`, `${matchingDates.length} logged days`, `記録日 ${matchingDates.length} 件`)}</p>
      {matchingDates.length > dates.length && <span className="tnum text-faint">{dates.length}/{matchingDates.length}</span>}
    </div>

    {dates.length ? <>
      <section className="control-card overflow-hidden">{dates.map((date) => <HistoryRow key={date} date={date} day={getDay(date)} />)}</section>
      {matchingDates.length > dates.length && <button type="button" onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)} className="press mt-3 h-10 w-full rounded-xl border border-border bg-surface text-[12px] font-semibold text-accent">{tx(locale, "显示更多", "Show more", "さらに表示")}</button>}
    </> : <EmptyState filtered={filtered} locale={locale} onReset={resetFilters} />}
  </div>;
}

function calendarDates(today: string, count: number) {
  const [year, month, day] = today.split("-").map(Number);
  const end = new Date(year, month - 1, day);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - index);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
}

function LogLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="choice-chip press flex h-10 min-w-0 items-center justify-center border border-border bg-surface px-2 text-[12px] font-semibold text-muted"><span className="truncate">{label}</span></Link>;
}

function EmptyState({ filtered, locale, onReset }: { filtered: boolean; locale: Locale; onReset: () => void }) {
  return <div className="control-card border-dashed px-4 py-7 text-center">
    <p className="text-[12px] text-faint">{filtered ? tx(locale, "没有匹配的记录。", "No matching records.", "一致する記録がありません。") : tx(locale, "还没有训练、饮食或有氧记录。", "No training, nutrition, or cardio records yet.", "トレーニング・食事・有酸素の記録はまだありません。")}</p>
    {filtered ? <button type="button" onClick={onReset} className="press mt-3 rounded-lg bg-fg px-3 py-2 text-[12px] font-semibold text-bg">{tx(locale, "清空筛选", "Clear filters", "絞り込みを解除")}</button> : <Link href="/train" className="press mt-3 inline-flex rounded-lg bg-fg px-3 py-2 text-[12px] font-semibold text-bg">{tx(locale, "开始训练", "Start training", "トレーニング開始")}</Link>}
  </div>;
}
