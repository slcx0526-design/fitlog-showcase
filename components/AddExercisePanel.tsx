"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExercisePreset, RecordMode, TrainingIntent, TrainingType } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_EXERCISES, presetForHistoricalExercise, searchExercisePreset } from "@/lib/exercises";
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
const FAVORITE_KEY = "fitlog:favoriteExercises";
type TrackChoice = "context" | TrainingIntent;
type RecordKind = "weightReps" | "reps" | "duration" | "distance";
const RECORD_MODES: Record<RecordKind, RecordMode[]> = { weightReps: ["weight", "reps"], reps: ["reps"], duration: ["duration"], distance: ["distance"] };

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
  const [newRecordKind, setNewRecordKind] = useState<RecordKind>("weightReps");
  const [editId, setEditId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | "">("");
  const [equipmentFilter, setEquipmentFilter] = useState<Equipment | "">("");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [trackChoice, setTrackChoice] = useState<TrackChoice>("context");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITE_KEY);
      if (raw) setFavoriteIds(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  function toggleFavorite(id: string) {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(FAVORITE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

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
  const activeSearch = query.trim() || muscleFilter || equipmentFilter;
  const filtered = useMemo(() => {
    const pool = [...presets, ...corePresets, ...customs];
    return pool
      .filter((preset) => searchExercisePreset(preset, query))
      .filter((preset) => !muscleFilter || preset.primaryMuscle === muscleFilter || preset.secondaryMuscles?.includes(muscleFilter))
      .filter((preset) => !equipmentFilter || preset.equipment === equipmentFilter)
      .sort((a, b) => Number(b.type !== "custom") - Number(a.type !== "custom") || Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)) || a.name.localeCompare(b.name));
  }, [corePresets, customs, equipmentFilter, favoriteIds, muscleFilter, presets, query]);

  // 上次同类型训练里实际做过的动作
  const lastSession = useMemo(
    () => lastWorkoutByType(type, date),
    [lastWorkoutByType, type, date]
  );
  const lastExercises = useMemo<ExercisePreset[]>(() => {
    if (!lastSession) return [];
    return lastSession.exercises.map((exercise) => presetForHistoricalExercise(exercise, type, customs));
  }, [customs, lastSession, type]);

  function addPreset(p: ExercisePreset) {
    addExercise(date, p, { intent: trackChoice });
  }

  function toggle(p: ExercisePreset) {
    if (addedIds.has(p.id)) {
      // 有已记录组的动作不在这里删 —— 避免静默丢记录，删除请用动作卡上的 ×
      if (lockedIds?.has(p.id)) return;
      removeExercise(date, p.id);
    } else {
      addPreset(p);
    }
  }

  function addAllFromLast() {
    if (!lastExercises.length) return;
    for (const p of lastExercises) {
      if (!addedIds.has(p.id)) addPreset(p);
    }
  }

  function createCustom() {
    const name = newName.trim();
    if (!name || !newMuscle) return;
    const preset = addCustomExercise(
      name,
      false,
      newMuscle,
      newEquip || undefined,
      RECORD_MODES[newRecordKind]
    );
    addPreset(preset);
    setNewName("");
    setNewMuscle("");
    setNewEquip("");
    setNewRecordKind("weightReps");
  }

  const allLastAdded =
    lastExercises.length > 0 && lastExercises.every((p) => addedIds.has(p.id));

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
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
          <div className="mb-3 space-y-2">
            <input
              value={query}
              aria-label={tr("搜索动作")}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("搜索动作 / 英文 / 别名")}
              className="number-cell h-10 w-full rounded-xl border border-border bg-surface px-3 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent"
            />
            <div className="grid grid-cols-2 gap-2">
              <select aria-label={tr("按肌群筛选")} value={muscleFilter} onChange={(event) => setMuscleFilter(event.target.value as MuscleGroup | "")} className="h-9 rounded-lg border border-border bg-surface px-2 text-[12px] text-muted outline-none focus:border-accent">
                <option value="">{tr("全部肌群")}</option>
                {MUSCLE_ORDER.map((m) => <option key={m} value={m}>{tr(MUSCLE_LABELS[m])}</option>)}
              </select>
              <select aria-label={tr("按器械筛选")} value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value as Equipment | "")} className="h-9 rounded-lg border border-border bg-surface px-2 text-[12px] text-muted outline-none focus:border-accent">
                <option value="">{tr("全部器械")}</option>
                {EQUIP_ORDER.map((eq) => <option key={eq} value={eq}>{tr(EQUIPMENT_LABELS[eq])}</option>)}
              </select>
            </div>
            <select
              value={trackChoice}
              onChange={(event) => setTrackChoice(event.target.value as TrackChoice)}
              className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-[12px] text-muted outline-none focus:border-accent"
              aria-label={tr("训练轨道")}
            >
              <option value="context">{tr("训练轨道：跟随本训练")}</option>
              <option value="strength">{tr("力量 · 4–6 次")}</option>
              <option value="hypertrophy">{tr("增肌 · 8–12 次")}</option>
              <option value="endurance">{tr("耐力 · 13–20 次")}</option>
              <option value="custom">{tr("自定义 · 10–15 次")}</option>
            </select>
          </div>

          {activeSearch && (
            <Chips
              label={tr("搜索结果")}
              items={filtered}
              addedIds={addedIds}
              lockedIds={lockedIds}
              favoriteIds={favoriteIds}
              onToggle={toggle}
              onFavorite={toggleFavorite}
              onEdit={(p) => isCustomExercise(p) && setEditId(p.id)}
            />
          )}

          {!activeSearch && favoriteIds.size > 0 && (
            <Chips
              label={tr("收藏")}
              items={[...presets, ...corePresets, ...customs].filter((p) => favoriteIds.has(p.id))}
              addedIds={addedIds}
              lockedIds={lockedIds}
              favoriteIds={favoriteIds}
              onToggle={toggle}
              onFavorite={toggleFavorite}
              onEdit={(p) => isCustomExercise(p) && setEditId(p.id)}
            />
          )}

          {/* 上次同类型训练 —— 一键全加 / 单独 toggle */}
          {!activeSearch && lastExercises.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wide text-accent">
                  {tr("上次")} · {formatCompact(lastSession!.date, locale).md}
                </p>
                {!allLastAdded && (
                  <button type="button"
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
                    <button type="button"
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

          {!activeSearch && presets.length > 0 && (
            <Chips
              label={
                tr(type === "push" ? "推" : type === "pull" ? "拉" : "腿")
              }
              items={presets}
              addedIds={addedIds}
              lockedIds={lockedIds}
              favoriteIds={favoriteIds}
              onToggle={toggle}
              onFavorite={toggleFavorite}
            />
          )}

          {!activeSearch && corePresets.length > 0 && (
            <Chips
              label={tr("其它")}
              items={corePresets}
              addedIds={addedIds}
              lockedIds={lockedIds}
              favoriteIds={favoriteIds}
              onToggle={toggle}
              onFavorite={toggleFavorite}
            />
          )}

          {!activeSearch && customs.length > 0 && (
            <Chips
              label={tr("自定义")}
              items={customs}
              addedIds={addedIds}
              lockedIds={lockedIds}
              favoriteIds={favoriteIds}
              onToggle={toggle}
              onFavorite={toggleFavorite}
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
              aria-label={tr("新建动作名称")}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createCustom()}
              placeholder={tr("新建动作名称…")}
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent"
            />
            <div className="flex min-w-0 gap-2">
              <select
                value={newMuscle}
                onChange={(e) => setNewMuscle(e.target.value as MuscleGroup | "")}
                className={
                  "h-10 min-w-0 flex-1 rounded-lg border bg-surface px-2 text-[14px] outline-none focus:border-accent " +
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
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-[14px] text-fg outline-none focus:border-accent"
                aria-label={tr("器械（选填）")}
              >
                <option value="">{tr("器械（选填）")}</option>
                {EQUIP_ORDER.map((eq) => (
                  <option key={eq} value={eq}>
                    {tr(EQUIPMENT_LABELS[eq])}
                  </option>
                ))}
              </select>
              <button type="button"
                onClick={createCustom}
                disabled={!newName.trim() || !newMuscle}
                className="press h-10 shrink-0 rounded-lg bg-fg px-4 text-[14px] font-medium text-bg disabled:opacity-30"
              >
                {tr("新建")}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label={tr("记录方式")}>
              {([
                ["weightReps", tr("重量次数")],
                ["reps", tr("仅次数")],
                ["duration", tr("时长")],
                ["distance", tr("距离")],
              ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setNewRecordKind(value)} aria-pressed={newRecordKind === value} className={"choice-chip press min-w-0 px-1 py-2 text-[10px] font-semibold " + (newRecordKind === value ? "bg-fg text-bg" : "text-muted")}>{label}</button>)}
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
  favoriteIds,
  onToggle,
  onFavorite,
  onEdit,
}: {
  label: string;
  items: ExercisePreset[];
  addedIds: Set<string>;
  lockedIds?: Set<string>;
  favoriteIds?: Set<string>;
  onToggle: (p: ExercisePreset) => void;
  onFavorite?: (id: string) => void;
  onEdit?: (p: ExercisePreset) => void;
}) {
  const { tr } = useI18n();
  const presetNameById = useMemo(
    () => new Map(DEFAULT_EXERCISES.map((preset) => [preset.id, preset.name])),
    []
  );
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
        {label}
      </p>
      <div className="grid gap-2">
        {items.map((p) => {
          const added = addedIds.has(p.id);
          const locked = added && !!lockedIds?.has(p.id);
          const editable = !!onEdit && isCustomExercise(p);
          const favorite = favoriteIds?.has(p.id) ?? false;
          const alternativeLabels = (p.alternatives ?? [])
            .map((id) => presetNameById.get(id))
            .filter(Boolean)
            .slice(0, 2);
          return (
            <div key={p.id} className="flex min-w-0 items-stretch">
            {onFavorite && (
              <button
                type="button"
                onClick={() => onFavorite(p.id)}
                aria-label={favorite ? tr("取消收藏") : tr("收藏动作")}
                className={"press grid w-9 shrink-0 place-items-center rounded-lg rounded-r-none border border-r-0 " + (favorite ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-faint")}
              >
                {favorite ? "★" : "☆"}
              </button>
            )}
            <button type="button"
              onClick={() => onToggle(p)}
              aria-disabled={locked}
              title={locked ? tr("已有记录，删除请到该动作卡片") : undefined}
              className={
                "choice-chip flex min-w-0 flex-1 items-center gap-2 border px-3 py-2 text-left text-[14px] " +
                (editable ? "rounded-r-none border-r-0 " : "") +
                (onFavorite ? "rounded-l-none " : "") +
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
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{tr(p.name)}</span>
                <span className="mt-0.5 block truncate text-[10px] font-normal text-faint">
                  {[
                    p.primaryMuscle ? tr(MUSCLE_LABELS[p.primaryMuscle]) : null,
                    ...(p.secondaryMuscles ?? []).slice(0, 2).map((m) => tr(MUSCLE_LABELS[m])),
                    p.equipment ? tr(EQUIPMENT_LABELS[p.equipment]) : null,
                  ].filter(Boolean).join(" · ")}
                </span>
                {alternativeLabels.length > 0 && (
                  <span className="mt-0.5 block truncate text-[10px] font-normal text-faint">
                    {tr("替代")}：{alternativeLabels.map((name) => tr(name!)).join(" / ")}
                  </span>
                )}
              </span>
            </button>
            {editable && (
              <button type="button"
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
