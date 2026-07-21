"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";
import {
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  MUSCLE_ORDER,
  type Equipment,
  type MuscleGroup,
} from "@/lib/muscles";
import type { ExercisePreset, RecordMode, VolumeContribution } from "@/lib/types";

const EQUIP_ORDER: Equipment[] = ["machine", "cable", "free", "bodyweight"];
const CONTRIBUTION_WEIGHTS = [0.25, 0.5, 0.75, 1] as const;
type RecordKind = "weightReps" | "reps" | "duration" | "distance";

function recordKindFor(preset: ExercisePreset): RecordKind {
  if (preset.recordModes?.includes("duration")) return "duration";
  if (preset.recordModes?.includes("distance")) return "distance";
  if (preset.recordModes && !preset.recordModes.includes("weight")) return "reps";
  return "weightReps";
}

function modesFor(kind: RecordKind): RecordMode[] {
  if (kind === "duration") return ["duration"];
  if (kind === "distance") return ["distance"];
  if (kind === "reps") return ["reps"];
  return ["weight", "reps"];
}

/** 判断是否为自定义动作（可编辑/删除） */
export function isCustomExercise(p: ExercisePreset): boolean {
  return p.custom === true || p.id.startsWith("cx_");
}

/**
 * 自定义动作编辑器（设置页 / 模板页 / 训练页共用）。
 * 改名 / 改部位 / 改器械；删除。只影响以后，不回溯历史。
 */
export default function CustomExerciseEditor({
  preset,
  onClose,
}: {
  preset: ExercisePreset;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const { updateCustomExercise, removeCustomExercise } = useStore();
  const toast = useToast();

  const [name, setName] = useState(preset.name);
  const [muscle, setMuscle] = useState<MuscleGroup | "">(
    preset.primaryMuscle ?? ""
  );
  const [equip, setEquip] = useState<Equipment | "">(preset.equipment ?? "");
  const [recordKind, setRecordKind] = useState<RecordKind>(() => recordKindFor(preset));
  const [contributions, setContributions] = useState<VolumeContribution[]>(() => {
    const configured = preset.volumeContributions?.filter((item) => item.muscle !== preset.primaryMuscle) ?? [];
    if (configured.length) return configured;
    return (preset.secondaryMuscles ?? []).filter((item) => item !== preset.primaryMuscle).map((item) => ({ muscle: item, weight: 0.5, direct: false }));
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  function save() {
    const n = name.trim();
    if (!n || !muscle) return;
    const muscleChanged = muscle !== preset.primaryMuscle;
    updateCustomExercise(preset.id, {
      name: n,
      primaryMuscle: muscle,
      secondaryMuscles: contributions.filter((item) => item.muscle !== muscle).map((item) => item.muscle),
      volumeContributions: contributions.filter((item) => item.muscle !== muscle),
      equipment: equip || undefined,
      recordModes: modesFor(recordKind),
    });
    if (muscleChanged) {
      toast.show(tr("已移到 {m}", { m: tr(MUSCLE_LABELS[muscle]) }));
    } else {
      toast.show(tr("已保存"));
    }
    onClose();
  }

  function del() {
    removeCustomExercise(preset.id);
    toast.show(tr("已删除"));
    onClose();
  }

  return (
    <div className="space-y-2 rounded-md border border-accent/40 bg-surface-2 p-2.5">
      <input
        value={name}
        aria-label={tr("动作名称")}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder={tr("动作名称…")}
        className="h-10 w-full rounded-md border border-border bg-surface px-3 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent"
      />
      <div className="flex gap-2">
        <select
          value={muscle}
          onChange={(e) => {
            const next = e.target.value as MuscleGroup | "";
            setMuscle(next);
            if (next) setContributions((items) => items.filter((item) => item.muscle !== next));
          }}
          className={
            "h-10 flex-1 rounded-md border bg-surface px-2 text-[14px] outline-none focus:border-accent " +
            (muscle ? "border-border text-fg" : "border-warn/50 text-faint")
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
          value={equip}
          onChange={(e) => setEquip(e.target.value as Equipment | "")}
          className="h-10 flex-1 rounded-md border border-border bg-surface px-2 text-[14px] text-fg outline-none focus:border-accent"
          aria-label={tr("器械（选填）")}
        >
          <option value="">{tr("器械（选填）")}</option>
          {EQUIP_ORDER.map((eq) => (
            <option key={eq} value={eq}>
              {tr(EQUIPMENT_LABELS[eq])}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-md bg-surface p-1" role="group" aria-label={tr("记录方式")}>
        {([
          ["weightReps", tr("重量次数")],
          ["reps", tr("仅次数")],
          ["duration", tr("时长")],
          ["distance", tr("距离")],
        ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setRecordKind(value)} aria-pressed={recordKind === value} className={"choice-chip press min-w-0 px-1 py-2 text-[10px] font-semibold " + (recordKind === value ? "bg-fg text-bg" : "text-muted")}>{label}</button>)}
      </div>

      {muscle && <div className="rounded-md border border-border bg-surface p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold text-fg">容量贡献</p>
          <span className="text-[10px] text-faint">每个有效工作组</span>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-md bg-surface-2 px-2 py-2 text-[11px]">
          <span className="min-w-0 flex-1 truncate font-medium text-fg">{tr(MUSCLE_LABELS[muscle])}</span>
          <span className="tnum text-muted">1.0</span>
          <span className="rounded bg-accent-soft px-1.5 py-0.5 font-semibold text-accent">直接</span>
        </div>

        <div className="mt-1.5 space-y-1.5">
          {contributions.filter((item) => item.muscle !== muscle).map((item) => (
            <div key={item.muscle} className="flex min-w-0 items-center gap-1.5 rounded-md bg-surface-2 p-1.5">
              <span className="min-w-0 flex-1 truncate pl-1 text-[11px] font-medium text-fg">{tr(MUSCLE_LABELS[item.muscle])}</span>
              <select
                value={item.weight}
                onChange={(event) => setContributions((items) => items.map((candidate) => candidate.muscle === item.muscle ? { ...candidate, weight: Number(event.target.value) } : candidate))}
                aria-label={`${tr(MUSCLE_LABELS[item.muscle])}贡献权重`}
                className="h-8 w-[58px] rounded-md border border-border bg-surface px-1 text-[11px] text-fg outline-none focus:border-accent"
              >
                {CONTRIBUTION_WEIGHTS.map((weight) => <option key={weight} value={weight}>{weight.toFixed(2).replace(/0$/, "")}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setContributions((items) => items.map((candidate) => candidate.muscle === item.muscle ? { ...candidate, direct: !candidate.direct } : candidate))}
                aria-label={`${tr(MUSCLE_LABELS[item.muscle])}切换直接或连带贡献`}
                className={"press h-8 w-12 shrink-0 rounded-md text-[10px] font-semibold " + (item.direct ? "bg-accent-soft text-accent" : "bg-surface text-muted")}
              >
                {item.direct ? "直接" : "连带"}
              </button>
              <button type="button" onClick={() => setContributions((items) => items.filter((candidate) => candidate.muscle !== item.muscle))} aria-label={`删除${tr(MUSCLE_LABELS[item.muscle])}贡献`} className="press h-8 w-8 shrink-0 rounded-md text-[15px] text-faint">×</button>
            </div>
          ))}
        </div>

        <select
          value=""
          onChange={(event) => {
            const next = event.target.value as MuscleGroup;
            if (next) setContributions((items) => [...items, { muscle: next, weight: 0.5, direct: false }]);
          }}
          aria-label="添加容量贡献肌群"
          className="mt-2 h-9 w-full rounded-md border border-dashed border-border bg-surface px-2 text-[12px] text-muted outline-none focus:border-accent"
        >
          <option value="">添加次级肌群…</option>
          {MUSCLE_ORDER.filter((item) => item !== muscle && !contributions.some((candidate) => candidate.muscle === item)).map((item) => <option key={item} value={item}>{tr(MUSCLE_LABELS[item])}</option>)}
        </select>
        <p className="mt-2 text-[10px] leading-relaxed text-faint">直接贡献进入该肌群目标；连带贡献只用于总刺激和恢复判断。</p>
      </div>}

      <div className="flex items-center gap-2">
        {confirmDelete ? (
          <button
            type="button"
            onClick={del}
            className="press h-9 rounded-md border border-warn/60 bg-warn/10 px-3 text-[13px] font-semibold text-warn"
          >
            {tr("确认删除")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="press h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-muted"
          >
            {tr("删除")}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="press ml-auto h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-fg"
        >
          {tr("取消")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim() || !muscle}
          className="press h-9 rounded-md bg-fg px-4 text-[13px] font-medium text-bg disabled:opacity-30"
        >
          {tr("保存")}
        </button>
      </div>

      {confirmDelete && (
        <p className="text-[11px] leading-relaxed text-faint">
          {tr("删除后历史记录仍保留，模板里若引用会保留名字但不再按部位归类。")}
        </p>
      )}
    </div>
  );
}
