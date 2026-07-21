"use client";

import { useMemo, useState } from "react";
import { DEFAULT_EXERCISES } from "@/lib/exercises";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { exercisePrescription } from "@/lib/prescription";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { plannedWorkingSets } from "@/lib/trainingMetrics";
import type { Exercise, ExercisePreset, TrainingType } from "@/lib/types";

export default function SessionActionAdjuster({
  date,
  type,
  templateId,
  exercises,
}: {
  date: string;
  type: TrainingType | undefined;
  templateId: string | undefined;
  exercises: Exercise[];
}) {
  const { data, addExercise, removeExercise } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const pool = useMemo(() => [...DEFAULT_EXERCISES, ...data.customExercises], [data.customExercises]);
  const existingIds = useMemo(() => new Set(exercises.map((exercise) => exercise.id)), [exercises]);
  const template = useMemo(() => (data.templates ?? []).find((item) => item.id === templateId), [data.templates, templateId]);

  if (!template || !exercises.length || !type || type === "rest") return null;

  function skip(exercise: Exercise) {
    if (exercise.sets.length) return;
    removeExercise(date, exercise.id);
    setEditingId(null);
    toast.show(`已跳过 ${exercise.name}；模板未修改`);
  }

  function replace(source: Exercise, target: ExercisePreset) {
    if (source.sets.length || existingIds.has(target.id)) return;
    removeExercise(date, source.id);
    addExercise(date, target, { intent: exercisePrescription(source).trainingIntent });
    setEditingId(null);
    toast.show(`已用 ${target.name} 临时替换 ${source.name}`);
  }

  return (
    <section className="control-card mb-3 overflow-hidden">
      <button type="button" onClick={() => setOpen((value) => !value)} className="press flex w-full items-center justify-between px-3.5 py-3 text-left">
        <div><p className="text-[14px] font-semibold text-fg">本次动作调整</p><p className="mt-0.5 text-[11px] text-faint">器械被占、今天不想做，都只改今天，不改模板。</p></div>
        <span className="text-[18px] text-faint">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="soft-divider animate-slidedown space-y-2 border-t px-3.5 py-3">
        {exercises.map((exercise) => {
          const preset = pool.find((item) => item.id === exercise.id);
          const alternatives = getAlternatives(preset, pool, existingIds, type);
          const canEdit = exercise.sets.length === 0;
          const editing = editingId === exercise.id;
          return <div key={exercise.id} className="rounded-xl bg-surface-2 px-3 py-2.5">
            <div className="flex items-center gap-2"><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold text-fg">{exercise.name}</p><p className="mt-0.5 text-[10px] text-faint">计划 {plannedWorkingSets(exercise)} 组{preset?.primaryMuscle ? ` · ${MUSCLE_LABELS[preset.primaryMuscle]}` : ""}</p></div>{canEdit ? <div className="flex shrink-0 gap-1.5"><button type="button" onClick={() => setEditingId(editing ? null : exercise.id)} className="press rounded-lg bg-surface px-2 py-1.5 text-[11px] font-semibold text-accent">替换</button><button type="button" onClick={() => skip(exercise)} className="press rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] font-semibold text-muted">跳过</button></div> : <span className="shrink-0 text-[10px] font-semibold text-faint">已开始</span>}</div>
            {editing && <div className="soft-divider mt-2 border-t pt-2"><p className="text-[10px] text-faint">优先显示同动作模式或同肌群替代。替换后看上方“本次容量”决定是否补组。</p><div className="mt-2 flex flex-wrap gap-1.5">{alternatives.map((candidate) => <button key={candidate.id} type="button" onClick={() => replace(exercise, candidate)} className="choice-chip press rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] font-semibold text-fg">{candidate.name}</button>)}{alternatives.length === 0 && <p className="text-[11px] text-faint">没有可直接替代的动作，可在下方“添加动作”里选择。</p>}</div></div>}
          </div>;
        })}
        <p className="pt-1 text-[10px] leading-relaxed text-faint">已记录工作组的动作不能直接替换，避免历史记录被悄悄改写。需要调整时，保留它并在下方添加其他动作。</p>
      </div>}
    </section>
  );
}

function getAlternatives(source: ExercisePreset | undefined, pool: ExercisePreset[], existingIds: Set<string>, type: TrainingType) {
  if (!source) return [];
  const preferred = source.alternatives ?? [];
  const direct = preferred.map((id) => pool.find((item) => item.id === id)).filter((item): item is ExercisePreset => Boolean(item));
  const similar = pool.filter((item) => item.id !== source.id && !preferred.includes(item.id) && item.type === type && (item.movementPattern === source.movementPattern || (source.primaryMuscle && item.primaryMuscle === source.primaryMuscle)));
  return [...direct, ...similar].filter((item) => !existingIds.has(item.id)).slice(0, 6);
}
