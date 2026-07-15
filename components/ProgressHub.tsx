"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { currentWeekKeys, formatCompact, relativeLabel } from "@/lib/date";
import { computeVolumeSummary, volumeAdviceForRow, volumeScopeDays, volumeScopeLabel, volumeTargetScale, type VolumeScope } from "@/lib/volume";
import { MUSCLE_LABELS, type MuscleGroup } from "@/lib/muscles";
import { typeLabel } from "@/lib/exercises";
import NumberField from "./NumberField";
import WeightChart from "./WeightChart";
import WaistChart from "./WaistChart";
import WeeklyAverageCard from "./WeeklyAverageCard";
import BodyFatEstimateCard from "./BodyFatEstimateCard";
import BodyFatTrendChart from "./BodyFatTrendChart";
import HistoryRow from "./HistoryRow";
import { haptic } from "@/lib/feedback";
import { useToast } from "@/lib/toast";
import type { DayLog, SetRecord, TrainingType } from "@/lib/types";

type Tab = "body" | "training" | "log";
type BodyTrendMetric = "weight" | "waist" | "bodyFat";
const TABS: { id: Tab; label: string; detail: string }[] = [
  { id: "body", label: "身体", detail: "体重 · 腰围 · 体脂趋势" },
  { id: "training", label: "训练", detail: "容量 · 最近训练 · 有氧" },
  { id: "log", label: "日志", detail: "按日期回看与补记" },
];

export default function ProgressHub({ initialTab = "body" }: { initialTab?: Tab }) {
  const router = useRouter();
  const { loaded } = useStore();
  const [tab, setTab] = useState<Tab>(initialTab);
  const selected = TABS.find((item) => item.id === tab)!;
  function change(next: Tab) {
    setTab(next);
    router.replace(`/progress?tab=${next}`, { scroll: false });
    haptic(8);
  }
  if (!loaded) return <div className="space-y-3"><div className="h-16 rounded-2xl bg-surface-2" /><div className="h-56 rounded-2xl bg-surface-2" /></div>;
  return <div>
    <header className="control-card mb-4 flex items-end justify-between gap-4 p-3.5">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">REVIEW</p><h1 className="mt-1 text-[25px] font-bold tracking-tight text-fg">进度</h1><p className="mt-1 text-[12px] text-muted">{selected.detail}</p></div>
      <Link href="/settings" className="press rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-muted">备份与设置</Link>
    </header>
    <div className="control-strip mb-5 grid grid-cols-3 gap-1 rounded-2xl p-1" role="tablist" aria-label="进度分类">
      {TABS.map((item) => <button type="button" key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => change(item.id)} className={"choice-chip press h-10 text-[13px] font-semibold " + (tab === item.id ? "bg-fg text-bg shadow-sm" : "text-muted")}>{item.label}</button>)}
    </div>
    {tab === "body" && <BodyReview />}
    {tab === "training" && <TrainingReview />}
    {tab === "log" && <LogReview />}
  </div>;
}

function BodyReview() {
  const today = useToday();
  const { data, setBodyWeight, setWaist } = useStore();
  const toast = useToast();
  const [weight, setWeight] = useState(0);
  const [waist, setWaistValue] = useState(0);
  const [trendMetric, setTrendMetric] = useState<BodyTrendMetric>("weight");
  const todayWeight = data.bodyWeights.find((item) => item.date === today)?.weight;
  const todayWaist = data.waistEntries.find((item) => item.date === today)?.waist;
  function save() {
    let count = 0;
    if (weight >= 30 && weight <= 300) { setBodyWeight(today, weight); count += 1; setWeight(0); }
    if (waist >= 30 && waist <= 200) { setWaist(today, waist); count += 1; setWaistValue(0); }
    if (count) { haptic([8, 24, 8]); toast.show("身体数据已更新"); }
  }
  const latestWeights = [...data.bodyWeights].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  const latestWaists = [...data.waistEntries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  return <div className="space-y-4">
    <section className="control-card p-3.5">
      <div className="flex items-center justify-between"><div><p className="text-[14px] font-semibold text-fg">今天的测量</p><p className="mt-0.5 text-[11px] text-faint">覆盖同日记录，不会产生重复条目。</p></div><span className="tnum rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted">{todayWeight != null ? "体重 ✓" : "体重"} · {todayWaist != null ? "腰围 ✓" : "腰围"}</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <MetricInput label="体重" unit="kg" value={weight} onChange={setWeight} placeholder={todayWeight != null ? String(todayWeight) : "0.0"} />
        <MetricInput label="腰围" unit="cm" value={waist} onChange={setWaistValue} placeholder={todayWaist != null ? String(todayWaist) : "0.0"} />
      </div>
      <button type="button" onClick={save} disabled={!((weight >= 30 && weight <= 300) || (waist >= 30 && waist <= 200))} className="press mt-3 h-11 w-full rounded-xl bg-fg text-[14px] font-semibold text-bg disabled:opacity-30">保存测量</button>
    </section>
    <section>
      <SectionTitle title="身体趋势" helper="一张图切换体重、腰围和 RFM 体脂估算" />
      <div className="control-strip mb-2 grid grid-cols-3 gap-1 rounded-2xl p-1" aria-label="身体趋势指标">
        {([
          { id: "weight", label: "体重" },
          { id: "waist", label: "腰围" },
          { id: "bodyFat", label: "体脂估算" },
        ] as const).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTrendMetric(item.id)}
            className={"choice-chip press h-9 text-[12px] font-semibold " + (trendMetric === item.id ? "bg-fg text-bg" : "text-muted")}
            aria-pressed={trendMetric === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>
      {trendMetric === "weight" && (
        <>
          <WeightChart entries={data.bodyWeights} />
          <div className="mt-2"><WeeklyAverageCard entries={data.bodyWeights} /></div>
          {latestWeights.length > 0 && <CompactMetricList title="最近体重" rows={latestWeights.map((entry)=>({date:entry.date,value:`${entry.weight} kg`}))} />}
        </>
      )}
      {trendMetric === "waist" && (
        <>
          <WaistChart entries={data.waistEntries} />
          {latestWaists.length > 0 && <CompactMetricList title="最近腰围" rows={latestWaists.map((entry)=>({date:entry.date,value:`${entry.waist} cm`}))} />}
        </>
      )}
      {trendMetric === "bodyFat" && <BodyFatTrendChart profile={data.profile} waistEntries={data.waistEntries} />}
    </section>
    <section><SectionTitle title="体脂估算" helper="RFM 当前值和公式说明；趋势在上方切换查看" /><BodyFatEstimateCard profile={data.profile} waistEntries={data.waistEntries} bodyWeights={data.bodyWeights} /></section>
  </div>;
}

function TrainingReview() {
  const { data, setMuscleTarget, startNewMicrocycle } = useStore();
  const today = useToday();
  const [scope, setScope] = useState<VolumeScope>("microcycle");
  const [expandedMuscle, setExpandedMuscle] = useState<MuscleGroup | null>(null);
  const week = currentWeekKeys();
  const volumeDays = volumeScopeDays(data, scope, today);
  const volume = computeVolumeSummary(volumeDays, data.profile?.trainingLevel, data.muscleTargets, volumeTargetScale(scope));
  const scopeLabel = volumeScopeLabel(volumeDays);
  const totalSets = volume.totalDirectSets;
  const recent = Object.entries(data.days).filter(([, day]) => { const wk=day.workout; return !!wk && (wk.type === "rest" || wk.exercises.some((exercise)=>exercise.sets.length)); }).sort(([a],[b])=>b.localeCompare(a)).slice(0,8);
  return <div className="space-y-4">
    <section className="grid grid-cols-3 gap-2.5"><StatCard label="直接组" value={String(totalSets)} hint={scope === "microcycle" ? "当前微周期" : scope === "7d" ? "最近 7 天" : "最近 28 天"} /><StatCard label="有效组" value={String(volume.totalEffectiveSets)} hint="按动作贡献" /><StatCard label="训练日" value={String(recent.filter(([date])=>week.includes(date)).length)} hint="本自然周" /></section>
    <ArchiveSummary />
    <section className="control-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-fg">肌群容量处方</p>
          <p className="mt-0.5 text-[11px] text-faint">默认看当前训练微周期；有效组按动作库贡献计算。</p>
          <p className="tnum mt-1 text-[11px] text-muted">{scopeLabel}{scope === "28d" ? " · 目标按 4 周累计，建议按周均给出" : ""}</p>
        </div>
        <button type="button" onClick={() => startNewMicrocycle(today)} className="press rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-accent">新周期</button>
      </div>
      <div className="control-strip mt-3 grid grid-cols-3 gap-1 rounded-2xl p-1">
        {(["microcycle","7d","28d"] as const).map((item)=><button key={item} type="button" onClick={()=>setScope(item)} className={"choice-chip press h-9 text-[12px] font-semibold " + (scope===item ? "bg-fg text-bg" : "text-muted")}>{item==="microcycle" ? "本周期" : item==="7d" ? "近7天" : "近28天"}</button>)}
      </div>
      <div className="mt-4 space-y-3">
        {volume.rows.length ? volume.rows.map((row) => {
          const max=Math.max(row.target.high,row.effectiveSets,1);
          const progress=Math.min(100,Math.round((row.effectiveSets/max)*100));
          const statusLabel = row.status === "under" ? "不足" : row.status === "over" ? "偏高" : "合适";
          const advice = volumeAdviceForRow(row, scope);
          return <div key={row.muscle} className="rounded-xl bg-surface-2 p-2.5">
            <button type="button" onClick={()=>setExpandedMuscle((cur)=>cur===row.muscle?null:row.muscle)} className="press flex w-full items-center justify-between gap-2 text-left">
              <span className="font-medium text-fg">{MUSCLE_LABELS[row.muscle]}</span>
              <span className={"tnum rounded-md px-1.5 py-0.5 text-[10px] font-semibold " + (row.status === "in" ? "bg-accent-soft text-accent" : row.status === "over" ? "bg-warn/10 text-warn" : "bg-surface text-faint")}>{statusLabel}</span>
            </button>
            <div className="mt-1 flex items-center justify-between text-[11px] text-faint">
              <span className="tnum">直接 {row.directSets} · 有效 {row.effectiveSets}</span>
              <span className="tnum">目标 {row.target.low}–{row.target.high}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface"><div className={"h-full rounded-full " + (row.status === "in" ? "bg-accent" : "bg-border-strong")} style={{width:`${progress}%`}} /></div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{advice.detail}</p>
            {expandedMuscle === row.muscle && <div className="mt-2 space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                <NumberField value={row.target.low} onChange={(v)=>setMuscleTarget(row.muscle, v, row.target.high)} ariaLabel={`${MUSCLE_LABELS[row.muscle]}目标下限`} className="number-cell h-9 rounded-lg border border-border bg-surface px-2 text-center text-[13px] text-fg" />
                <NumberField value={row.target.high} onChange={(v)=>setMuscleTarget(row.muscle, row.target.low, v)} ariaLabel={`${MUSCLE_LABELS[row.muscle]}目标上限`} className="number-cell h-9 rounded-lg border border-border bg-surface px-2 text-center text-[13px] text-fg" />
                <span className="self-center text-[11px] text-faint">目标</span>
              </div>
              <div className="space-y-1">
                {row.sources.map((source)=><p key={`${row.muscle}-${source.exerciseId}-${source.direct}`} className="tnum flex justify-between gap-2 text-[11px] text-muted"><span className="truncate">{source.name}{source.direct ? "" : " · 间接"}</span><span className="shrink-0">{source.direct ? `${source.sets}组` : ""} · {source.contribution}</span></p>)}
              </div>
            </div>}
          </div>;
        }) : <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] text-faint">当前范围暂无训练容量。</p>}
      </div>
    </section>
    <ExerciseArchive />
    <ExerciseTrendReview />
    <section><SectionTitle title="近期训练" helper="训练计划只有主动开始后才会创建实际记录" />{recent.length === 0 ? <Empty text="尚无训练记录。先从训练页开始一场会话。" href="/train" cta="开始训练" /> : <div className="control-card overflow-hidden">{recent.map(([date,day])=>{ const wk=day.workout!; const sets=wk.exercises.reduce((sum,exercise)=>sum+exercise.sets.length,0); return <Link key={date} href={`/train?date=${date}`} className="press soft-divider flex items-center gap-3 border-t px-3.5 py-3 first:border-t-0"><span className="w-12 text-[12px] font-medium text-muted">{relativeLabel(date)}</span><span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">{typeLabel(wk.type)}</span><span className="tnum ml-auto text-[12px] text-muted">{wk.type === "rest" ? "休息" : `${sets} 组`}</span><span className="text-faint">›</span></Link>;})}</div>}</section>
  </div>;
}

function ArchiveSummary() {
  const { data } = useStore();
  const today = useToday();
  const rows = useMemo(() => {
    const calendarDates = (count: number) => {
      const [year, month, day] = today.split("-").map(Number);
      const end = new Date(year, month - 1, day);
      return Array.from({ length: count }, (_, index) => {
        const current = new Date(end);
        current.setDate(end.getDate() - (count - 1 - index));
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, "0");
        const d = String(current.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      });
    };
    const last90 = calendarDates(90);
    const last28 = calendarDates(28);
    const summarizeDates = (scope: string[]) => {
      let trainingDays = 0;
      let sets = 0;
      let cardio = 0;
      let nutritionDays = 0;
      for (const date of scope) {
        const day = data.days[date];
        const daySets = day?.workout?.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) ?? 0;
        if (day?.workout?.type === "rest" || daySets > 0) trainingDays += 1;
        sets += daySets;
        cardio += (day?.cardio ?? []).reduce((sum, entry) => sum + entry.minutes, 0);
        if ((day?.nutrition?.calories ?? 0) > 0) nutritionDays += 1;
      }
      return { trainingDays, sets, cardio, nutritionDays };
    };
    return [
      { label: "近 28 天", ...summarizeDates(last28) },
      { label: "近 90 天", ...summarizeDates(last90) },
    ];
  }, [data.days, today]);

  if (!Object.keys(data.days).length) return null;

  return <section className="control-card p-3.5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[14px] font-semibold text-fg">档案摘要</p>
        <p className="mt-0.5 text-[11px] text-faint">按真实日历窗口统计训练、饮食和有氧记录。</p>
      </div>
      <Link href="/settings" className="press rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-accent">导出</Link>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      {rows.map((row) => <div key={row.label} className="control-strip rounded-xl p-2.5">
        <p className="text-[11px] font-semibold text-fg">{row.label}</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <MiniFact label="训练" value={`${row.trainingDays}天`} />
          <MiniFact label="组数" value={`${row.sets}`} />
          <MiniFact label="饮食" value={`${row.nutritionDays}天`} />
          <MiniFact label="有氧" value={`${row.cardio}分`} />
        </div>
      </div>)}
    </div>
  </section>;
}

function bestSet(sets: SetRecord[]) {
  if (!sets.length) return null;
  return sets.reduce((winner, set) => {
    const current = set.weight * set.reps;
    const previous = winner.weight * winner.reps;
    return current > previous ? set : winner;
  }, sets[0]);
}

function formatSet(set: SetRecord) {
  return `${set.weight}kg × ${set.reps}`;
}

function bestSetLabel(sets: SetRecord[]) {
  const best = bestSet(sets);
  if (!best) return "—";
  return formatSet(best);
}

type ExerciseArchiveRow = {
  id: string;
  name: string;
  sessions: {
    date: string;
    type: TrainingType;
    setCount: number;
    best: string;
    totalVolume: number;
  }[];
  totalSets: number;
  bestSet: SetRecord | null;
};

function ExerciseArchive() {
  const { data } = useStore();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const archive = useMemo<ExerciseArchiveRow[]>(() => {
    const map = new Map<string, ExerciseArchiveRow>();
    Object.keys(data.days).sort().reverse().forEach((date) => {
      const workout = data.days[date].workout;
      if (!workout || workout.type === "rest") return;
      workout.exercises.forEach((exercise) => {
        if (!exercise.sets.length) return;
        const current = map.get(exercise.id) ?? {
          id: exercise.id,
          name: exercise.name,
          sessions: [],
          totalSets: 0,
          bestSet: null,
        };
        const exerciseBest = bestSet(exercise.sets);
        const volume = exercise.sets.reduce((sum, set) => sum + set.weight * set.reps, 0);
        current.sessions.push({
          date,
          type: workout.type,
          setCount: exercise.sets.length,
          best: bestSetLabel(exercise.sets),
          totalVolume: Math.round(volume),
        });
        current.totalSets += exercise.sets.length;
        if (exerciseBest && (!current.bestSet || exerciseBest.weight * exerciseBest.reps > current.bestSet.weight * current.bestSet.reps)) current.bestSet = exerciseBest;
        map.set(exercise.id, current);
      });
    });
    return [...map.values()].sort((a, b) => b.sessions.length - a.sessions.length || a.name.localeCompare(b.name));
  }, [data.days]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return archive.filter((row) => !needle || row.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [archive, query]);
  const selected = archive.find((row) => row.id === selectedId) ?? filtered[0];

  if (!archive.length) return null;

  return <section className="control-card p-3.5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[14px] font-semibold text-fg">动作档案</p>
        <p className="mt-0.5 text-[11px] text-faint">搜索动作，查看最近记录和对应训练日。</p>
      </div>
      <span className="tnum rounded-lg bg-surface-2 px-2 py-1 text-[11px] text-muted">{archive.length} 个动作</span>
    </div>
    <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜索动作" className="number-cell mt-3 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent" />
    <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
      {filtered.map((row) => <button key={row.id} type="button" onClick={()=>setSelectedId(row.id)} className={"choice-chip press shrink-0 border px-3 py-2 text-[12px] font-semibold " + (selected?.id === row.id ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}>{row.name}</button>)}
    </div>
    {selected ? (
      <div className="mt-3">
        <div className="grid grid-cols-3 gap-2">
          <MiniFact label="记录次数" value={`${selected.sessions.length}`} />
          <MiniFact label="总组数" value={`${selected.totalSets}`} />
          <MiniFact label="最佳组" value={selected.bestSet ? formatSet(selected.bestSet) : "—"} />
        </div>
        <Link href={`/train?start=${selected.sessions[0].type}`} className="choice-chip press mt-2 flex h-10 items-center justify-center border border-border bg-surface-2 text-[12px] font-semibold text-accent">
          下次做{typeLabel(selected.sessions[0].type)}
        </Link>
        <div className="control-strip mt-2 overflow-hidden rounded-xl">
          {selected.sessions.slice(0, 6).map((session) => <Link key={`${selected.id}-${session.date}`} href={`/train?date=${session.date}`} className="press soft-divider flex items-center gap-3 border-t px-3 py-2.5 first:border-t-0">
            <span className="w-12 shrink-0 text-[12px] text-muted">{relativeLabel(session.date)}</span>
            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{typeLabel(session.type)}</span>
            <span className="tnum text-[12px] text-fg">{session.best}</span>
            <span className="tnum ml-auto text-[11px] text-faint">{session.setCount} 组 · {session.totalVolume}</span>
          </Link>)}
        </div>
      </div>
    ) : (
      <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-4 text-center text-[12px] text-faint">没有匹配的动作。</p>
    )}
  </section>;
}

function ExerciseTrendReview() {
  const { data } = useStore();
  const rows = useMemo(() => {
    const dates = Object.keys(data.days).sort().reverse();
    const seen = new Set<string>();
    const out: { id: string; name: string; date: string; current: string; previous: string | null }[] = [];
    for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
      const date = dates[dateIndex];
      const workout = data.days[date].workout;
      if (!workout || workout.type === "rest") continue;
      for (const exercise of workout.exercises) {
        if (!exercise.sets.length || seen.has(exercise.id)) continue;
        seen.add(exercise.id);
        let previous: string | null = null;
        for (let prevIndex = dateIndex + 1; prevIndex < dates.length; prevIndex += 1) {
          const prevDate = dates[prevIndex];
          const prevExercise = data.days[prevDate].workout?.exercises.find((item) => item.id === exercise.id && item.sets.length > 0);
          if (prevExercise) {
            previous = `${relativeLabel(prevDate)} · ${bestSetLabel(prevExercise.sets)}`;
            break;
          }
        }
        out.push({ id: exercise.id, name: exercise.name, date, current: bestSetLabel(exercise.sets), previous });
        if (out.length >= 6) return out;
      }
    }
    return out;
  }, [data.days]);

  if (!rows.length) return null;

  return <section>
    <SectionTitle title="近期动作表现" helper="展示最近出现的动作和上次同动作记录" />
    <div className="control-card overflow-hidden">
      {rows.map((row) => <Link key={`${row.id}-${row.date}`} href={`/train?date=${row.date}`} className="press soft-divider flex items-center gap-3 border-t px-3.5 py-3 first:border-t-0">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-fg">{row.name}</p>
          <p className="tnum mt-0.5 text-[11px] text-faint">{relativeLabel(row.date)} · 最佳组 {row.current}</p>
        </div>
        <div className="max-w-[42%] text-right">
          <p className="tnum truncate text-[11px] text-muted">{row.previous ?? "首次记录"}</p>
          <p className="text-[10px] font-semibold text-accent">打开训练日</p>
        </div>
      </Link>)}
    </div>
  </section>;
}

function LogReview() {
  const { data, getDay } = useStore();
  const today = useToday();
  const [targetDate, setTargetDate] = useState(today);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TrainingType | "all">("all");
  const [range, setRange] = useState<"30" | "90" | "all">("30");
  const recentDates = useMemo(() => Array.from({length:Number(range === "all" ? 365 : range)},(_,index)=>{ const d=new Date(); d.setDate(d.getDate()-index); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }), [range]);
  const dates = useMemo(() => {
    const known = new Set([...recentDates, ...Object.keys(data.days)]);
    const q = query.trim().toLowerCase();
    return [...known].sort().reverse().filter((date) => {
      const day = data.days[date];
      if (range !== "all" && !recentDates.includes(date)) return false;
      if (typeFilter !== "all" && day?.workout?.type !== typeFilter) return false;
      if (!q) return true;
      return dayMatchesQuery(day, q);
    }).slice(0, range === "all" ? 180 : Number(range));
  }, [data.days, query, range, recentDates, typeFilter]);
  return <div>
    <div className="control-card mb-3 p-3">
      <p className="text-[13px] font-semibold text-fg">补记或修改某一天</p>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2">
        <input type="date" value={targetDate} onChange={(event)=>setTargetDate(event.target.value || today)} className="number-cell tnum h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-[14px] font-semibold text-fg outline-none focus:border-accent" aria-label="选择日期" />
        <Link href={`/train?date=${targetDate}`} className="choice-chip press flex h-10 items-center justify-center border border-border bg-surface px-3 text-[12px] font-semibold text-muted">训练</Link>
        <Link href={`/nutrition?date=${targetDate}`} className="choice-chip press flex h-10 items-center justify-center border border-border bg-surface px-3 text-[12px] font-semibold text-muted">饮食</Link>
        <Link href={`/cardio?date=${targetDate}`} className="choice-chip press flex h-10 items-center justify-center border border-border bg-surface px-3 text-[12px] font-semibold text-muted">有氧</Link>
      </div>
    </div>
    <div className="control-card mb-3 p-3">
      <p className="text-[13px] font-semibold text-fg">历史检索</p>
      <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜动作、方式或备注" className="number-cell mt-2 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent" />
      <div className="mt-2 grid grid-cols-5 gap-1">
        {(["all","push","pull","legs","rest"] as const).map((item) => <button key={item} type="button" onClick={()=>setTypeFilter(item)} className={"choice-chip press h-9 text-[12px] font-semibold " + (typeFilter === item ? "bg-fg text-bg" : "bg-surface-2 text-muted")}>{item === "all" ? "全部" : typeLabel(item)}</button>)}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {(["30","90","all"] as const).map((item) => <button key={item} type="button" onClick={()=>setRange(item)} className={"choice-chip press h-8 text-[11px] font-semibold " + (range === item ? "bg-accent-soft text-accent" : "bg-surface-2 text-faint")}>{item === "all" ? "全部档案" : `近 ${item} 天`}</button>)}
      </div>
    </div>
    <p className="mb-3 text-[12px] text-muted">点开日期查看训练、饮食和有氧；共显示 {dates.length} 天。</p>
    <div className="control-card overflow-hidden">{dates.length ? dates.map((date)=><HistoryRow key={date} date={date} day={getDay(date)} />) : <Empty text="没有匹配的记录。" href="/progress?tab=log" cta="清空筛选" />}</div>
  </div>;
}

function dayMatchesQuery(day: DayLog | undefined, query: string) {
  if (!day) return false;
  const workoutText = day.workout?.exercises.map((exercise) => `${exercise.name} ${exercise.sets.map((set)=>`${set.weight} ${set.reps}`).join(" ")}`).join(" ") ?? "";
  const cardioText = (day.cardio ?? []).map((entry) => `${entry.mode} ${entry.note ?? ""}`).join(" ");
  const nutritionText = day.nutrition ? `${day.nutrition.calories} ${day.nutrition.protein} ${day.nutrition.carbs} ${day.nutrition.fat}` : "";
  return `${workoutText} ${cardioText} ${nutritionText}`.toLowerCase().includes(query);
}

function MetricInput({label,unit,value,onChange,placeholder}:{label:string;unit:string;value:number;onChange:(value:number)=>void;placeholder:string}) { return <label><span className="mb-1 block text-[11px] font-medium text-faint">{label} · {unit}</span><NumberField value={value} onChange={onChange} placeholder={placeholder} ariaLabel={label} allowDecimal className="tnum h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-center text-[17px] font-semibold text-fg outline-none focus:border-accent" /></label>; }
function CompactMetricList({title, rows}:{title:string;rows:{date:string;value:string}[]}) { return <div className="control-card mt-2 overflow-hidden px-3.5"><p className="soft-divider border-b py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{title}</p>{rows.map((row)=> <div key={row.date} className="soft-divider flex items-center border-t py-2 first:border-t-0"><span className="text-[12px] text-muted">{relativeLabel(row.date)}</span><span className="tnum ml-2 text-[11px] text-faint">{formatCompact(row.date).md}</span><span className="tnum ml-auto text-[13px] font-semibold text-fg">{row.value}</span></div>)}</div>; }
function SectionTitle({title,helper}:{title:string;helper:string}) { return <div className="mb-2"><h2 className="text-[14px] font-semibold text-fg">{title}</h2><p className="mt-0.5 text-[11px] text-faint">{helper}</p></div>; }
function StatCard({label,value,hint}:{label:string;value:string;hint:string}) { return <div className="metric-sheen rounded-2xl border border-border bg-surface p-3 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</p><p className="tnum mt-2 text-[23px] font-bold text-fg">{value}</p><p className="mt-0.5 text-[10px] text-muted">{hint}</p></div>; }
function MiniFact({label,value}:{label:string;value:string}) { return <div className="rounded-lg bg-surface px-2 py-1.5 text-center"><p className="text-[10px] text-faint">{label}</p><p className="tnum mt-0.5 text-[12px] font-semibold text-fg">{value}</p></div>; }
function Empty({text,href,cta}:{text:string;href:string;cta:string}) { return <div className="control-card border-dashed px-4 py-7 text-center"><p className="text-[12px] text-faint">{text}</p><Link href={href} className="press mt-3 inline-flex rounded-lg bg-fg px-3 py-2 text-[12px] font-semibold text-bg">{cta}</Link></div>; }
