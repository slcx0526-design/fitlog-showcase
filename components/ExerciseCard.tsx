"use client";

import { useEffect, useRef, useState } from "react";
import type { Exercise, SetRecord } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { isPersonaMode, useUIMode } from "@/lib/uiMode";
import { useNow } from "@/lib/hooks";
import { usePersona } from "@/lib/copy";
import { useI18n } from "@/lib/i18n";
import { formatCompact, timeSince } from "@/lib/date";
import { formatReps } from "@/lib/templates";
import NumberField from "./NumberField";
import { haptic, pulseFeedback } from "@/lib/feedback";

function fmt(n: number) {
  return String(n);
}

function summarizeSets(sets: SetRecord[]) {
  return sets.map((s) => `${fmt(s.weight)}×${s.reps}`).join("  ");
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
  return `${fmt(set.weight)}kg × ${set.reps}`;
}

export default function ExerciseCard({
  date,
  exercise,
  sessionLastSet,
  templateId,
}: {
  date: string;
  exercise: Exercise;
  sessionLastSet?: SetRecord | null;
  templateId?: string;
}) {
  const { tr, locale } = useI18n();
  const { persona } = usePersona();
  const { addSet, updateSet, removeSet, removeExercise, lastSession } =
    useStore();
  const toast = useToast();
  const { mode } = useUIMode();
  const [open, setOpen] = useState(true);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const [commitIdx, setCommitIdx] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const lastRowRef = useRef<HTMLDivElement | null>(null);
  const justAdded = useRef(false);

  const prev = lastSession(exercise.id, date, templateId);
  // 取上次「最后一组有效数据」：跳过 0×0 的占位/跳过组，避免 USE LAST 给出 0kg×0 的垃圾值
  const prevLast = (() => {
    if (!prev || !prev.sets.length) return null;
    for (let i = prev.sets.length - 1; i >= 0; i--) {
      const s = prev.sets[i];
      if ((s.weight ?? 0) > 0 || (s.reps ?? 0) > 0) return s;
    }
    return null;
  })();
  const prevBest = prev ? bestSet(prev.sets) : null;

  // 最新一组的相对时间（仅当展开 + 有 at 戳）
  const lastSet = exercise.sets[exercise.sets.length - 1];
  const hasTimestamp = !!lastSet?.at;
  const now = useNow(open && hasTimestamp, 20_000);
  const lastSetRelative = lastSet?.at ? timeSince(lastSet.at, now, locale) : null;

  function commitEdit(idx: number) {
    setCommitIdx(idx);
    window.setTimeout(
      () => setCommitIdx((cur) => (cur === idx ? null : cur)),
      700
    );
  }

  // 新增后：滚动到最新组（在 DOM 提交后执行）
  useEffect(() => {
    if (justAdded.current) {
      justAdded.current = false;
      lastRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [exercise.sets.length]);

  function commitAdd(weight: number, reps: number) {
    const newIndex = exercise.sets.length;
    justAdded.current = true;
    addSet(date, exercise.id, { weight, reps });
    setFlashIdx(newIndex);
    if (weight > 0) {
      toast.show(
        isPersonaMode(mode)
          ? `${fmt(weight)} × ${reps}  ${persona.setComplete(mode)}`
          : `${fmt(weight)} × ${reps} ${persona.setComplete(mode)}`
      );
    } else {
      toast.show(persona.setAdded(mode));
    }
    if (mode === "pulse") pulseFeedback("confirm");
    else if (mode === "lite") haptic(12);
    window.setTimeout(
      () => setFlashIdx((cur) => (cur === newIndex ? null : cur)),
      1500
    );
  }

  // 这次"加一组"会自动填入的值：
  //   有当前会话的组 → 复制上一组（带着你今天的实际重量往下走）
  //   否则有自身历史 → 上次训练的最后一组（跨天"沿用上次"）
  //   否则 → 本次训练里你最近录的那一组（新动作不必从 0 开始）
  const carry: SetRecord | null =
    exercise.sets.length > 0
      ? exercise.sets[exercise.sets.length - 1]
      : prevLast ?? sessionLastSet ?? null;
  const carryFromLastSession = exercise.sets.length === 0 && !!prevLast;

  function handleAddSet() {
    if (carry) commitAdd(carry.weight, carry.reps);
    else commitAdd(0, 0);
  }

  return (
    <div className="control-card">
      {/* 头部：点击折叠/展开 */}
      <div className="flex items-center gap-2 px-3.5 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="press flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate text-[15px] font-semibold text-fg">
            {tr(exercise.name)}
          </span>
          {exercise.isMain && (
            <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              {tr("主")}
            </span>
          )}
          {exercise.planned && (
            <span className="tnum shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
              {tr("计划 {p}", {
                p: `${exercise.planned.sets}×${formatReps(exercise.planned.repsLow, exercise.planned.repsHigh)}`,
              })}
              {exercise.planned.rpe ? ` @${exercise.planned.rpe}` : ""}
            </span>
          )}
          {exercise.sets.length > 0 && (
            <span className="tnum shrink-0 text-[12px] text-faint">
              {tr("{n} 组", { n: exercise.sets.length })}
            </span>
          )}
        </button>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={tr("折叠")}
          className="press grid h-9 w-9 place-items-center text-faint"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            style={{
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform .15s",
            }}
          >
            <path
              d="M6 9L12 15L18 9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          onClick={() => {
            if (exercise.sets.length > 0) setConfirmDelete(true);
            else removeExercise(date, exercise.id);
          }}
          aria-label={tr("删除动作")}
          className="press grid h-9 w-9 place-items-center text-faint hover:text-accent"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6L18 18M6 18L18 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* 删除确认：有记录时不直接删 */}
      {confirmDelete && (
        <div className="animate-slidedown flex items-center gap-2 border-t border-accent/30 bg-accent-soft px-3.5 py-2.5">
          <span className="tnum flex-1 text-[13px] font-medium text-accent">
            {tr("删除「{name}」及 {n} 组记录？", { name: tr(exercise.name), n: exercise.sets.length })}
          </span>
          <button
            onClick={() => setConfirmDelete(false)}
            className="press h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-fg"
          >
            {tr("取消")}
          </button>
          <button
            onClick={() => removeExercise(date, exercise.id)}
            className="press h-9 rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-fg"
          >
            {tr("删除")}
          </button>
        </div>
      )}

      {/* 上次记录参考 */}
      <div className="soft-divider border-t px-3.5 py-1.5">
        {prev ? (
          <div className="space-y-1">
            <p className="tnum truncate text-[12px] text-muted">
              <span className="font-sans text-faint">{tr("上次 ")}</span>
              {formatCompact(prev.date, locale).md}
              <span className="font-sans text-faint"> · </span>
              {summarizeSets(prev.sets)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <span className="tnum rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                上次 {prev.sets.length} 组
              </span>
              {prevBest && (
                <span className="tnum rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  最佳 {formatSet(prevBest)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-faint">{tr("首次记录此动作")}</p>
        )}
      </div>

      {open && (
        <div className="animate-slidedown px-3.5 pb-3 pt-1">
          {exercise.sets.map((s, i) => (
            <div
              key={i}
              ref={i === exercise.sets.length - 1 ? lastRowRef : null}
              className={
                "set-row soft-divider flex items-center gap-2 rounded-lg border-t px-1.5 py-2 first:border-t-0 " +
                (flashIdx === i ? "flash-row" : "")
              }
            >
              <span className="tnum w-5 shrink-0 text-center text-[13px] text-faint">
                {i + 1}
              </span>
              <NumberField
                value={s.weight}
                onChange={(w) => updateSet(date, exercise.id, i, { ...s, weight: w })}
                onCommit={() => commitEdit(i)}
                ariaLabel={tr("第{n}组 重量", { n: i + 1 })}
                placeholder="0"
                allowDecimal
                className="number-cell tnum h-11 w-[72px] rounded-lg border border-border bg-surface-2 text-center text-[16px] font-medium text-fg outline-none focus:border-accent"
              />
              <span className="text-[12px] text-faint">kg</span>
              <span className="text-faint">×</span>
              <NumberField
                value={s.reps}
                onChange={(r) => updateSet(date, exercise.id, i, { ...s, reps: r })}
                onCommit={() => commitEdit(i)}
                ariaLabel={tr("第{n}组 次数", { n: i + 1 })}
                placeholder="0"
                allowDecimal={false}
                className="number-cell tnum h-11 w-[60px] rounded-lg border border-border bg-surface-2 text-center text-[16px] font-medium text-fg outline-none focus:border-accent"
              />
              <span className="text-[12px] text-faint">{tr("次")}</span>
              {/* 编辑提交的小 ✓（与"加组高亮"不重叠：刚加的组只闪 bg，不显示 ✓） */}
              {commitIdx === i && flashIdx !== i && (
                <span
                  className="edit-commit grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-fg"
                  aria-label={tr("已保存")}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 13L9 17L19 7"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
              {/* 最新一组旁的相对时间（仅最后一行 + 有时间戳） */}
              {i === exercise.sets.length - 1 && lastSetRelative && flashIdx !== i && commitIdx !== i && (
                <span className="tnum text-[11px] text-faint">
                  {lastSetRelative}
                </span>
              )}
              <button
                onClick={() => {
                  setFlashIdx((c) => (c === i ? null : c));
                  removeSet(date, exercise.id, i);
                }}
                aria-label={tr("删除该组")}
                className="press ml-auto grid h-10 w-10 place-items-center text-faint hover:text-accent"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12H19"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}

          {/* 添加区：统一一个按钮，每组都显式展示"将填入 Xkg × Y" */}
          <div className="mt-2 space-y-2">
            <button
              onClick={handleAddSet}
              className={
                "press flex h-12 w-full items-center justify-center gap-2 rounded-md text-[15px] font-semibold " +
                (carry
                  ? carryFromLastSession
                    ? "bg-accent text-accent-fg"
                    : "border border-border-strong bg-surface-2 text-fg active:bg-surface"
                  : "border border-dashed border-border-strong bg-surface text-muted active:bg-surface-2")
              }
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5V19M5 12H19"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
              {carry ? (
                <span className="tnum">
                  {carryFromLastSession ? persona.useLast(mode) : persona.addSet(mode)}
                  {" · "}
                  {formatSet(carry)}
                </span>
              ) : (
                persona.addSet(mode)
              )}
            </button>

            {carry && (
              <div className="grid grid-cols-2 gap-2">
                {exercise.sets.length > 0 ? (
                  <button
                    onClick={() => commitAdd(exercise.sets[exercise.sets.length - 1].weight, exercise.sets[exercise.sets.length - 1].reps)}
                    className="press h-9 rounded-md border border-border bg-surface-2 px-2 text-[12px] font-semibold text-fg active:bg-surface"
                  >
                    沿用上一组
                  </button>
                ) : (
                  <button
                    onClick={() => commitAdd(carry.weight, carry.reps)}
                    className="press h-9 rounded-md border border-border bg-surface-2 px-2 text-[12px] font-semibold text-fg active:bg-surface"
                  >
                    沿用参考
                  </button>
                )}
                <button
                  onClick={() => commitAdd(0, 0)}
                  className="press h-9 rounded-md text-[13px] font-medium text-muted active:bg-surface-2"
                >
                  {tr("空白组")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
