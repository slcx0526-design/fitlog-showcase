"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SetRecord, TemplateItem, TrainingType } from "@/lib/types";

import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { isPersonaMode, useUIMode } from "@/lib/uiMode";
import { usePersona } from "@/lib/copy";
import { useI18n } from "@/lib/i18n";
import { typeHasExercises } from "@/lib/exercises";
import ExerciseCard from "./ExerciseCard";
import AddExercisePanel from "./AddExercisePanel";
import CutTrainingNotice from "./CutTrainingNotice";
import { haptic, pulseFeedback } from "@/lib/feedback";

const TYPES: { value: TrainingType; label: string }[] = [
  { value: "push", label: "推" },
  { value: "pull", label: "拉" },
  { value: "legs", label: "腿" },
  { value: "rest", label: "休息" },
  { value: "custom", label: "自定义" },
];

function typeLabelOf(t: TrainingType) {
  return TYPES.find((x) => x.value === t)?.label ?? t;
}

function isTemplateType(type: TrainingType | undefined): type is "push" | "pull" | "legs" {
  return type === "push" || type === "pull" || type === "legs";
}

export default function TrainingModule({ date, suggestedType }: { date: string; suggestedType?: TrainingType | null }) {
  const { getDay, setWorkoutType, setWorkoutDone, createTemplate, setTemplateItems } = useStore();
  const { mode } = useUIMode();
  const { tr } = useI18n();
  const { persona } = usePersona();
  const toast = useToast();
  const workout = getDay(date)?.workout;
  const type = workout?.type;
  const exercises = workout?.exercises ?? [];
  const done = workout?.done ?? false;

  const [pendingType, setPendingType] = useState<TrainingType | null>(null);

  const addedIds = useMemo(
    () => new Set(exercises.map((e) => e.id)),
    [exercises]
  );
  // 有已记录组的动作 —— 不允许从添加面板一键删掉（防止静默丢记录）
  const lockedIds = useMemo(
    () => new Set(exercises.filter((e) => e.sets.length > 0).map((e) => e.id)),
    [exercises]
  );

  // 本次训练里"最近录入的一组"：给没有自身历史的新动作当起点
  // （按时间戳取最新；老数据没戳则退而取最后一个有组动作的末组）
  const sessionLastSet = useMemo<SetRecord | null>(() => {
    let best: SetRecord | null = null;
    let bestAt = "";
    for (const e of exercises) {
      for (const s of e.sets) {
        if (s.at && s.at >= bestAt) {
          bestAt = s.at;
          best = s;
        }
      }
    }
    if (best) return best;
    for (let i = exercises.length - 1; i >= 0; i--) {
      if (exercises[i].sets.length) {
        return exercises[i].sets[exercises[i].sets.length - 1];
      }
    }
    return null;
  }, [exercises]);

  const setCount = exercises.reduce((s, e) => s + e.sets.length, 0);
  const mainCount = exercises.filter((exercise) => exercise.isMain).length;
  const emptyCount = exercises.filter((exercise) => exercise.sets.length === 0).length;
  const plannedSets = exercises.reduce((sum, exercise) => sum + (exercise.planned?.sets ?? 0), 0);
  const canFinish = type !== undefined && type !== "rest" && setCount > 0;
  const canSaveTemplate = isTemplateType(type) && exercises.some((e) => e.sets.length > 0);

  function saveWorkoutAsTemplate() {
    if (!isTemplateType(type)) return;
    const items: TemplateItem[] = exercises
      .filter((exercise) => exercise.sets.length > 0)
      .map((exercise) => {
        const reps = exercise.sets.map((set) => set.reps).filter((value) => value > 0);
        const repsLow = reps.length ? Math.min(...reps) : exercise.planned?.repsLow ?? 8;
        const repsHigh = reps.length ? Math.max(...reps) : exercise.planned?.repsHigh ?? 12;
        return {
          exerciseId: exercise.id,
          name: exercise.name,
          sets: exercise.sets.length,
          repsLow,
          repsHigh: Math.max(repsLow, repsHigh),
          ...(exercise.planned?.rpe ? { rpe: exercise.planned.rpe } : {}),
        };
      });
    if (!items.length) return;
    const id = createTemplate(type, `${typeLabelOf(type)} ${date}`);
    if (!id) {
      toast.show(tr("该类型模板已达上限"));
      return;
    }
    setTemplateItems(id, items);
    pulseFeedback("confirm");
    toast.show(tr("已存为训练模板"));
  }

  function chooseType(t: TrainingType) {
    if (t === type) return;
    if (mode !== "pulse") haptic(8);
    pulseFeedback("start");
    // 已有记录时，切换类型先确认（避免 rest 隐藏记录 / 类型错配）
    if (setCount > 0) {
      setPendingType(t);
      return;
    }
    setWorkoutType(date, t);
  }

  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
        {tr("训练")}
      </h2>

      <CutTrainingNotice />

      {type === undefined && (
        <div className="control-card mb-3 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-fg">开始一场训练</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-faint">
                {suggestedType ? `今天计划：${typeLabelOf(suggestedType)}。计划不会自动生成记录，确认后才开始。` : "选择训练类型后才会创建实际训练记录。"}
              </p>
            </div>
            <Link href="/schedule" className="press rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-accent">计划</Link>
          </div>
          {suggestedType && (
            <button onClick={() => chooseType(suggestedType)} className="press mt-3 h-11 w-full rounded-xl bg-fg text-[14px] font-semibold text-bg">开始{typeLabelOf(suggestedType)}训练</button>
          )}
        </div>
      )}

      {/* 训练类型选择器 —— 仅用户点击时创建会话 */}
      <div className="control-strip grid grid-cols-5 gap-1 rounded-2xl p-1">
        {TYPES.map((t) => {
          const active = type === t.value;
          return (
            <button
              key={t.value}
              onClick={() => chooseType(t.value)}
              aria-pressed={active}
              className={
                "choice-chip press border text-[14px] font-semibold " +
                (active
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-transparent bg-transparent text-muted active:bg-surface")
              }
            >
              {tr(t.label)}
            </button>
          );
        })}
      </div>

      {/* 类型切换确认 */}
      {pendingType && (
        <div className="animate-slidedown mt-2 rounded-lg border border-accent/40 bg-accent-soft p-2.5">
          <p className="tnum text-[13px] font-medium text-accent">
            {pendingType === "rest"
              ? tr("切到休息日？已记录的 {n} 组会被隐藏", { n: setCount })
              : tr("切到「{t}」？已记录的 {n} 组会保留", { t: tr(typeLabelOf(pendingType)), n: setCount })}
          </p>
          <p className="mt-0.5 text-[11px] text-accent/80">
            {tr("数据不会删除")}{pendingType === "rest" ? tr("，切回原类型即可见") : ""}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setPendingType(null)}
              className="press h-9 flex-1 rounded-md border border-border bg-surface text-[13px] text-fg"
            >
              {tr("取消")}
            </button>
            <button
              onClick={() => {
                setWorkoutType(date, pendingType);
                setPendingType(null);
              }}
              className="press h-9 flex-1 rounded-md bg-accent text-[13px] font-semibold text-accent-fg"
            >
              {tr("切换")}
            </button>
          </div>
        </div>
      )}

      {/* 动作区 */}
      {type === undefined ? (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-surface px-4 py-5 text-center text-[12px] leading-relaxed text-faint">
          训练开始后可套用模板、添加动作，并沿用上次表现。这里不会把计划预先写成实际训练。
        </p>
      ) : type === "rest" ? (
        <RestDayPanel />
      ) : (
        <div className="mt-3 space-y-2.5">
          {/* 套用模板：该类型已设置的模板（推→推1/推2 …），合并去重 */}
          <TemplateApplyRow date={date} type={type} addedIds={addedIds} />

          {exercises.map((ex) => (
            <ExerciseCard
              key={ex.id}
              date={date}
              exercise={ex}
              sessionLastSet={sessionLastSet}
              templateId={workout?.templateId}
            />
          ))}
          {typeHasExercises(type) && (
            <AddExercisePanel
              date={date}
              type={type}
              addedIds={addedIds}
              lockedIds={lockedIds}
            />
          )}

          {canSaveTemplate && (
            <div className="control-card flex items-center gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-fg">沉淀本次训练</p>
                <p className="mt-0.5 text-[11px] text-faint">保存动作、组数和 reps 范围；重量仍跟随上次记录。</p>
              </div>
              <button
                type="button"
                onClick={saveWorkoutAsTemplate}
                className="choice-chip press flex h-10 shrink-0 items-center justify-center border border-border bg-surface-2 px-3 text-[12px] font-semibold text-accent"
              >
                存为模板
              </button>
            </div>
          )}

          <WorkoutWrapUp
            emptyCount={emptyCount}
            exerciseCount={exercises.length}
            mainCount={mainCount}
            plannedSets={plannedSets}
            setCount={setCount}
          />

          {/* 结束训练 / 继续记录 —— 仅布尔状态，不存时间戳 */}
          {canFinish &&
            (done ? (
              <div className="control-card mt-1 flex items-center gap-2 px-3.5 py-3">
                <span className="flex flex-1 items-center gap-2 text-[14px] font-semibold text-accent">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 13L9 17L19 7"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {persona.trainingCompleted(mode)}
                </span>
                <button
                  onClick={() => setWorkoutDone(date, false)}
                  className="press h-9 rounded-md border border-border bg-surface-2 px-3 text-[13px] font-medium text-muted active:bg-surface"
                >
                  {isPersonaMode(mode) ? "REOPEN" : tr("继续记录")}
                </button>
              </div>
            ) : (
              <div className="control-card mt-1 p-3.5">
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <WrapFact label="本次" value={`${setCount}组`} />
                  <WrapFact label="主项" value={`${mainCount}`} />
                  <WrapFact label="空动作" value={`${emptyCount}`} />
                </div>
                <button
                  onClick={() => {
                    setWorkoutDone(date, true);
                    if (mode !== "pulse") haptic([10, 30, 16]);
                    pulseFeedback("finish");
                    toast.show(persona.trainingCompleted(mode));
                  }}
                  className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-fg text-[15px] font-semibold text-bg"
                >
                  {isPersonaMode(mode) ? "FINISH TRAINING" : tr("结束训练")}
                </button>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

function WorkoutWrapUp({
  emptyCount,
  exerciseCount,
  mainCount,
  plannedSets,
  setCount,
}: {
  emptyCount: number;
  exerciseCount: number;
  mainCount: number;
  plannedSets: number;
  setCount: number;
}) {
  if (exerciseCount === 0) return null;
  if (setCount === 0) {
    return (
      <div className="control-card px-3.5 py-3">
        <p className="text-[13px] font-semibold text-fg">还没有记录组数</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-faint">
          已添加 {exerciseCount} 个动作。记录至少一组后再结束训练。
        </p>
      </div>
    );
  }
  const plannedLabel = plannedSets > 0 ? `${setCount}/${plannedSets}` : `${setCount}`;
  const plannedHint = plannedSets > 0 ? (setCount >= plannedSets ? "已达到计划组数" : "继续按当天状态补齐") : "按实际记录统计";
  return (
    <div className="control-card px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-fg">收尾检查</p>
          <p className="mt-0.5 text-[11px] text-faint">{plannedHint}</p>
        </div>
        <span className="tnum rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted">{plannedLabel} 组</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <WrapFact label="动作" value={`${exerciseCount}`} />
        <WrapFact label="主项" value={`${mainCount}`} />
        <WrapFact label="空动作" value={`${emptyCount}`} />
      </div>
    </div>
  );
}

function WrapFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface px-2 py-1.5 text-center">
      <p className="text-[10px] text-faint">{label}</p>
      <p className="tnum mt-0.5 text-[12px] font-semibold text-fg">{value}</p>
    </div>
  );
}

// ============================================================
// 套用模板行：显示该类型已设置的模板按钮 + 编辑入口
// ============================================================
function TemplateApplyRow({
  date,
  type,
  addedIds,
}: {
  date: string;
  type: TrainingType;
  addedIds: Set<string>;
}) {
  const { data, applyTemplate } = useStore();
  const { tr } = useI18n();
  const toast = useToast();
  const list = (data.templates ?? []).filter((t) => t.type === type);

  if (list.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {list.map((tpl) => {
        const newCount = tpl.items.filter((it) => !addedIds.has(it.exerciseId)).length;
        const plannedSets = tpl.items.reduce((sum, item) => sum + item.sets, 0);
        return (
          <button
            key={tpl.id}
            onClick={() => {
              const n = applyTemplate(tpl.id, date);
              pulseFeedback("confirm");
              toast.show(n > 0 ? tr("已套用 {a} · +{n} 动作", { a: tpl.name.trim() || tr("未命名模板"), n }) : tr("动作已都在"));
            }}
            className={
              "press flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-[13px] font-semibold " +
              (newCount > 0
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface text-faint")
            }
            >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <path
                d="M9 5H7C5.9 5 5 5.9 5 7V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V7C19 5.9 18.1 5 17 5H15M9 5C9 3.9 9.9 3 11 3H13C14.1 3 15 3.9 15 5M9 5C9 6.1 9.9 7 11 7H13C14.1 7 15 6.1 15 5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="min-w-0 truncate">{tpl.name.trim() || tr("未命名模板")}</span>
            <span className="tnum shrink-0 text-[11px]">{newCount > 0 ? `+${newCount}` : "已在"} · {plannedSets}组</span>
          </button>
        );
      })}
      <Link
        href="/templates"
        className="press grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-surface text-muted"
        aria-label={tr("编辑模板")}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path
            d="M14 6L18 10M4 20L4.5 16.5L15 6L18 9L7.5 19.5L4 20Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </div>
  );
}

function RestDayPanel() {
  return (
    <section className="rest-day-panel mt-3 rounded-2xl border border-border bg-surface p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M7 8.5C8.3 7 10 6.3 12 6.3C15.5 6.3 18 8.7 18 12.2C18 15.7 15.5 18 12 18C9.8 18 7.9 16.9 6.8 15.2C8.1 15.8 9.4 15.9 10.6 15.5C8.7 14.6 7.4 12.7 7.4 10.6C7.4 9.9 7.3 9.2 7 8.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-fg">休息已写入今天的训练日志</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">今天不需要创建动作或补偿热量。保持饮食预算，按恢复情况选择轻松活动即可。</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/cardio" className="press flex h-10 items-center justify-center rounded-xl bg-surface-2 text-[12px] font-semibold text-fg">记录轻松有氧</Link>
        <Link href="/schedule" className="press flex h-10 items-center justify-center rounded-xl border border-border bg-surface text-[12px] font-semibold text-accent">查看训练计划</Link>
      </div>
    </section>
  );
}
