"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { useUIMode } from "@/lib/uiMode";
import { maxHR, zoneForBpm, zoneMeta } from "@/lib/hr";
import { cardioWeekSummary, weeklyCardioGoal } from "@/lib/cardio";
import { formatCompact } from "@/lib/date";
import { isCutModeActive } from "@/lib/cutMode";
import { pulseFeedback } from "@/lib/feedback";
import type { Zone } from "@/lib/types";
import NumberField from "./NumberField";
import ZoneReferenceCard from "./ZoneReferenceCard";

const MODES = ["走路", "跑步", "单车", "椭圆机", "划船", "爬楼梯", "跳绳"];
const QUICK_MINUTES = [20, 30, 40, 60];
const WEEKLY_PRESETS = [90, 120, 150, 180];

const INTENSITY: Array<{ zone: Zone; title: string; hint: string }> = [
  { zone: 1, title: "恢复", hint: "轻松" },
  { zone: 2, title: "匀速", hint: "可完整说话" },
  { zone: 3, title: "节奏", hint: "说话断续" },
  { zone: 4, title: "间歇", hint: "只能短句" },
  { zone: 5, title: "冲刺", hint: "接近最大" },
];

export default function CardioModule({
  date,
}: {
  date: string;
  /** Kept for backwards compatibility with older route calls. */
  returnHref?: string;
}) {
  const { getDay, addCardio, removeCardio, data, setCutPlan } = useStore();
  const { mode: uiMode } = useUIMode();
  const { tr } = useI18n();
  const toast = useToast();
  const entries = getDay(date)?.cardio ?? [];
  const canDeriveZone = !!maxHR(data.profile);
  const cutActive = isCutModeActive(data.cutPlan);
  const weekly = useMemo(
    () => cardioWeekSummary(data.days, data.cutPlan, date),
    [data.days, data.cutPlan, date],
  );

  const [activityMode, setActivityMode] = useState<string>("走路");
  const [customOpen, setCustomOpen] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const [avgHR, setAvgHR] = useState(0);
  const [zone, setZone] = useState<Zone | null>(null);
  const [note, setNote] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  function onAvgHR(value: number) {
    setAvgHR(value);
    if (value > 0 && canDeriveZone) {
      const derived = zoneForBpm(value, data.profile);
      if (derived) setZone(derived);
    }
  }

  function chooseMinutes(value: number) {
    setMinutes(value);
    pulseFeedback("tap");
  }

  function chooseZone(value: Zone) {
    setZone(value);
    pulseFeedback("tap");
  }

  function save() {
    if (!minutes || minutes <= 0) return;
    addCardio(date, {
      mode: (activityMode || "有氧").trim() || "有氧",
      minutes,
      zone,
      avgHR: avgHR > 0 ? avgHR : undefined,
      note: note.trim() || undefined,
    });
    setMinutes(0);
    setAvgHR(0);
    setZone(null);
    setNote("");
    setNoteOpen(false);
    pulseFeedback("confirm");
    toast.show(uiMode === "pulse" ? "CARDIO LOGGED" : "有氧已记录");
  }

  const todayMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const chosenLabel = zone ? `Z${zone} · ${zoneMeta(zone).zh}` : "未选强度";
  const goal = weeklyCardioGoal(data.cutPlan);
  const ctaLabel = minutes > 0
    ? `记录 ${minutes} 分钟${zone ? ` · Z${zone}` : ""}`
    : "选择时长后记录";

  return (
    <section className="mt-5 space-y-4">
      <WeeklyCardioPanel
        weekly={weekly}
        goalOpen={goalOpen}
        onGoalOpen={() => setGoalOpen((value) => !value)}
        onGoalChange={(value) => {
          if (value >= 30 && value <= 420) setCutPlan({ weeklyCardioMinutes: Math.round(value) });
        }}
        selectedGoal={goal}
      />

      {cutActive && (
        <div className="cardio-context border border-accent/25 bg-accent-soft px-3 py-2.5 text-[11px] leading-relaxed text-muted">
          减脂模式会把有氧作为周执行与恢复信息；不会把单次运动换成今天可多吃的热量。
        </div>
      )}

      {entries.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold text-fg">今天已记录</h2>
            <span className="tnum text-[12px] text-faint">{todayMinutes} 分钟</span>
          </div>
          <div className="control-card overflow-hidden">
            {entries.map((entry) => (
              <div key={entry.id} className="soft-divider flex items-center gap-3 border-t px-3.5 py-3 first:border-t-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-[11px] font-bold text-accent">
                  {entry.zone ? `Z${entry.zone}` : "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-semibold text-fg">{tr(entry.mode)}</span>
                    <span className="tnum text-[12px] text-muted">{entry.minutes} 分钟</span>
                  </div>
                  {(entry.avgHR || entry.note) && (
                    <p className="mt-0.5 truncate text-[11px] text-faint">
                      {entry.avgHR ? `平均 ${entry.avgHR} bpm` : ""}
                      {entry.avgHR && entry.note ? " · " : ""}
                      {entry.note ?? ""}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    removeCardio(date, entry.id);
                    pulseFeedback("tap");
                  }}
                  aria-label="删除这条有氧"
                  className="press grid h-9 w-9 place-items-center rounded-lg text-faint hover:bg-surface-2 hover:text-accent"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M7 7L17 17M7 17L17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="cardio-log-card control-card p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-fg">记录一段有氧</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-faint">先选方式、时长和主观强度；心率只用来辅助判断区间。</p>
          </div>
          <span className="cardio-zone-readout tnum rounded-full bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted">{chosenLabel}</span>
        </div>

        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold text-faint">方式</p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {MODES.map((item) => {
              const active = !customOpen && activityMode === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setActivityMode(item);
                    setCustomOpen(false);
                    pulseFeedback("tap");
                  }}
                  aria-pressed={active}
                  className={"choice-chip press shrink-0 border px-3 py-2 text-[13px] font-semibold " + (active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}
                >
                  {tr(item)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setCustomOpen(true);
                setActivityMode("");
                pulseFeedback("tap");
              }}
              aria-pressed={customOpen}
              className={"choice-chip press shrink-0 border px-3 py-2 text-[13px] font-semibold " + (customOpen ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}
            >
              其他
            </button>
          </div>
          {customOpen && (
            <input
              value={activityMode}
              aria-label="自定义有氧方式"
              onChange={(event) => setActivityMode(event.target.value)}
              placeholder="例如：游泳、爬山"
              className="number-cell mt-2 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[14px] text-fg outline-none focus:border-accent"
            />
          )}
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold text-faint">时长</p>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_MINUTES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => chooseMinutes(preset)}
                aria-pressed={minutes === preset}
                className={"choice-chip press h-11 border text-[13px] font-semibold " + (minutes === preset ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface-2 text-fg")}
              >
                {preset}<span className="ml-0.5 text-[10px] font-medium">分</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-medium text-faint">自定义</span>
            <NumberField
              value={minutes}
              onChange={setMinutes}
              ariaLabel="有氧时长"
              placeholder="分钟"
              allowDecimal={false}
              className="number-cell tnum h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-[16px] font-semibold text-fg outline-none focus:border-accent"
            />
            <span className="text-[11px] text-faint">分钟</span>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="text-[11px] font-semibold text-faint">强度</p>
            <button type="button" onClick={() => setDetailsOpen((value) => !value)} className="press text-[11px] font-medium text-accent">
              {detailsOpen ? "收起五区参考" : "查看五区参考"}
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {INTENSITY.map((item) => {
              const active = zone === item.zone;
              return (
                <button
                  key={item.zone}
                  type="button"
                  onClick={() => chooseZone(item.zone)}
                  aria-pressed={active}
                  className={"choice-chip press min-h-[52px] border px-1 text-center " + (active ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}
                >
                  <span className="tnum block text-[12px] font-bold">Z{item.zone}</span>
                  <span className="mt-0.5 block text-[10px] font-semibold">{item.title}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-faint">{zone ? zoneMeta(zone).talk : "不确定可先不选；匀速有氧通常优先 Z2。"}</p>
          {detailsOpen && <div className="animate-slidedown mt-2"><ZoneReferenceCard selected={zone} onPick={chooseZone} /></div>}
        </div>

        <div className="soft-divider mt-4 border-t pt-3">
          <button type="button" onClick={() => setNoteOpen((value) => !value)} className="press flex w-full items-center justify-between text-left text-[12px] font-medium text-muted">
            <span>平均心率与备注（可选）</span><span>{noteOpen ? "−" : "+"}</span>
          </button>
          {noteOpen && (
            <div className="animate-slidedown mt-2 space-y-2">
              <label>
                <span className="mb-1 block text-[11px] font-medium text-faint">平均心率 bpm</span>
                <NumberField value={avgHR} onChange={onAvgHR} ariaLabel="平均心率" placeholder="可不填" allowDecimal={false} className="number-cell tnum h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[15px] font-semibold text-fg outline-none focus:border-accent" />
              </label>
              {!canDeriveZone && avgHR > 0 && <p className="text-[10px] text-faint">填写出生年份或实测最大心率后，平均心率可自动判定区间。</p>}
              <input aria-label="有氧备注" value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注，例如：坡度 6%" className="number-cell h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px] text-fg outline-none focus:border-accent" />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={save}
          disabled={!minutes || minutes <= 0}
          className={"press mt-4 flex h-12 w-full items-center justify-center rounded-xl text-[14px] font-semibold " + (minutes > 0 ? "bg-fg text-bg" : "cursor-default bg-surface-2 text-faint")}
        >
          {ctaLabel}
        </button>
      </section>
    </section>
  );
}

function WeeklyCardioPanel({
  weekly,
  goalOpen,
  onGoalOpen,
  onGoalChange,
  selectedGoal,
}: {
  weekly: ReturnType<typeof cardioWeekSummary>;
  goalOpen: boolean;
  onGoalOpen: () => void;
  onGoalChange: (value: number) => void;
  selectedGoal: number;
}) {
  const zoneTwo = weekly.zoneMinutes[2];
  const width = `${Math.round(weekly.progress * 100)}%`;
  return (
    <section className="cardio-week-card control-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">WEEKLY CARDIO</p>
          <p className="tnum mt-1 text-[26px] font-bold text-fg">{weekly.totalMinutes}<span className="ml-1 text-[12px] font-medium text-faint">/ {weekly.targetMinutes} 分钟</span></p>
        </div>
        <button type="button" onClick={onGoalOpen} className="press rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-accent">目标</button>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width }} /></div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted"><span>{weekly.activeDays} 天活动 · {weekly.sessions} 次记录</span><span className="tnum">Z2 {zoneTwo || "—"} 分钟</span></div>
      <div className="mt-3 grid grid-cols-7 gap-1.5" aria-label="本周每日有氧分钟">
        {weekly.dates.map((date) => {
          const item = formatCompact(date);
          const minutes = weekly.dayMinutes[date] ?? 0;
          const active = minutes > 0;
          return <div key={date} className="text-center"><div className={"mx-auto flex h-7 w-full items-end justify-center rounded-md px-1 " + (active ? "bg-accent-soft" : "bg-surface-2")}><span className={"block w-full rounded-sm " + (active ? "bg-accent" : "bg-border") } style={{ height: active ? `${Math.max(20, Math.min(100, Math.round((minutes / Math.max(weekly.targetMinutes / 4, 1)) * 100)))}%` : "4px" }} /></div><p className="mt-1 text-[9px] font-medium text-faint">{item.wd.replace("周", "")}</p></div>;
        })}
      </div>
      {goalOpen && (
        <div className="soft-divider animate-slidedown mt-3 border-t pt-3">
          <p className="mb-2 text-[11px] font-medium text-faint">每周目标分钟；只影响执行进度，不调整热量预算。</p>
          <div className="grid grid-cols-4 gap-2">
            {WEEKLY_PRESETS.map((value) => <button key={value} type="button" onClick={() => onGoalChange(value)} aria-pressed={selectedGoal === value} className={"choice-chip press h-9 border text-[12px] font-semibold " + (selectedGoal === value ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}>{value}</button>)}
          </div>
        </div>
      )}
    </section>
  );
}
