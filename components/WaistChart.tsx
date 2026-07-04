"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { addDaysKey, formatDisplay } from "@/lib/date";
import type { WaistEntry } from "@/lib/types";

const W = 320;
const H = 148;
const PAD_X = 14;
const PAD_TOP = 16;
const PAD_BOT = 20;

type Range = "30" | "90" | "all";

const RANGE_DAYS: Record<Exclude<Range, "all">, number> = {
  "30": 30,
  "90": 90,
};

function sortedEntries(entries: WaistEntry[]) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

export default function WaistChart({
  entries,
}: {
  entries: WaistEntry[];
}) {
  const { tr, locale } = useI18n();
  const [range, setRange] = useState<Range>("90");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const allData = useMemo(() => sortedEntries(entries), [entries]);
  const latestDate = allData.at(-1)?.date;

  // 以最近一条记录为锚点，而不是以“今天”为锚点：即使中断记录一段时间，
  // 切到 30 / 90 天时仍会显示最后一段真实数据，不会出现空图。
  const data = useMemo(() => {
    if (!latestDate || range === "all") return allData;
    const cutoff = addDaysKey(latestDate, -(RANGE_DAYS[range] - 1));
    return allData.filter((entry) => entry.date >= cutoff);
  }, [allData, latestDate, range]);

  useEffect(() => {
    if (data.length === 0) {
      setSelectedDate(null);
      return;
    }
    // 切换范围或导入新数据后，保证当前选中点仍然存在；否则回到最新记录。
    if (!selectedDate || !data.some((entry) => entry.date === selectedDate)) {
      setSelectedDate(data.at(-1)?.date ?? null);
    }
  }, [data, selectedDate]);

  const selectedMatchIndex = data.findIndex((entry) => entry.date === selectedDate);
  // 首次渲染尚未写入 selectedDate 时，先稳定地显示最新记录，避免闪到第一条旧数据。
  const selectedIndex = selectedMatchIndex >= 0 ? selectedMatchIndex : Math.max(0, data.length - 1);
  const selected = data[selectedIndex] ?? data.at(-1);
  const globalSelectedIndex = selected
    ? allData.findIndex((entry) => entry.date === selected.date)
    : -1;
  const previous = globalSelectedIndex > 0 ? allData[globalSelectedIndex - 1] : null;
  const selectedDelta = selected && previous ? selected.waist - previous.waist : null;

  const selectNearestPoint = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg || data.length === 0) return;
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width) return;
      const viewX = ((clientX - bounds.left) / bounds.width) * W;
      const n = data.length;
      const pointX = (index: number) =>
        n === 1 ? W / 2 : PAD_X + (index * (W - PAD_X * 2)) / (n - 1);

      let nearest = 0;
      let distance = Number.POSITIVE_INFINITY;
      data.forEach((_, index) => {
        const nextDistance = Math.abs(pointX(index) - viewX);
        if (nextDistance < distance) {
          distance = nextDistance;
          nearest = index;
        }
      });
      setSelectedDate(data[nearest].date);
    },
    [data]
  );

  if (allData.length === 0) {
    return (
      <div className="grid h-[140px] place-items-center rounded-lg border border-dashed border-border bg-surface text-[13px] text-faint">
        {tr("还没有腰围记录")}
      </div>
    );
  }

  const waists = data.map((entry) => entry.waist);
  const min = Math.min(...waists);
  const max = Math.max(...waists);
  const span = max - min || 1;
  // 上下各留余量，避免最高/最低点贴边。
  const lo = min - span * 0.12;
  const hi = max + span * 0.12;
  const waistRange = hi - lo || 1;

  const n = data.length;
  const x = (index: number) =>
    n === 1 ? W / 2 : PAD_X + (index * (W - PAD_X * 2)) / (n - 1);
  const y = (waist: number) =>
    PAD_TOP + (1 - (waist - lo) / waistRange) * (H - PAD_TOP - PAD_BOT);

  const linePath = data
    .map((entry, index) =>
      `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(entry.waist).toFixed(1)}`
    )
    .join(" ");


  const areaPath =
    `M${x(0).toFixed(1)},${(H - PAD_BOT).toFixed(1)} ` +
    data.map((entry, index) => `L${x(index).toFixed(1)},${y(entry.waist).toFixed(1)}`).join(" ") +
    ` L${x(n - 1).toFixed(1)},${(H - PAD_BOT).toFixed(1)} Z`;

  const latest = data[n - 1];
  const first = data[0];
  const rangeDelta = latest.waist - first.waist;
  const selectedX = selected ? x(selectedIndex) : null;
  const selectedY = selected ? y(selected.waist) : null;

  const rangeLabel = range === "all" ? tr("全部") : tr("近 {n} 天", { n: RANGE_DAYS[range] });

  return (
    <div className="control-card p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-1.5">
          <span className="tnum text-[24px] font-bold text-fg">{latest.waist}</span>
          <span className="text-[12px] text-faint">cm</span>
        </div>
        {n > 1 && (
          <div className="flex items-center gap-2">
            <span
              className={
                "tnum text-[12px] font-medium " +
                (rangeDelta < 0 ? "text-accent" : rangeDelta > 0 ? "text-warn" : "text-faint")
              }
            >
              {rangeDelta > 0 ? "+" : ""}
              {rangeDelta.toFixed(1)} cm · {tr("{n} 条", { n })}
            </span>
          </div>
        )}
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <div
          className="control-strip flex items-center gap-1 rounded-xl p-0.5"
          aria-label={tr("图表范围")}
        >
          {(["30", "90", "all"] as const).map((value) => {
            const active = value === range;
            const label = value === "all" ? tr("全部") : tr("近 {n} 天", { n: RANGE_DAYS[value] });
            return (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                className={
                  "press rounded px-2 py-1 text-[11px] font-medium " +
                  (active ? "bg-surface text-fg shadow-sm" : "text-faint")
                }
                aria-pressed={active}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-faint">{tr("点按图表查看")}</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="block touch-none select-none"
        preserveAspectRatio="none"
        style={{ height: H }}
        role="img"
        aria-label={tr("腰围趋势图：{range}，共 {n} 条记录", { range: rangeLabel, n })}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          selectNearestPoint(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            selectNearestPoint(event.clientX);
          }
        }}
      >
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={y(max)}
          y2={y(max)}
          stroke="var(--border)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={y(min)}
          y2={y(min)}
          stroke="var(--border)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {n > 1 && <path d={areaPath} fill="var(--accent-soft)" opacity="0.6" />}
        {n > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {selectedX != null && selectedY != null && (
          <>
            <line
              x1={selectedX}
              x2={selectedX}
              y1={PAD_TOP}
              y2={H - PAD_BOT}
              stroke="var(--accent)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.7"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={selectedX}
              cy={selectedY}
              r="5"
              fill="var(--surface)"
              stroke="var(--accent)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {data.map((entry, index) => (
          <circle
            key={entry.date}
            cx={x(index)}
            cy={y(entry.waist)}
            r={entry.date === selected?.date ? 2.5 : index === n - 1 ? 3.5 : 2}
            fill={index === n - 1 ? "var(--accent)" : "var(--surface)"}
            stroke="var(--accent)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-faint">
        <span className="tnum">{first.date.slice(5)}</span>
        <span className="tnum">{latest.date.slice(5)}</span>
      </div>

      {selected && (
        <div className="mt-2 flex items-center gap-2 control-strip rounded-xl px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] text-faint">{formatDisplay(selected.date, locale)}</p>
            <p className="text-[10px] text-faint">
              {previous && selectedDelta != null
                ? `${tr("较上一条")} ${selectedDelta > 0 ? "+" : ""}${selectedDelta.toFixed(1)} cm`
                : tr("首条记录")}
            </p>
          </div>
          <span className="tnum ml-auto shrink-0 text-[18px] font-bold text-fg">
            {selected.waist}
            <span className="ml-0.5 text-[11px] font-normal text-faint">cm</span>
          </span>
        </div>
      )}
    </div>
  );
}
