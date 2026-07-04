"use client";

import { useMemo, useState } from "react";
import type { ExercisePreset, TrainingType } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_EXERCISES } from "@/lib/exercises";
import {
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  MUSCLE_ORDER,
  type Equipment,
  type MuscleGroup,
} from "@/lib/muscles";
import { formatCompact } from "@/lib/date";
import CustomExerciseEditor, { isCustomExercise } from "./CustomExerciseEditor";

const EQUIP_ORDER: Equipment[] = ["machine", "cable", "free", "bodyweight"];

export default function AddExercisePanel({
  date,
  type,
  addedIds,
  lockedIds,
}: {
  date: string;
  type: TrainingType;
  addedIds: Set<string>;
  lockedIds?: Set<string>;
}) {
  const { tr, locale } = useI18n();
  const {
    addExercise,
    removeExercise,
    addCustomExercise,
    data,
    lastWorkoutByType,
  } = useStore();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMuscle, setNewMuscle] = useState<MuscleGroup | "">("");
  const [newEquip, setNewEquip] = useState<Equipment | "">("");
  const [editId, setEditId] = useState<string | null>(null);

  const presets = useMemo(
    () => DEFAULT_EXERCISES.filter((e) => e.type === type && e.primaryMuscle !== "abs"),
    [type]
  );
  // 非 PPL 日的内置动作（腹肌 / 颈部等）：任何训练日都常驻显示
  const corePresets = useMemo(
    () => DEFAULT_EXERCISES.filter((e) => e.type === "custom"),
    []
  );
  const customs = data.customExercises;

  // 上次同类型训练里实际做过的动作
  const lastSession = useMemo(
    () => lastWorkoutByType(type, date),
    [lastWorkoutByType, type, date]
  );
  const lastExercises = useMemo<ExercisePreset[]>(() => {
    if (!lastSession) return [];
    return lastSession.exercises.map((e) => ({
      id: e.id,
      name: e.name,
      isMain: e.isMain,
      type,
    }));
  }, [lastSession, type]);

  function toggle(p: ExercisePreset) {
    if (addedIds.has(p.id)) {
      // 有已记录组的动作不在这里删 —— 避免静默丢记录，删除请用动作卡上的 ×
      if (lockedIds?.has(p.id)) return;
      removeExercise(date, p.id);
    } else {
      addExercise(date, p);
    }
  }

  function addAllFromLast() {
    if (!lastExercises.length) return;
    for (const p of lastExercises) {
      if (!addedIds.has(p.id)) addExercise(date, p);
    }
  }

  function createCustom() {
    const name = newName.trim();
    if (!name || !newMuscle) return;
    const preset = addCustomExercise(
      name,
      false,
      newMuscle,
      newEquip || undefined
    );
    addExercise(date, preset);
    setNewName("");
    setNewMuscle("");
    setNewEquip("");
  }

  const allLastAdded =
    lastExercises.length > 0 && lastExercises.every((p) => addedIds.has(p.id));

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="press flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong bg-surface text-[14px] font-medium text-muted active:bg-surface-2"
      >
        {open ? (
          tr("收起")
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 5V19M5 12H19"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            {tr("添加动作")}
          </>
        )}
      </button>

      {open && (
        <div className="control-strip animate-slidedown mt-2 rounded-2xl p-3">
          {/* 上次同类型训练 —— 一键全加 / 单独 toggle */}
          {lastExercises.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wide text-accent">
                  {tr("上次")} · {formatCompact(lastSession!.date, locale).md}
                </p>
                {!allLastAdded && (
                  <button
                    onClick={addAllFromLast}
                    className="press text-[11px] font-semibold text-accent"
                  >
                    {tr("+ 全部加入")}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {lastExercises.map((p) => {
                  const added = addedIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggle(p)}
                      className={
                        "choice-chip press flex items-center gap-1 border px-3 py-2 text-[14px] " +
                        (added
                          ? "border-accent bg-accent-soft font-medium text-accent"
                          : "border-accent/40 bg-surface text-fg")
                      }
                    >
                      {added && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M5 13L9 17L19 7"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      {tr(p.name)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {presets.length > 0 && (
            <Chips
              label={
                tr(type === "push" ? "推" : type === "pull" ? "拉" : "腿")
              }
              items={presets}
              addedIds={addedIds}
              lockedIds={lockedIds}
              onToggle={toggle}
            />
          )}

          {corePresets.length > 0 && (
            <Chips
              label={tr("其它")}
              items={corePresets}
              addedIds={addedIds}
              lockedIds={lockedIds}
              onToggle={toggle}
            />
          )}

          {customs.length > 0 && (
            <Chips
              label={tr("自定义")}
              items={customs}
              addedIds={addedIds}
              lockedIds={lockedIds}
              onToggle={toggle}
              onEdit={(p) => setEditId(p.id)}
            />
          )}

          {editId && customs.find((c) => c.id === editId) && (
            <div className="mb-3">
              <CustomExerciseEditor
                preset={customs.find((c) => c.id === editId)!}
                onClose={() => setEditId(null)}
              />
            </div>
          )}

          {/* 新建自定义动作：必选部位 + 选填器械，建完即带标签进入体系 */}
          <div className="mt-1 space-y-2 rounded-xl border border-dashed border-border-strong bg-surface/60 p-2.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createCustom()}
              placeholder={tr("新建动作名称…")}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent"
            />
            <div className="flex gap-2">
              <select
                value={newMuscle}
                onChange={(e) => setNewMuscle(e.target.value as MuscleGroup | "")}
                className={
                  "h-10 flex-1 rounded-lg border bg-surface px-2 text-[14px] outline-none focus:border-accent " +
                  (newMuscle ? "border-border text-fg" : "border-warn/50 text-faint")
                }
                aria-label={tr("选部位")}
              >
                <option value="">{tr("选部位")}</option>
                {MUSCLE_ORDER.map((m) => (
                  <option key={m} value={m}>
                    {tr(MUSCLE_LABELS[m])}
                  </option>
                ))}
              </select>
              <select
                value={newEquip}
                onChange={(e) => setNewEquip(e.target.value as Equipment | "")}
                className="h-10 flex-1 rounded-lg border border-border bg-surface px-2 text-[14px] text-fg outline-none focus:border-accent"
                aria-label={tr("器械（选填）")}
              >
                <option value="">{tr("器械（选填）")}</option>
                {EQUIP_ORDER.map((eq) => (
                  <option key={eq} value={eq}>
                    {tr(EQUIPMENT_LABELS[eq])}
                  </option>
                ))}
              </select>
              <button
                onClick={createCustom}
                disabled={!newName.trim() || !newMuscle}
                className="press h-10 shrink-0 rounded-lg bg-fg px-4 text-[14px] font-medium text-bg disabled:opacity-30"
              >
                {tr("新建")}
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-faint">
              {tr("选好部位，这个动作才会计入容量统计、并能按部位找到")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Chips({
  label,
  items,
  addedIds,
  lockedIds,
  onToggle,
  onEdit,
}: {
  label: string;
  items: ExercisePreset[];
  addedIds: Set<string>;
  lockedIds?: Set<string>;
  onToggle: (p: ExercisePreset) => void;
  onEdit?: (p: ExercisePreset) => void;
}) {
  const { tr } = useI18n();
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((p) => {
          const added = addedIds.has(p.id);
          const locked = added && !!lockedIds?.has(p.id);
          const editable = !!onEdit && isCustomExercise(p);
          return (
            <span key={p.id} className="inline-flex items-stretch">
            <button
              onClick={() => onToggle(p)}
              aria-disabled={locked}
              title={locked ? tr("已有记录，删除请到该动作卡片") : undefined}
              className={
                "choice-chip flex items-center gap-1 border px-3 py-2 text-[14px] " +
                (editable ? "rounded-r-none border-r-0 " : "") +
                (locked
                  ? "cursor-default border-accent/50 bg-accent-soft font-medium text-accent/70"
                  : added
                  ? "press border-accent bg-accent-soft font-medium text-accent"
                  : "press border-border bg-surface text-fg")
              }
            >
              {locked ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="5"
                    y="11"
                    width="14"
                    height="9"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M8 11V8a4 4 0 0 1 8 0v3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                added && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 13L9 17L19 7"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )
              )}
              {tr(p.name)}
            </button>
            {editable && (
              <button
                onClick={() => onEdit!(p)}
                aria-label={tr("编辑")}
                className="press grid w-9 place-items-center rounded-lg rounded-l-none border border-border bg-surface text-faint"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M14 6L18 10M4 20L4.5 16.5L15 6L18 9L7.5 19.5L4 20Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
