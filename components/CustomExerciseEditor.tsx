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
import type { ExercisePreset } from "@/lib/types";

const EQUIP_ORDER: Equipment[] = ["machine", "cable", "free", "bodyweight"];

/** 判断是否为自定义动作（可编辑/删除） */
export function isCustomExercise(p: ExercisePreset): boolean {
  return p.id.startsWith("cx_");
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  function save() {
    const n = name.trim();
    if (!n || !muscle) return;
    const muscleChanged = muscle !== preset.primaryMuscle;
    updateCustomExercise(preset.id, {
      name: n,
      primaryMuscle: muscle,
      equipment: equip || undefined,
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
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder={tr("动作名称…")}
        className="h-10 w-full rounded-md border border-border bg-surface px-3 text-[15px] text-fg outline-none placeholder:text-faint focus:border-accent"
      />
      <div className="flex gap-2">
        <select
          value={muscle}
          onChange={(e) => setMuscle(e.target.value as MuscleGroup | "")}
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

      <div className="flex items-center gap-2">
        {confirmDelete ? (
          <button
            onClick={del}
            className="press h-9 rounded-md border border-warn/60 bg-warn/10 px-3 text-[13px] font-semibold text-warn"
          >
            {tr("确认删除")}
          </button>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="press h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-muted"
          >
            {tr("删除")}
          </button>
        )}
        <button
          onClick={onClose}
          className="press ml-auto h-9 rounded-md border border-border bg-surface px-3 text-[13px] text-fg"
        >
          {tr("取消")}
        </button>
        <button
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
