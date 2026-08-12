import {
  generatedTrackWorkingSets,
  isGeneratedSharedTrackId,
  isGeneratedTemplateScopedTrackId,
  normalizeTemplateItemPrescription,
  prescriptionFromTemplateItem,
  retargetTemplateScopedTrackId,
} from "./prescription";
import type { ExercisePreset, RecordMode, Template, TrainingType } from "./types";

// ============================================================
// 训练模板（B 层）：自由命名 + 归属类型（推/拉/腿）的模板列表。
// 每个类型下最多 5 个模板。套用时按当天训练类型筛选。
// ============================================================

/** 可建模板的训练类型（不含 rest/custom） */
export const TEMPLATE_TYPES: TrainingType[] = ["push", "pull", "legs"];

/** 每个类型下模板数量上限 */
export const MAX_TEMPLATES_PER_TYPE = 5;

/** 类型标签（中文 key，渲染处经 tr 本地化） */
export const TYPE_LABEL: Record<"push" | "pull" | "legs", string> = {
  push: "推",
  pull: "拉",
  legs: "腿",
};

// ---- 次数区间档位 ----
/** 起始次数可选 5–12 */
export const REPS_LOW_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12];
/** 力竭次数可选 6–20 */
export const REPS_HIGH_OPTIONS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20];

/** 次数区间显示：相等显示单值，否则 low–high */
export function formatReps(low: number, high: number): string {
  return low === high ? `${low}` : `${low}–${high}`;
}

/** Reorder only among templates of the same type, even when storage order is interleaved. */
export function moveTemplateWithinType(list: Template[], id: string, direction: -1 | 1): Template[] {
  const sourceIndex = list.findIndex((template) => template.id === id);
  if (sourceIndex < 0) return list;
  const typeIndexes = list.flatMap((template, index) => template.type === list[sourceIndex].type ? [index] : []);
  const typePosition = typeIndexes.indexOf(sourceIndex);
  const targetIndex = typeIndexes[typePosition + direction];
  if (targetIndex == null) return list;
  const next = [...list];
  [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
  return next;
}

const DELOAD_TRACK_SUFFIX = ":deload";

/** Library templates are reusable build prescriptions; active and historical snapshots stay immutable. */
export function canonicalizeLibraryTemplate(template: Template): Template {
  let changed = false;
  const items = template.items.map((item) => {
    const current = prescriptionFromTemplateItem(item);
    const wasDeload = current.progressionTrackId.endsWith(DELOAD_TRACK_SUFFIX);
    const baseTrackId = wasDeload
      ? current.progressionTrackId.slice(0, -DELOAD_TRACK_SUFFIX.length)
      : current.progressionTrackId;
    const generated = isGeneratedSharedTrackId(
      baseTrackId,
      item.exerciseId,
      current.trainingIntent,
      current.targetRepMin,
      current.targetRepMax,
      current.performanceMode,
    ) || isGeneratedTemplateScopedTrackId(
      baseTrackId,
      item.exerciseId,
      current.trainingIntent,
      current.targetRepMin,
      current.targetRepMax,
      current.performanceMode,
    );
    const restoredSets = wasDeload && generated
      ? generatedTrackWorkingSets(baseTrackId, item.exerciseId) ?? item.sets
      : item.sets;
    const progressionTrackId = retargetTemplateScopedTrackId(
      baseTrackId,
      item.exerciseId,
      current.trainingIntent,
      current.targetRepMin,
      current.targetRepMax,
      template.id,
      current.performanceMode,
    );
    const progressionTrackLabel = wasDeload
      ? current.progressionTrackLabel.replace(/^(?:恢复|Recovery|回復)\s*·\s*/i, "")
      : current.progressionTrackLabel;
    const progressionRule = wasDeload && generated && current.progressionRule === "custom"
      ? "doubleProgression"
      : current.progressionRule;

    if (
      progressionTrackId === current.progressionTrackId
      && progressionTrackLabel === current.progressionTrackLabel
      && progressionRule === current.progressionRule
      && restoredSets === item.sets
    ) return item;

    changed = true;
    return normalizeTemplateItemPrescription({
      ...item,
      sets: restoredSets,
      progressionTrackId: undefined,
      progressionTrackLabel: undefined,
      progressionRule: undefined,
      prescription: {
        ...current,
        progressionTrackId,
        progressionTrackLabel,
        progressionRule,
        workingSets: restoredSets,
      },
    });
  });
  return changed ? { ...template, items } : template;
}

const recordModesEqual = (left: RecordMode[] | undefined, right: RecordMode[] | undefined) => (
  JSON.stringify(left ?? ["weight", "reps"]) === JSON.stringify(right ?? ["weight", "reps"])
);

/** Keep future template snapshots aligned when a custom library entry is edited. */
export function updateCustomExerciseTemplateReferences(
  templates: Template[] | undefined,
  preset: ExercisePreset,
): Template[] | undefined {
  if (!templates) return templates;
  let changed = false;
  const next = templates.map((template) => {
    let itemsChanged = false;
    const items = template.items.map((item) => {
      if (item.exerciseId !== preset.id) return item;
      itemsChanged = true;
      changed = true;
      const modeChanged = !recordModesEqual(item.recordModes, preset.recordModes);
      const mode = preset.recordModes?.includes("duration")
        ? "duration"
        : preset.recordModes?.includes("distance")
          ? "distance"
          : "reps";
      return normalizeTemplateItemPrescription({
        ...item,
        name: preset.name,
        isMain: preset.isMain,
        primaryMuscle: preset.primaryMuscle,
        secondaryMuscles: preset.secondaryMuscles,
        volumeContributions: preset.volumeContributions,
        equipment: preset.equipment,
        movementPattern: preset.movementPattern,
        alternatives: preset.alternatives,
        recordModes: preset.recordModes,
        ...(modeChanged ? {
          repsLow: mode === "duration" ? 30 : mode === "distance" ? 20 : 8,
          repsHigh: mode === "duration" ? 60 : mode === "distance" ? 50 : 12,
          prescription: undefined,
          progressionTrackId: undefined,
          progressionTrackLabel: undefined,
        } : {}),
      }, preset);
    });
    return itemsChanged ? { ...template, items } : template;
  });
  return changed ? next : templates;
}
