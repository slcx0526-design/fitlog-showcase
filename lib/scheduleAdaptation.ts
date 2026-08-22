import { buildAdaptiveEvidenceProfile, evidenceConfidenceMeets, type AdaptiveEvidenceProfile } from "./adaptiveEvidence";
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
  cycleDays: number;
  weeklyEquivalentBefore: number;
  weeklyEquivalentAfter: number;
  frequencyChanges: ScheduleFrequencyChange[];
  targetTrainingDays: number;
  targetWeeklyTrainingDays: number;
  evidenceAdjusted: boolean;
  evidenceState: AdaptiveEvidenceProfile["state"];
  evidenceConfidence: AdaptiveEvidenceProfile["confidence"];
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

function recoveryViolations(
  sequence: PlannedTrainingType[],
  cycleDays: number,
  minimumRecoveryDays: number,
  positionedDays = trainingPositions(sequence.length, cycleDays),
) {
  if (minimumRecoveryDays <= 0 || !sequence.length) return [];
  const byType = new Map<PlannedTrainingType, number[]>();
  sequence.forEach((type, index) => byType.set(type, [...(byType.get(type) ?? []), positionedDays[index]]));
  return [...byType.entries()].flatMap(([type, values]) => values.flatMap((position, index) => {
    const next = values[(index + 1) % values.length] + (index === values.length - 1 ? cycleDays : 0);
    const restDays = Math.max(0, next - position - 1);
    return restDays < minimumRecoveryDays ? [{ type, restDays }] : [];
  }));
}

function optimizeTrainingSequence(
  allocation: Map<PlannedTrainingType, number>,
  scores: Map<PlannedTrainingType, number>,
  cycleDays: number,
  minimumRecoveryDays: number,
) {
  const baseline = orderedTrainingTypes(allocation, scores);
  if (baseline.length > 9 || minimumRecoveryDays <= 0) return baseline;
  const remaining = new Map(allocation);
  let best = baseline;
  let bestScore = Number.POSITIVE_INFINITY;
  const candidate: PlannedTrainingType[] = [];
  const visit = () => {
    if (candidate.length === baseline.length) {
      const violations = recoveryViolations(candidate, cycleDays, minimumRecoveryDays);
      const recoveryPenalty = violations.reduce((sum, violation) => (
        sum + (minimumRecoveryDays - violation.restDays) * 100
      ), 0);
      const baselinePenalty = candidate.reduce((sum, type, index) => sum + Number(type !== baseline[index]), 0);
      const score = recoveryPenalty + baselinePenalty;
      if (score < bestScore) {
        bestScore = score;
        best = [...candidate];
      }
      return;
    }
    const ranked = [...remaining.entries()]
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => (scores.get(right) ?? 0) - (scores.get(left) ?? 0));
    for (const [type, count] of ranked) {
      remaining.set(type, count - 1);
      candidate.push(type);
      visit();
      candidate.pop();
      remaining.set(type, count);
    }
  };
  visit();
  return best;
}

function trainingPositions(trainingDays: number, cycleDays: number) {
  if (trainingDays >= cycleDays) return Array.from({ length: cycleDays }, (_, index) => index);
  if (trainingDays <= 1) return [0];
  return Array.from({ length: trainingDays }, (_, index) => Math.floor(index * cycleDays / trainingDays));
}

function buildSchedule(
  sequence: PlannedTrainingType[],
  byType: Map<PlannedTrainingType, Template[]>,
  cycleDays: number,
): Schedule {
  const positions = new Set(trainingPositions(sequence.length, cycleDays));
  const templateCursor = new Map<PlannedTrainingType, number>();
  let trainingIndex = 0;
  const steps: MicrocycleStep[] = Array.from({ length: cycleDays }, (_, index) => {
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

function cycleLength(schedule: Schedule) {
  const length = schedule.microcycle?.length ?? schedule.split.length;
  return Math.max(1, length || 7);
}

function weeklyDaysToCycleDays(weeklyDays: number, cycleDays: number) {
  return Math.min(cycleDays, Math.max(1, Math.round(weeklyDays * cycleDays / 7)));
}

function cycleDaysToWeeklyEquivalent(trainingDays: number, cycleDays: number) {
  return Math.round(trainingDays * 7 / Math.max(1, cycleDays) * 10) / 10;
}

function frequency(schedule: Schedule, type: PlannedTrainingType) {
  const steps = schedule.microcycle?.length
    ? schedule.microcycle
    : schedule.split.map((value, index) => ({ id: `split_${index}`, type: value || "rest", label: String(value) }));
  return steps.filter((step) => step.type === type).length;
}

function scheduleTrainingLayout(schedule: Schedule) {
  const steps = schedule.microcycle?.length
    ? schedule.microcycle
    : schedule.split.map((value, index) => ({ id: `split_${index}`, type: value || "rest", label: String(value) }));
  const sequence: PlannedTrainingType[] = [];
  const positions: number[] = [];
  steps.forEach((step, index) => {
    if (!TRAINING_TYPES.includes(step.type as PlannedTrainingType)) return;
    sequence.push(step.type as PlannedTrainingType);
    positions.push(index);
  });
  return { sequence, positions };
}

export function scheduleAdaptationRevision(
  data: AppData,
  policy: TrainingPolicy,
  date: string,
  evidence = buildAdaptiveEvidenceProfile(data, policy, date),
) {
  const source = JSON.stringify({
    policy: policyRevision(policy),
    evidence: policy.evidenceMode === "off" ? "off" : evidence.revision,
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
  const evidence = buildAdaptiveEvidenceProfile(data, policy, date);
  const constraints = compileTrainingConstraints(policy, date);
  const { byType, presets } = templatePool(data, policy, constraints);
  const available = TRAINING_TYPES.filter((type) => (byType.get(type)?.length ?? 0) > 0);
  const previousSchedule = cloneSchedule(data.schedule);
  const cycleDays = cycleLength(previousSchedule);
  const trainingDaysBefore = TRAINING_TYPES.reduce((sum, type) => sum + frequency(previousSchedule, type), 0);
  const weeklyEquivalentBefore = cycleDaysToWeeklyEquivalent(trainingDaysBefore, cycleDays);
  const warnings: string[] = [];
  const reasons: string[] = [];

  if (!available.length) {
    return {
      id: `schedule-proposal-${scheduleAdaptationRevision(data, policy, date, evidence)}`,
      sourceRevision: scheduleAdaptationRevision(data, policy, date, evidence),
      changed: false,
      previousSchedule,
      nextSchedule: previousSchedule,
      reasons: [],
      warnings: ["没有可用于重排的非空训练模板"],
      trainingDaysBefore,
      trainingDaysAfter: trainingDaysBefore,
      cycleDays,
      weeklyEquivalentBefore,
      weeklyEquivalentAfter: weeklyEquivalentBefore,
      frequencyChanges: TRAINING_TYPES.map((type) => ({ type, before: frequency(previousSchedule, type), after: frequency(previousSchedule, type) })),
      targetTrainingDays: trainingDaysBefore,
      targetWeeklyTrainingDays: weeklyEquivalentBefore,
      evidenceAdjusted: false,
      evidenceState: evidence.state,
      evidenceConfidence: evidence.confidence,
    };
  }

  const evidenceQualified = policy.evidenceMode !== "off"
    && evidenceConfidenceMeets(evidence.confidence, policy.evidenceMinimumConfidence);
  const evidenceAdjusted = evidenceQualified
    && evidence.recommendedTrainingDays !== policy.weeklyTrainingDays.target;
  const targetWeeklyTrainingDays = Math.min(7, Math.max(1, evidenceAdjusted
    ? evidence.recommendedTrainingDays
    : policy.weeklyTrainingDays.target));
  const targetDays = weeklyDaysToCycleDays(targetWeeklyTrainingDays, cycleDays);
  if (evidenceAdjusted) {
    reasons.push(`恢复与训练证据将每 7 天目标 ${policy.weeklyTrainingDays.target} → ${targetWeeklyTrainingDays}，折算到 ${cycleDays} 天微周期为 ${targetDays} 个训练日`);
  } else if (cycleDays !== 7) {
    reasons.push(`每 7 天目标 ${targetWeeklyTrainingDays} 次，折算到 ${cycleDays} 天微周期为 ${targetDays} 个训练日`);
  }
  if (policy.evidenceMode !== "off" && !evidenceQualified && evidence.state !== "normal") {
    warnings.push(`动态证据置信度为 ${evidence.confidence}，未达到 ${policy.evidenceMinimumConfidence} 门槛`);
  }
  if (policy.scheduleAdaptation === "preserve") {
    if (targetDays !== trainingDaysBefore) {
      warnings.push(`已锁定当前分化结构；目标为 ${targetDays} 个训练日，当前保持 ${trainingDaysBefore} 个训练日`);
    }
    reasons.push("分化策略设为保持当前结构，不自动增删或重排训练日");
    const sourceRevision = scheduleAdaptationRevision(data, policy, date, evidence);
    return {
      id: `schedule-proposal-${sourceRevision}`,
      sourceRevision,
      changed: false,
      previousSchedule,
      nextSchedule: previousSchedule,
      reasons,
      warnings,
      trainingDaysBefore,
      trainingDaysAfter: trainingDaysBefore,
      cycleDays,
      weeklyEquivalentBefore,
      weeklyEquivalentAfter: weeklyEquivalentBefore,
      frequencyChanges: TRAINING_TYPES.map((type) => ({ type, before: frequency(previousSchedule, type), after: frequency(previousSchedule, type) })),
      targetTrainingDays: targetDays,
      targetWeeklyTrainingDays,
      evidenceAdjusted,
      evidenceState: evidence.state,
      evidenceConfidence: evidence.confidence,
    };
  }
  if (targetDays < available.length && available.every((type) => frequency(previousSchedule, type) > 0)) {
    warnings.push(`目标训练日 ${targetDays} 少于现有 ${available.length} 类分化；为避免删除完整训练类型，保持当前微周期`);
    const sourceRevision = scheduleAdaptationRevision(data, policy, date, evidence);
    return {
      id: `schedule-proposal-${sourceRevision}`,
      sourceRevision,
      changed: false,
      previousSchedule,
      nextSchedule: previousSchedule,
      reasons,
      warnings,
      trainingDaysBefore,
      trainingDaysAfter: trainingDaysBefore,
      cycleDays,
      weeklyEquivalentBefore,
      weeklyEquivalentAfter: weeklyEquivalentBefore,
      frequencyChanges: TRAINING_TYPES.map((type) => ({ type, before: frequency(previousSchedule, type), after: frequency(previousSchedule, type) })),
      targetTrainingDays: targetDays,
      targetWeeklyTrainingDays,
      evidenceAdjusted,
      evidenceState: evidence.state,
      evidenceConfidence: evidence.confidence,
    };
  }
  const scores = new Map<PlannedTrainingType, number>(available.map((type) => [
    type,
    typeScore(type, byType.get(type) ?? [], policy, constraints, presets),
  ]));
  const allocation = allocateTrainingTypes(targetDays, available, scores);
  const sequence = optimizeTrainingSequence(
    allocation,
    scores,
    cycleDays,
    constraints.minimumRecoveryDays,
  );
  const allocationMatchesCurrent = TRAINING_TYPES.every((type) => (
    frequency(previousSchedule, type) === (allocation.get(type) ?? 0)
  ));
  const currentLayout = scheduleTrainingLayout(previousSchedule);
  const currentRecoveryViolations = recoveryViolations(
    currentLayout.sequence,
    cycleDays,
    constraints.minimumRecoveryDays,
    currentLayout.positions,
  );
  const nextSchedule = allocationMatchesCurrent && currentRecoveryViolations.length === 0
    ? previousSchedule
    : buildSchedule(sequence, byType, cycleDays);
  const trainingDaysAfter = sequence.length;
  const weeklyEquivalentAfter = cycleDaysToWeeklyEquivalent(trainingDaysAfter, cycleDays);

  if (trainingDaysBefore !== trainingDaysAfter) {
    reasons.push(`${cycleDays} 天微周期训练日 ${trainingDaysBefore} → ${trainingDaysAfter}（约每 7 天 ${weeklyEquivalentBefore} → ${weeklyEquivalentAfter} 次）`);
  }
  if (allocationMatchesCurrent && currentRecoveryViolations.length > 0) {
    reasons.push(`按同肌群至少间隔 ${constraints.minimumRecoveryDays} 天重排训练顺序`);
  }
  for (const type of TRAINING_TYPES) {
    const before = frequency(previousSchedule, type);
    const after = frequency(nextSchedule, type);
    if (before !== after) reasons.push(`${type} 频率 ${before} → ${after}`);
  }
  if (available.length < TRAINING_TYPES.length) {
    warnings.push(`缺少 ${TRAINING_TYPES.filter((type) => !available.includes(type)).join(" / ")} 类型的非空模板，无法分配该类型`);
  }
  if (targetDays === cycleDays) warnings.push(`${cycleDays} 天微周期没有休息日；请确认恢复能力与实际时间允许`);
  const unresolvedRecovery = recoveryViolations(sequence, cycleDays, constraints.minimumRecoveryDays);
  if (unresolvedRecovery.length > 0) {
    const types = [...new Set(unresolvedRecovery.map((violation) => violation.type))].join(" / ");
    warnings.push(`${cycleDays} 天微周期内 ${types} 的频率无法满足同肌群至少间隔 ${constraints.minimumRecoveryDays} 天；请减少频率或延长微周期`);
  }

  const sourceRevision = scheduleAdaptationRevision(data, policy, date, evidence);
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
    cycleDays,
    weeklyEquivalentBefore,
    weeklyEquivalentAfter,
    frequencyChanges: TRAINING_TYPES.map((type) => ({
      type,
      before: frequency(previousSchedule, type),
      after: frequency(nextSchedule, type),
    })),
    targetTrainingDays: targetDays,
    targetWeeklyTrainingDays,
    evidenceAdjusted,
    evidenceState: evidence.state,
    evidenceConfidence: evidence.confidence,
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
