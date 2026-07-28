import { DEFAULT_EXERCISES } from "./exercises";
import type { TemplatePlanChange, PlanAdaptationProposal } from "./planAdaptation";
import type { ScheduleAdaptationProposal } from "./scheduleAdaptation";
import { compileTrainingConstraints, exerciseConstraintViolations } from "./trainingConstraints";
import { policyRevision, type TrainingPolicy } from "./trainingPolicy";
import type { AppData, ExercisePreset, TemplateItem } from "./types";

export interface SafeAutomaticSelection {
  revision: string;
  templateChanges: TemplatePlanChange[];
  applySchedule: boolean;
  skippedReasons: string[];
}

type Preset = (typeof DEFAULT_EXERCISES)[number] | ExercisePreset;

function stableItem(item: TemplateItem) {
  return {
    exerciseId: item.exerciseId,
    sets: item.sets,
    repsLow: item.repsLow,
    repsHigh: item.repsHigh,
    rpe: item.rpe,
  };
}

function safeTemplateChange(
  data: AppData,
  policy: TrainingPolicy,
  date: string,
  change: TemplatePlanChange,
) {
  if (change.previousItems.length !== change.nextItems.length) {
    return { safe: false, reason: `${change.templateName}包含增删动作，必须确认` };
  }
  const constraints = compileTrainingConstraints(policy, date);
  const presets = new Map<string, Preset>([...DEFAULT_EXERCISES, ...data.customExercises].map((preset) => [preset.id, preset]));
  let changed = false;

  for (let index = 0; index < change.previousItems.length; index += 1) {
    const previous = change.previousItems[index];
    const next = change.nextItems[index];
    if (!previous || !next) return { safe: false, reason: `${change.templateName}结构不完整` };

    if (previous.exerciseId !== next.exerciseId) {
      changed = true;
      if (!policy.autoApply.exerciseReplacement) {
        return { safe: false, reason: `${change.templateName}需要替换动作，但未允许自动替换` };
      }
      const previousPreset = presets.get(previous.exerciseId) ?? {
        id: previous.exerciseId,
        name: previous.name,
        isMain: Boolean(previous.isMain),
        type: "custom" as const,
        equipment: previous.equipment,
        movementPattern: previous.movementPattern,
      };
      const nextPreset = presets.get(next.exerciseId) ?? {
        id: next.exerciseId,
        name: next.name,
        isMain: Boolean(next.isMain),
        type: "custom" as const,
        equipment: next.equipment,
        movementPattern: next.movementPattern,
      };
      if (!exerciseConstraintViolations(previousPreset, constraints).length) {
        return { safe: false, reason: `${change.templateName}的动作替换不是由硬约束触发` };
      }
      if (exerciseConstraintViolations(nextPreset, constraints).length) {
        return { safe: false, reason: `${change.templateName}的替代动作仍违反约束` };
      }
      if (
        previous.sets !== next.sets
        || previous.repsLow !== next.repsLow
        || previous.repsHigh !== next.repsHigh
      ) {
        return { safe: false, reason: `${change.templateName}同时替换动作并改变处方，必须确认` };
      }
      continue;
    }

    if (previous.sets !== next.sets) {
      changed = true;
      if (!policy.autoApply.setChanges || Math.abs(previous.sets - next.sets) > 1) {
        return { safe: false, reason: `${change.templateName}的组数变化超过安全自动范围` };
      }
    }
    if (previous.repsLow !== next.repsLow || previous.repsHigh !== next.repsHigh) {
      changed = true;
      if (
        !policy.autoApply.repChanges
        || Math.abs(previous.repsLow - next.repsLow) > 2
        || Math.abs(previous.repsHigh - next.repsHigh) > 2
      ) {
        return { safe: false, reason: `${change.templateName}的次数范围变化必须确认` };
      }
    }

    const previousStable = stableItem(previous);
    const nextStable = stableItem(next);
    if (!changed && JSON.stringify(previousStable) !== JSON.stringify(nextStable)) changed = true;
  }

  return changed
    ? { safe: true as const }
    : { safe: false as const, reason: `${change.templateName}没有需要自动应用的安全变化` };
}

function automaticRevision(
  policy: TrainingPolicy,
  templateProposal: PlanAdaptationProposal,
  scheduleProposal: ScheduleAdaptationProposal,
) {
  const source = `${policyRevision(policy)}:${templateProposal.sourceRevision}:${scheduleProposal.sourceRevision}`;
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) + hash) ^ source.charCodeAt(index);
  }
  return `auto-${(hash >>> 0).toString(36)}`;
}

export function selectSafeAutomaticChanges(
  data: AppData,
  policy: TrainingPolicy,
  date: string,
  templateProposal: PlanAdaptationProposal,
  scheduleProposal: ScheduleAdaptationProposal,
): SafeAutomaticSelection {
  const skippedReasons: string[] = [];
  const templateChanges = templateProposal.changes.filter((change) => {
    const result = safeTemplateChange(data, policy, date, change);
    if (!result.safe && result.reason) skippedReasons.push(result.reason);
    return result.safe;
  });

  let applySchedule = false;
  if (scheduleProposal.changed) {
    const dayDelta = Math.abs(scheduleProposal.trainingDaysAfter - scheduleProposal.trainingDaysBefore);
    if (!policy.autoApply.scheduleChanges) {
      skippedReasons.push("训练频率发生变化，但未允许自动调整日程");
    } else if (scheduleProposal.trainingDaysAfter > scheduleProposal.trainingDaysBefore) {
      skippedReasons.push("增加训练天数必须人工确认");
    } else if (scheduleProposal.evidenceAdjusted && policy.evidenceMode !== "automatic") {
      skippedReasons.push("动态证据只处于预览模式，不能自动减少训练频率");
    } else if (scheduleProposal.trainingDaysAfter !== scheduleProposal.targetTrainingDays) {
      skippedReasons.push("重排结果未达到当前有效目标训练天数");
    } else if (scheduleProposal.evidenceAdjusted && dayDelta > 1) {
      skippedReasons.push("证据驱动的训练天数变化超过 1 天，必须人工确认");
    } else if (!scheduleProposal.evidenceAdjusted && dayDelta > 2) {
      skippedReasons.push("训练天数变化超过 2 天，必须人工确认");
    } else {
      applySchedule = true;
    }
  }

  return {
    revision: automaticRevision(policy, templateProposal, scheduleProposal),
    templateChanges,
    applySchedule,
    skippedReasons: [...new Set(skippedReasons)],
  };
}
