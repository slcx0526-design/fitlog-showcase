"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { addDaysKey, formatDisplay } from "@/lib/date";
import { estimateRfmBodyFat } from "@/lib/bodyfat";
import type { Profile, WaistEntry } from "@/lib/types";

const W = 320;
const H = 148;
const PAD_X = 14;
const PAD_TOP = 16;
const PAD_BOT = 20;

type Range = "30" | "90" | "all";
type BodyFatPoint = { date: string; value: number };

const RANGE_DAYS: Record<Exclude<Range, "all">, number> = {
  "30": 30,
  "90": 90,
};

function buildBodyFatData(profile: Profile | undefined, entries: WaistEntry[]) {
  if (!profile?.sex || !profile.heightCm) return [];
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => {
      const value = estimateRfmBodyFat(profile.sex, profile.heightCm, entry.waist);
      return value == null ? null : { date: entry.date, value };
    })
    .filter(Boolean) as BodyFatPoint[];
}

export default function BodyFatTrendChart({
  profile,
  waistEntries,
}: {
  profile?: Profile;
  waistEntries: WaistEntry[];
}) {
  const { tr, locale } = useI18n();
  const [range, setRange] = useState<Range>("90");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const allData = useMemo(() => buildBodyFatData(profile, waistEntries), [profile, waistEntries]);
  const latestDate = allData.at(-1)?.date;

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
    if (!selectedDate || !data.some((entry) => entry.date === selectedDate)) {
      setSelectedDate(data.at(-1)?.date ?? null);
    }
  }, [data, selectedDate]);

  const selectedMatchIndex = data.findIndex((entry) => entry.date === selectedDate);
  const selectedIndex = selectedMatchIndex >= 0 ? selectedMatchIndex : Math.max(0, data.length - 1);
  const selected = data[selectedIndex] ?? data.at(-1);
  const globalSelectedIndex = selected
    ? allData.findIndex((entry) => entry.date === selected.date)
    : -1;
  const previous = globalSelectedIndex > 0 ? allData[globalSelectedIndex - 1] : null;
  const selectedDelta = selected && previous ? selected.value - previous.value : null;

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

  if (!profile?.sex || !profile.heightCm) {
    return (
      <div className="grid min-h-[180px] place-items-center rounded-lg border border-dashed border-border bg-surface px-4 text-center text-[13px] text-faint">
        <div>
          <p>{tr("先在设置填写生理性别和身高")}</p>
          <Link href="/settings" className="choice-chip press mt-2 inline-flex border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] font-medium text-accent">
            {tr("前往设置")}
          </Link>
        </div>
      </div>
    );
  }

  if (allData.length === 0) {
    return (
      <div className="grid h-[180px] place-items-center rounded-lg border border-dashed border-border bg-surface text-[13px] text-faint">
        {tr("记录一条腰围后即可估算")}
      </div>
    );
  }

  const values = data.map((entry) => entry.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const lo = min - span * 0.12;
  const hi = max + span * 0.12;
  const valueRange = hi - lo || 1;

  const n = data.length;
  const x = (index: number) =>
    n === 1 ? W / 2 : PAD_X + (index * (W - PAD_X * 2)) / (n - 1);
  const y = (value: number) =>
    PAD_TOP + (1 - (value - lo) / valueRange) * (H - PAD_TOP - PAD_BOT);

  const linePath = data
    .map((entry, index) =>
      `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(entry.value).toFixed(1)}`
    )
    .join(" ");

  const areaPath =
    `M${x(0).toFixed(1)},${(H - PAD_BOT).toFixed(1)} ` +
    data.map((entry, index) => `L${x(index).toFixed(1)},${y(entry.value).toFixed(1)}`).join(" ") +
    ` L${x(n - 1).toFixed(1)},${(H - PAD_BOT).toFixed(1)} Z`;

  const latest = data[n - 1];
  const first = data[0];
  const rangeDelta = latest.value - first.value;
  const selectedX = selected ? x(selectedIndex) : null;
  const selectedY = selected ? y(selected.value) : null;
  const rangeLabel = range === "all" ? tr("全部") : tr("近 {n} 天", { n: RANGE_DAYS[range] });

  return (
    <div className="control-card p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-1.5">
          <span className="tnum text-[24px] font-bold text-fg">{latest.value.toFixed(1)}</span>
          <span className="text-[12px] text-faint">% · RFM</span>
        </div>
        {n > 1 && (
          <span className={"tnum text-[12px] font-medium " + (rangeDelta < 0 ? "text-accent" : rangeDelta > 0 ? "text-warn" : "text-faint")}>
            {rangeDelta > 0 ? "+" : ""}
            {rangeDelta.toFixed(1)}% · {tr("{n} 条", { n })}
          </span>
        )}
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="control-strip flex items-center gap-1 rounded-xl p-0.5" aria-label={tr("图表范围")}>
          {(["30", "90", "all"] as const).map((value) => {
            const active = value === range;
            const label = value === "all" ? tr("全部") : tr("近 {n} 天", { n: RANGE_DAYS[value] });
            return (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                className={"press rounded px-2 py-1 text-[11px] font-medium " + (active ? "bg-surface text-fg shadow-sm" : "text-faint")}
                aria-pressed={active}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span className="text-[10px] text-faint">{tr("仅作估算")}</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="block touch-none select-none"
        preserveAspectRatio="none"
        style={{ height: H }}
        role="img"
        aria-label={tr("体脂估算趋势图：{range}，共 {n} 条记录", { range: rangeLabel, n })}
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
        <line x1={PAD_X} x2={W - PAD_X} y1={y(max)} y2={y(max)} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={PAD_X} x2={W - PAD_X} y1={y(min)} y2={y(min)} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {n > 1 && <path d={areaPath} fill="var(--accent-soft)" opacity="0.6" />}
        {n > 1 && <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {selectedX != null && selectedY != null && (
          <>
            <line x1={selectedX} x2={selectedX} y1={PAD_TOP} y2={H - PAD_BOT} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" vectorEffect="non-scaling-stroke" />
            <circle cx={selectedX} cy={selectedY} r="5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {data.map((entry, index) => (
          <circle
            key={entry.date}
            cx={x(index)}
            cy={y(entry.value)}
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
        <div className="control-strip mt-2 flex items-center gap-2 rounded-xl px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] text-faint">{formatDisplay(selected.date, locale)}</p>
            <p className="text-[10px] text-faint">
              {previous && selectedDelta != null
                ? `${tr("较上一条")} ${selectedDelta > 0 ? "+" : ""}${selectedDelta.toFixed(1)}%`
                : tr("首条记录")}
            </p>
          </div>
          <span className="tnum ml-auto shrink-0 text-[18px] font-bold text-fg">
            {selected.value.toFixed(1)}
            <span className="ml-0.5 text-[11px] font-normal text-faint">%</span>
          </span>
        </div>
      )}
    </div>
  );
}
