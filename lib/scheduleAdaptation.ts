import { DEFAULT_EXERCISES } from "./exercises";
import type { MuscleGroup } from "./muscles";
import { compileTrainingConstraints, exerciseConstraintViolations, exercisePreferenceScore } from "./trainingConstraints";
import { policyRevision, type MusclePriority, type TrainingPolicy } from "./trainingPolicy";
import type { AppData, MicrocycleStep, Schedule, Template, TemplateItem, TrainingType } from "./types";

const TRAINING_TYPES = ["push", "pull", "legs"] as const;
type PlannedTrainingType = (typeof TRAINING_TYPES)[number];
type Preset = (typeof DEFAULT_EXERCISES)[number] | AppData["customExercises"][number];

export interface ScheduleFrequencyChange {
  type: PlannedTrainingType;
  before: number;
  after: number;
}

export interface ScheduleAdaptationProposal {
  id: string;
  sourceRevision: string;
  changed: boolean;
  previousSchedule: Schedule;
  nextSchedule: Schedule;
  reasons: string[];
  warnings: string[];
  trainingDaysBefore: number;
  trainingDaysAfter: number;
  frequencyChanges: ScheduleFrequencyChange[];
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function cloneSchedule(schedule: Schedule): Schedule {
  return {
    split: [...schedule.split],
    ...(schedule.microcycle ? {
      microcycle: schedule.microcycle.map((step) => {
        const { templateSnapshot: _snapshot, ...portable } = step;
        return { ...portable };
      }),
    } : {}),
  };
}

function canonicalSchedule(schedule: Schedule) {
  return {
    split: schedule.split,
    microcycle: schedule.microcycle?.map((step) => ({
      type: step.type,
      label: step.label,
      templateId: step.templateId,
    })) ?? [],
  };
}

function priorityWeight(priority: MusclePriority | undefined) {
  if (priority === "specialize") return 12;
  if (priority === "grow") return 5;
  if (priority === "maintain") return -2;
  if (priority === "deprioritize") return -7;
  return 0;
}

function directMuscles(item: TemplateItem, preset?: Preset) {
  const contributions = item.volumeContributions?.length
    ? item.volumeContributions
    : preset?.volumeContributions;
  if (contributions?.length) return contributions.filter((entry) => entry.direct).map((entry) => entry.muscle);
  const primary = item.primaryMuscle ?? preset?.primaryMuscle;
  return primary ? [primary] : [];
}

function templatePriorityScore(
  template: Template,
  policy: TrainingPolicy,
  constraints: ReturnType<typeof compileTrainingConstraints>,
  presets: Map<string, Preset>,
) {
  if (!template.items.length) return -1_000;
  let score = 0;
  for (const item of template.items) {
    const preset = presets.get(item.exerciseId);
    score += exercisePreferenceScore(preset ?? { id: item.exerciseId }, constraints);
    const violations = exerciseConstraintViolations(preset ?? {
      id: item.exerciseId,
      equipment: item.equipment,
      movementPattern: item.movementPattern,
    }, constraints);
    score -= violations.length * 8;
    for (const muscle of directMuscles(item, preset)) {
      score += priorityWeight(policy.musclePriorities[muscle]) * Math.min(4, item.sets);
    }
  }
  return score / Math.max(1, template.items.length);
}

function existingTemplateOrder(data: AppData, type: PlannedTrainingType) {
  const ordered = data.schedule.microcycle
    ?.filter((step) => step.type === type && step.templateId)
    .map((step) => step.templateId as string) ?? [];
  return new Map(ordered.map((id, index) => [id, index]));
}

function templatePool(
  data: AppData,
  policy: TrainingPolicy,
  constraints: ReturnType<typeof compileTrainingConstraints>,
) {
  const presets = new Map<string, Preset>([...DEFAULT_EXERCISES, ...data.customExercises].map((preset) => [preset.id, preset]));
  const byType = new Map<PlannedTrainingType, Template[]>();
  for (const type of TRAINING_TYPES) {
    const order = existingTemplateOrder(data, type);
    const templates = (data.templates ?? [])
      .filter((template): template is Template & { type: PlannedTrainingType } => template.type === type && template.items.length > 0)
      .sort((left, right) => {
        const leftOrder = order.get(left.id) ?? 999;
        const rightOrder = order.get(right.id) ?? 999;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return templatePriorityScore(right, policy, constraints, presets)
          - templatePriorityScore(left, policy, constraints, presets)
          || left.name.localeCompare(right.name);
      });
    byType.set(type, templates);
  }
  return { byType, presets };
}

function typeScore(
  type: PlannedTrainingType,
  templates: Template[],
  policy: TrainingPolicy,
  constraints: ReturnType<typeof compileTrainingConstraints>,
  presets: Map<string, Preset>,
) {
  const bestTemplate = templates[0];
  if (!bestTemplate) return -1_000;
  return templatePriorityScore(bestTemplate, policy, constraints, presets)
    + (type === "legs" && policy.goal === "generalFitness" ? 3 : 0);
}

function allocateTrainingTypes(
  targetDays: number,
  available: PlannedTrainingType[],
  scores: Map<PlannedTrainingType, number>,
) {
  const allocation = new Map<PlannedTrainingType, number>(available.map((type) => [type, 0]));
  const ranked = [...available].sort((left, right) => (scores.get(right) ?? 0) - (scores.get(left) ?? 0));

  if (targetDays >= available.length) {
    for (const type of available) allocation.set(type, 1);
  } else {
    for (const type of ranked.slice(0, targetDays)) allocation.set(type, 1);
  }

  let assigned = [...allocation.values()].reduce((sum, value) => sum + value, 0);
  while (assigned < targetDays) {
    const next = [...available].sort((left, right) => {
      const leftCount = allocation.get(left) ?? 0;
      const rightCount = allocation.get(right) ?? 0;
      const leftValue = (scores.get(left) ?? 0) - leftCount * 10;
      const rightValue = (scores.get(right) ?? 0) - rightCount * 10;
      return rightValue - leftValue || leftCount - rightCount;
    })[0];
    if (!next) break;
    allocation.set(next, (allocation.get(next) ?? 0) + 1);
    assigned += 1;
  }
  return allocation;
}

function orderedTrainingTypes(
  allocation: Map<PlannedTrainingType, number>,
  scores: Map<PlannedTrainingType, number>,
) {
  const remaining = new Map(allocation);
  const sequence: PlannedTrainingType[] = [];
  while ([...remaining.values()].some((value) => value > 0)) {
    const previous = sequence.at(-1);
    const candidates = [...remaining.entries()]
      .filter(([, count]) => count > 0)
      .sort(([left, leftCount], [right, rightCount]) => {
        const leftRepeatPenalty = left === previous ? 100 : 0;
        const rightRepeatPenalty = right === previous ? 100 : 0;
        const leftValue = leftCount * 20 + (scores.get(left) ?? 0) - leftRepeatPenalty;
        const rightValue = rightCount * 20 + (scores.get(right) ?? 0) - rightRepeatPenalty;
        return rightValue - leftValue;
      });
    const next = candidates[0]?.[0];
    if (!next) break;
    sequence.push(next);
    remaining.set(next, (remaining.get(next) ?? 1) - 1);
  }
  return sequence;
}

function trainingPositions(trainingDays: number) {
  if (trainingDays >= 7) return [0, 1, 2, 3, 4, 5, 6];
  if (trainingDays <= 1) return [0];
  const positions: number[] = [];
  for (let index = 0; index < trainingDays; index += 1) {
    let position = Math.round(index * 6 / (trainingDays - 1));
    while (positions.includes(position) && position < 6) position += 1;
    while (positions.includes(position) && position > 0) position -= 1;
    positions.push(position);
  }
  return positions.sort((left, right) => left - right);
}

function buildSchedule(
  sequence: PlannedTrainingType[],
  byType: Map<PlannedTrainingType, Template[]>,
): Schedule {
  const positions = new Set(trainingPositions(sequence.length));
  const templateCursor = new Map<PlannedTrainingType, number>();
  let trainingIndex = 0;
  const steps: MicrocycleStep[] = Array.from({ length: 7 }, (_, index) => {
    if (!positions.has(index)) {
      return { id: `adaptive_step_${index + 1}_rest`, type: "rest", label: "Rest" };
    }
    const type = sequence[trainingIndex] ?? sequence[sequence.length - 1] ?? "push";
    trainingIndex += 1;
    const templates = byType.get(type) ?? [];
    const cursor = templateCursor.get(type) ?? 0;
    const template = templates[cursor % Math.max(1, templates.length)];
    templateCursor.set(type, cursor + 1);
    return {
      id: `adaptive_step_${index + 1}_${type}_${cursor + 1}`,
      type,
      label: template?.name ?? type,
      ...(template ? { templateId: template.id } : {}),
    };
  });
  return {
    split: steps.map((step) => step.type),
    microcycle: steps,
  };
}

function frequency(schedule: Schedule, type: PlannedTrainingType) {
  const steps = schedule.microcycle?.length
    ? schedule.microcycle
    : schedule.split.map((value, index) => ({ id: `split_${index}`, type: value || "rest", label: String(value) }));
  return steps.filter((step) => step.type === type).length;
}

export function scheduleAdaptationRevision(data: AppData, policy: TrainingPolicy, date: string) {
  const source = JSON.stringify({
    policy: policyRevision(policy),
    date,
    schedule: canonicalSchedule(data.schedule),
    templates: (data.templates ?? []).map((template) => ({
      id: template.id,
      type: template.type,
      items: template.items.map((item) => ({ id: item.exerciseId, sets: item.sets })),
    })),
  });
  return `schedule-${hash(source)}`;
}

export function buildScheduleAdaptation(
  data: AppData,
  policy: TrainingPolicy,
  date: string,
): ScheduleAdaptationProposal {
  const constraints = compileTrainingConstraints(policy, date);
  const { byType, presets } = templatePool(data, policy, constraints);
  const available = TRAINING_TYPES.filter((type) => (byType.get(type)?.length ?? 0) > 0);
  const previousSchedule = cloneSchedule(data.schedule);
  const trainingDaysBefore = TRAINING_TYPES.reduce((sum, type) => sum + frequency(previousSchedule, type), 0);
  const warnings: string[] = [];
  const reasons: string[] = [];

  if (!available.length) {
    return {
      id: `schedule-proposal-${scheduleAdaptationRevision(data, policy, date)}`,
      sourceRevision: scheduleAdaptationRevision(data, policy, date),
      changed: false,
      previousSchedule,
      nextSchedule: previousSchedule,
      reasons: [],
      warnings: ["没有可用于重排的非空训练模板"],
      trainingDaysBefore,
      trainingDaysAfter: trainingDaysBefore,
      frequencyChanges: TRAINING_TYPES.map((type) => ({ type, before: frequency(previousSchedule, type), after: frequency(previousSchedule, type) })),
    };
  }

  const targetDays = Math.min(7, Math.max(1, policy.weeklyTrainingDays.target));
  const scores = new Map<PlannedTrainingType, number>(available.map((type) => [
    type,
    typeScore(type, byType.get(type) ?? [], policy, constraints, presets),
  ]));
  const allocation = allocateTrainingTypes(targetDays, available, scores);
  const sequence = orderedTrainingTypes(allocation, scores);
  const nextSchedule = buildSchedule(sequence, byType);
  const trainingDaysAfter = sequence.length;

  if (trainingDaysBefore !== trainingDaysAfter) reasons.push(`每周训练天数 ${trainingDaysBefore} → ${trainingDaysAfter}`);
  for (const type of TRAINING_TYPES) {
    const before = frequency(previousSchedule, type);
    const after = frequency(nextSchedule, type);
    if (before !== after) reasons.push(`${type} 频率 ${before} → ${after}`);
  }
  if (available.length < TRAINING_TYPES.length) {
    warnings.push(`缺少 ${TRAINING_TYPES.filter((type) => !available.includes(type)).join(" / ")} 类型的非空模板，无法分配该类型`);
  }
  if (targetDays === 7) warnings.push("当前设置为连续 7 个训练日；请确认恢复能力与实际时间允许");

  const sourceRevision = scheduleAdaptationRevision(data, policy, date);
  return {
    id: `schedule-proposal-${sourceRevision}`,
    sourceRevision,
    changed: JSON.stringify(canonicalSchedule(previousSchedule)) !== JSON.stringify(canonicalSchedule(nextSchedule)),
    previousSchedule,
    nextSchedule,
    reasons,
    warnings,
    trainingDaysBefore,
    trainingDaysAfter,
    frequencyChanges: TRAINING_TYPES.map((type) => ({
      type,
      before: frequency(previousSchedule, type),
      after: frequency(nextSchedule, type),
    })),
  };
}

export function isScheduleProposalCurrent(
  data: AppData,
  policy: TrainingPolicy,
  date: string,
  proposal: ScheduleAdaptationProposal,
) {
  return scheduleAdaptationRevision(data, policy, date) === proposal.sourceRevision;
}

export function dominantMusclesForType(type: TrainingType): MuscleGroup[] {
  if (type === "push") return ["chest", "upperChest", "frontDelt", "sideDelt", "triceps", "serratus"];
  if (type === "pull") return ["lats", "upperBack", "back", "lowerBack", "rearDelt", "traps", "biceps", "forearms"];
  if (type === "legs") return ["quads", "hamstrings", "glutes", "adductors", "abductors", "calves"];
  return [];
}
