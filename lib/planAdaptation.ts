import { DEFAULT_EXERCISES } from "./exercises";
import { MUSCLE_LABELS, weeklyTargetFor, type MuscleGroup } from "./muscles";
import { normalizeTemplateItemPrescription } from "./prescription";
import { compileTrainingConstraints, exerciseConstraintViolations, exercisePreferenceScore } from "./trainingConstraints";
import { musclePriorityMultiplier, policyRevision, type TrainingPolicy } from "./trainingPolicy";
import type { AppData, ExercisePreset, Template, TemplateItem, VolumeContribution } from "./types";

export type PlanAdaptationTrigger =
  | "policyChanged"
  | "temporaryOverride"
  | "cycleReview"
  | "userRequested";

export interface TemplatePlanChange {
  templateId: string;
  templateName: string;
  previousItems: TemplateItem[];
  nextItems: TemplateItem[];
  reasons: string[];
  estimatedMinutesBefore: number;
  estimatedMinutesAfter: number;
}

export interface PlanAdaptationProposal {
  id: string;
  createdAt: string;
  trigger: PlanAdaptationTrigger;
  scope: "nextSession" | "nextMicrocycle";
  sourceRevision: string;
  confidence: "explicit" | "high" | "medium" | "low";
  summary: string;
  reasons: string[];
  evidence: string[];
  changes: TemplatePlanChange[];
  impact: {
    changedTemplates: number;
    replacedExercises: number;
    removedExercises: number;
    setDelta: number;
    estimatedMinutesBefore: number;
    estimatedMinutesAfter: number;
    muscleSetDelta: Partial<Record<MuscleGroup, number>>;
  };
  warnings: string[];
}

export interface ApplyPlanAdaptationResult {
  applied: boolean;
  reason?: "stale" | "empty";
  data: AppData;
}

type Preset = (typeof DEFAULT_EXERCISES)[number] | AppData["customExercises"][number];

type MutableTemplate = {
  source: Template;
  items: TemplateItem[];
  reasons: Set<string>;
  replaced: number;
  removed: number;
};

const RECOVERY_GROUPS: Array<{ key: string; muscles: MuscleGroup[]; sessionCap: number; repeatedSessionCap: number }> = [
  { key: "chest", muscles: ["chest", "upperChest"], sessionCap: 8, repeatedSessionCap: 7 },
  { key: "back", muscles: ["back", "lats", "upperBack"], sessionCap: 10, repeatedSessionCap: 8 },
  { key: "delts", muscles: ["frontDelt", "sideDelt", "rearDelt"], sessionCap: 8, repeatedSessionCap: 6 },
  { key: "biceps", muscles: ["biceps"], sessionCap: 6, repeatedSessionCap: 5 },
  { key: "triceps", muscles: ["triceps"], sessionCap: 6, repeatedSessionCap: 5 },
  { key: "quads", muscles: ["quads"], sessionCap: 8, repeatedSessionCap: 6 },
  { key: "posterior", muscles: ["hamstrings", "glutes"], sessionCap: 10, repeatedSessionCap: 8 },
  { key: "calves", muscles: ["calves"], sessionCap: 6, repeatedSessionCap: 5 },
];

type RecoveryCapContext = Map<string, { cap: number; exposures: number; cycleDays: number }>;

const MAX_PRIORITY_ADDITIONS_PER_TEMPLATE = 2;

function cloneItems(items: TemplateItem[]) {
  return items.map((item) => ({
    ...item,
    ...(item.secondaryMuscles ? { secondaryMuscles: [...item.secondaryMuscles] } : {}),
    ...(item.volumeContributions ? { volumeContributions: item.volumeContributions.map((entry) => ({ ...entry })) } : {}),
    ...(item.alternatives ? { alternatives: [...item.alternatives] } : {}),
    ...(item.recordModes ? { recordModes: [...item.recordModes] } : {}),
    ...(item.prescription ? { prescription: { ...item.prescription } } : {}),
  }));
}

function fingerprintTemplates(data: AppData, policy: TrainingPolicy) {
  const compact = (data.templates ?? []).map((template) => ({
    id: template.id,
    type: template.type,
    items: template.items.map((item) => ({ id: item.exerciseId, sets: item.sets, low: item.repsLow, high: item.repsHigh })),
  }));
  const source = `${policyRevision(policy)}:${JSON.stringify(compact)}:${JSON.stringify(data.schedule.microcycle ?? data.schedule.split)}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `plan-${(hash >>> 0).toString(36)}`;
}

function directContributions(item: TemplateItem, preset?: Preset): VolumeContribution[] {
  const configured = item.volumeContributions?.length ? item.volumeContributions : preset?.volumeContributions;
  if (configured?.length) return configured.filter((entry) => entry.direct);
  const primary = item.primaryMuscle ?? preset?.primaryMuscle;
  return primary ? [{ muscle: primary, weight: 1, direct: true }] : [];
}

function itemPreset(item: TemplateItem, presets: Map<string, Preset>) {
  return presets.get(item.exerciseId);
}

export function estimateTemplateMinutes(items: TemplateItem[], presets?: Map<string, Preset>) {
  return Math.round(items.reduce((minutes, item, index) => {
    const preset = presets?.get(item.exerciseId);
    const isMain = item.isMain ?? preset?.isMain ?? false;
    const perSet = isMain ? 3.5 : item.supersetGroup ? 1.7 : 2.4;
    const transition = index === 0 ? 3 : 1.2;
    return minutes + transition + item.sets * perSet;
  }, 0));
}

function replacementItem(source: TemplateItem, preset: Preset): TemplateItem {
  const item: TemplateItem = {
    exerciseId: preset.id,
    name: preset.name,
    sets: source.sets,
    repsLow: source.repsLow,
    repsHigh: source.repsHigh,
    ...(source.rpe != null ? { rpe: source.rpe } : {}),
    isMain: preset.isMain,
    ...(preset.primaryMuscle ? { primaryMuscle: preset.primaryMuscle } : {}),
    ...(preset.secondaryMuscles?.length ? { secondaryMuscles: [...preset.secondaryMuscles] } : {}),
    ...(preset.volumeContributions?.length ? { volumeContributions: preset.volumeContributions.map((entry) => ({ ...entry })) } : {}),
    ...(preset.equipment ? { equipment: preset.equipment } : {}),
    ...(preset.movementPattern ? { movementPattern: preset.movementPattern } : {}),
    ...(preset.alternatives?.length ? { alternatives: [...preset.alternatives] } : {}),
    ...(preset.recordModes?.length ? { recordModes: [...preset.recordModes] } : {}),
    ...(source.supersetGroup ? { supersetGroup: source.supersetGroup } : {}),
  };
  return normalizeTemplateItemPrescription(item, preset);
}

function replacementCandidates(
  template: MutableTemplate,
  item: TemplateItem,
  presets: Map<string, Preset>,
  constraints: ReturnType<typeof compileTrainingConstraints>,
) {
  const current = itemPreset(item, presets);
  const currentPrimary = item.primaryMuscle ?? current?.primaryMuscle;
  const currentPattern = item.movementPattern ?? current?.movementPattern;
  const used = new Set(template.items.map((entry) => entry.exerciseId));
  const explicitAlternatives = new Set([...(item.alternatives ?? []), ...(current?.alternatives ?? [])]);
  return [...presets.values()]
    .filter((candidate) => candidate.id !== item.exerciseId && !used.has(candidate.id))
    .filter((candidate) => candidate.type === template.source.type || candidate.type === "custom")
    .filter((candidate) => exerciseConstraintViolations(candidate, constraints).length === 0)
    .filter((candidate) => {
      if (explicitAlternatives.has(candidate.id) || explicitAlternatives.has(candidate.name)) return true;
      if (currentPrimary && candidate.primaryMuscle === currentPrimary) return true;
      return Boolean(currentPattern && candidate.movementPattern === currentPattern);
    })
    .sort((a, b) => {
      const score = (candidate: Preset) => {
        let value = exercisePreferenceScore(candidate, constraints);
        if (explicitAlternatives.has(candidate.id) || explicitAlternatives.has(candidate.name)) value += 50;
        if (currentPattern && candidate.movementPattern === currentPattern) value += 20;
        if (currentPrimary && candidate.primaryMuscle === currentPrimary) value += 15;
        if (candidate.isMain === (item.isMain ?? current?.isMain)) value += 5;
        return value;
      };
      return score(b) - score(a) || a.name.localeCompare(b.name);
    });
}

function planningSteps(data: AppData) {
  if (data.schedule.microcycle?.length) return data.schedule.microcycle;
  if (data.microcycle?.steps?.length) return data.microcycle.steps;
  return undefined;
}

function templateUsage(data: AppData) {
  const counts = new Map<string, number>();
  const steps = planningSteps(data);
  const templates = data.templates ?? [];
  const byId = new Map(templates.map((template) => [template.id, template]));
  const byType = new Map<string, Template[]>();
  for (const template of templates) {
    const bucket = byType.get(template.type) ?? [];
    bucket.push(template);
    byType.set(template.type, bucket);
  }
  const cursors = new Map<string, number>();
  for (const step of steps ?? []) {
    if (step.type === "rest") continue;
    const bound = step.templateId ? byId.get(step.templateId) : undefined;
    const matchingBound = bound?.type === step.type ? bound : undefined;
    const candidates = byType.get(step.type) ?? [];
    const cursor = cursors.get(step.type) ?? 0;
    const template = matchingBound
      ? matchingBound
      : candidates[cursor % Math.max(1, candidates.length)];
    if (!matchingBound && candidates.length) cursors.set(step.type, cursor + 1);
    if (template) counts.set(template.id, (counts.get(template.id) ?? 0) + 1);
  }
  if (!steps?.length) for (const template of templates) counts.set(template.id, 1);
  return counts;
}

function planningCycleDays(data: AppData) {
  return Math.max(1, planningSteps(data)?.length ?? data.schedule.split.length ?? 7);
}

function cycleMuscleSets(templates: MutableTemplate[], usage: Map<string, number>, presets: Map<string, Preset>) {
  const totals: Partial<Record<MuscleGroup, number>> = {};
  for (const template of templates) {
    const count = usage.get(template.source.id) ?? 0;
    if (!count) continue;
    for (const item of template.items) {
      for (const contribution of directContributions(item, itemPreset(item, presets))) {
        totals[contribution.muscle] = (totals[contribution.muscle] ?? 0) + item.sets * contribution.weight * count;
      }
    }
  }
  return totals;
}

function itemMuscleWeight(item: TemplateItem, muscle: MuscleGroup, presets: Map<string, Preset>) {
  return directContributions(item, itemPreset(item, presets)).find((entry) => entry.muscle === muscle)?.weight ?? 0;
}

function withWorkingSets(item: TemplateItem, sets: number): TemplateItem {
  return {
    ...item,
    sets,
    ...(item.prescription ? { prescription: { ...item.prescription, workingSets: sets } } : {}),
  };
}

function recoveryGroupFor(muscle: MuscleGroup) {
  return RECOVERY_GROUPS.find((group) => group.muscles.includes(muscle))
    ?? { key: muscle, muscles: [muscle], sessionCap: 8, repeatedSessionCap: 6 };
}

function buildRecoveryCapContext(
  templates: MutableTemplate[],
  usage: Map<string, number>,
  presets: Map<string, Preset>,
  cycleDays: number,
): RecoveryCapContext {
  return new Map(RECOVERY_GROUPS.map((group) => {
    const exposures = templates.reduce((total, template) => {
      const used = usage.get(template.source.id) ?? 0;
      if (!used) return total;
      const contributes = template.items.some((item) => directContributions(item, itemPreset(item, presets))
        .some((entry) => group.muscles.includes(entry.muscle) && entry.weight > 0));
      return total + (contributes ? used : 0);
    }, 0);
    const exposureRate7d = exposures * 7 / Math.max(1, cycleDays);
    return [group.key, {
      exposures,
      cycleDays,
      cap: exposureRate7d >= 1.5 ? group.repeatedSessionCap : group.sessionCap,
    }];
  }));
}

function recoveryCapFor(group: ReturnType<typeof recoveryGroupFor>, caps: RecoveryCapContext) {
  return caps.get(group.key)?.cap ?? group.sessionCap;
}

function templateDirectSets(
  template: MutableTemplate,
  muscles: MuscleGroup[],
  presets: Map<string, Preset>,
) {
  const included = new Set(muscles);
  return template.items.reduce((total, item) => total + directContributions(item, itemPreset(item, presets))
    .filter((entry) => included.has(entry.muscle))
    .reduce((sum, entry) => sum + item.sets * entry.weight, 0), 0);
}

function recoveryPriorityScore(
  item: TemplateItem,
  muscles: MuscleGroup[],
  policy: TrainingPolicy,
  presets: Map<string, Preset>,
) {
  const included = new Set(muscles);
  const scores = directContributions(item, itemPreset(item, presets))
    .filter((entry) => included.has(entry.muscle))
    .map((entry) => {
      const priority = policy.musclePriorities[entry.muscle];
      if (priority === "specialize") return 4;
      if (priority === "grow") return 3;
      if (priority === "deprioritize") return 0;
      if (priority === "maintain") return 1;
      return 2;
    });
  return scores.length ? Math.max(...scores) : 2;
}

function enforceRecoveryCaps(
  template: MutableTemplate,
  policy: TrainingPolicy,
  presets: Map<string, Preset>,
  constraints: ReturnType<typeof compileTrainingConstraints>,
  recoveryCaps: RecoveryCapContext,
  warnings: string[],
) {
  for (const recovery of RECOVERY_GROUPS) {
    const sessionCap = recoveryCapFor(recovery, recoveryCaps);
    const capContext = recoveryCaps.get(recovery.key);
    const initial = templateDirectSets(template, recovery.muscles, presets);
    if (initial <= sessionCap + 0.001) continue;
    const reductions = new Map<string, number>();
    let guard = 0;
    while (templateDirectSets(template, recovery.muscles, presets) > sessionCap + 0.001 && guard < 80) {
      guard += 1;
      const candidates = template.items
        .map((item, index) => ({ item, index, preset: itemPreset(item, presets) }))
        .filter(({ item }) => item.sets > 1 && directContributions(item, itemPreset(item, presets)).some((entry) => recovery.muscles.includes(entry.muscle)))
        .sort((left, right) => {
          const leftMain = left.item.isMain ?? left.preset?.isMain ?? false;
          const rightMain = right.item.isMain ?? right.preset?.isMain ?? false;
          if (leftMain !== rightMain) return Number(leftMain) - Number(rightMain);
          const priorityDelta = recoveryPriorityScore(left.item, recovery.muscles, policy, presets)
            - recoveryPriorityScore(right.item, recovery.muscles, policy, presets);
          if (priorityDelta) return priorityDelta;
          const preferenceDelta = exercisePreferenceScore(left.preset ?? { id: left.item.exerciseId }, constraints)
            - exercisePreferenceScore(right.preset ?? { id: right.item.exerciseId }, constraints);
          return preferenceDelta || right.item.sets - left.item.sets || right.index - left.index;
        });
      const candidate = candidates[0];
      if (!candidate) break;
      template.items[candidate.index] = withWorkingSets(candidate.item, candidate.item.sets - 1);
      reductions.set(candidate.item.name, (reductions.get(candidate.item.name) ?? 0) + 1);
    }

    const groupLabel = recovery.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join("/");
    if (capContext && sessionCap < recovery.sessionCap) {
      template.reasons.add(`${groupLabel}：${capContext.cycleDays} 天微周期 ${capContext.exposures} 次刺激，单次上限按 ${sessionCap} 组分配`);
    }
    for (const [exerciseName, count] of reductions) {
      template.reasons.add(`${groupLabel}：单次直接组上限 ${sessionCap}，${exerciseName} -${count} 组`);
    }
    let remaining = templateDirectSets(template, recovery.muscles, presets);
    guard = 0;
    while (remaining > sessionCap + 0.001 && template.items.length > 1 && guard < 80) {
      guard += 1;
      const candidates = template.items
        .map((item, index) => ({ item, index, preset: itemPreset(item, presets) }))
        .filter(({ item, preset }) => directContributions(item, preset)
          .some((entry) => recovery.muscles.includes(entry.muscle)))
        .sort((left, right) => {
          const leftMain = left.item.isMain ?? left.preset?.isMain ?? false;
          const rightMain = right.item.isMain ?? right.preset?.isMain ?? false;
          if (leftMain !== rightMain) return Number(leftMain) - Number(rightMain);
          const priorityDelta = recoveryPriorityScore(left.item, recovery.muscles, policy, presets)
            - recoveryPriorityScore(right.item, recovery.muscles, policy, presets);
          if (priorityDelta) return priorityDelta;
          const preferenceDelta = exercisePreferenceScore(left.preset ?? { id: left.item.exerciseId }, constraints)
            - exercisePreferenceScore(right.preset ?? { id: right.item.exerciseId }, constraints);
          return preferenceDelta || right.index - left.index;
        });
      const candidate = candidates[0];
      if (!candidate) break;
      template.items.splice(candidate.index, 1);
      template.removed += 1;
      template.reasons.add(`${groupLabel}：单次直接组上限 ${sessionCap}，移除低优先级动作 ${candidate.item.name}`);
      remaining = templateDirectSets(template, recovery.muscles, presets);
    }
    if (remaining > sessionCap + 0.001) {
      const warning = `${template.source.name} 的${groupLabel}直接组仍为 ${Math.round(remaining * 10) / 10}，高于单次恢复上限 ${sessionCap}；请人工确认动作结构。`;
      if (!warnings.includes(warning)) warnings.push(warning);
    }
  }
}

function canAddPrioritySet(
  template: MutableTemplate,
  itemIndex: number,
  muscle: MuscleGroup,
  constraints: ReturnType<typeof compileTrainingConstraints>,
  presets: Map<string, Preset>,
  recoveryCaps: RecoveryCapContext,
) {
  const item = template.items[itemIndex];
  if (!item || item.sets >= 12) return false;
  if (template.items.reduce((sum, candidate) => sum + candidate.sets, 0) >= constraints.maxWorkingSetsPerSession) return false;
  const nextItems = template.items.map((candidate, index) => index === itemIndex
    ? withWorkingSets(candidate, candidate.sets + 1)
    : candidate);
  if (estimateTemplateMinutes(nextItems, presets) > constraints.maxSessionMinutes) return false;
  const addedByRecoveryGroup = new Map<string, { group: ReturnType<typeof recoveryGroupFor>; weight: number }>();
  for (const contribution of directContributions(item, itemPreset(item, presets))) {
    const group = recoveryGroupFor(contribution.muscle);
    const current = addedByRecoveryGroup.get(group.key);
    addedByRecoveryGroup.set(group.key, { group, weight: (current?.weight ?? 0) + contribution.weight });
  }
  if (!addedByRecoveryGroup.size || itemMuscleWeight(item, muscle, presets) <= 0) return false;
  return [...addedByRecoveryGroup.values()].every(({ group, weight }) => (
    templateDirectSets(template, group.muscles, presets) + weight <= recoveryCapFor(group, recoveryCaps) + 0.001
  ));
}

function adjustMusclePriorities(
  data: AppData,
  policy: TrainingPolicy,
  templates: MutableTemplate[],
  usage: Map<string, number>,
  presets: Map<string, Preset>,
  constraints: ReturnType<typeof compileTrainingConstraints>,
  recoveryCaps: RecoveryCapContext,
  warnings: string[],
) {
  const cycleDays = planningCycleDays(data);
  const cycleScale = cycleDays / 7;
  const currentTotals = cycleMuscleSets(templates, usage, presets);
  const increases = (Object.entries(policy.musclePriorities) as Array<[MuscleGroup, NonNullable<TrainingPolicy["musclePriorities"][MuscleGroup]>]>)
    .filter(([, priority]) => priority === "specialize" || priority === "grow")
    .map(([muscle, priority]) => {
      const target = data.muscleTargets?.[muscle] ?? weeklyTargetFor(muscle, data.profile?.trainingLevel);
      return {
        muscle,
        priority,
        desired: Math.max(1, Math.round(target.low * cycleScale * musclePriorityMultiplier(priority))),
        current: currentTotals[muscle] ?? 0,
      };
    });
  const templateAdditions = new Map<string, number>();
  const touchedItems = new Set<string>();
  const maxRounds = increases.some((state) => state.priority === "specialize") ? 2 : 1;

  // Give every requested recovery family one conservative pass before a
  // specialization receives a second set. Broad goals such as chest or
  // shoulders must not consume the whole session before another goal is seen.
  for (let round = 0; round < maxRounds; round += 1) {
    const recoveryGroupsTouchedThisRound = new Set<string>();
    for (const state of increases) {
      if (round > 0 && state.priority !== "specialize") continue;
      if (state.current >= state.desired) continue;
      const recoveryKey = recoveryGroupFor(state.muscle).key;
      if (recoveryGroupsTouchedThisRound.has(recoveryKey)) continue;
      const candidates = templates.flatMap((template) => template.items.map((item, index) => ({ template, item, index })))
        .filter(({ item }) => itemMuscleWeight(item, state.muscle, presets) > 0)
        .filter(({ item }) => !constraints.avoidedExerciseIds.has(item.exerciseId))
        .filter(({ template, item }) => !touchedItems.has(`${template.source.id}:${item.exerciseId}`))
        .filter(({ template }) => (templateAdditions.get(template.source.id) ?? 0) < MAX_PRIORITY_ADDITIONS_PER_TEMPLATE)
        .filter(({ template, index }) => canAddPrioritySet(template, index, state.muscle, constraints, presets, recoveryCaps))
        .sort((a, b) => {
          const recovery = recoveryGroupFor(state.muscle);
          const loadDelta = templateDirectSets(a.template, recovery.muscles, presets) - templateDirectSets(b.template, recovery.muscles, presets);
          if (loadDelta) return loadDelta;
          const aPreset = itemPreset(a.item, presets);
          const bPreset = itemPreset(b.item, presets);
          const aScore = exercisePreferenceScore(aPreset ?? { id: a.item.exerciseId }, constraints) + (a.item.isMain ?? aPreset?.isMain ? 2 : 0);
          const bScore = exercisePreferenceScore(bPreset ?? { id: b.item.exerciseId }, constraints) + (b.item.isMain ?? bPreset?.isMain ? 2 : 0);
          return bScore - aScore || a.index - b.index;
        });
      const candidate = candidates[0];
      if (!candidate) continue;
      const nextSets = candidate.item.sets + 1;
      candidate.template.items[candidate.index] = withWorkingSets(candidate.item, nextSets);
      candidate.template.reasons.add(`${MUSCLE_LABELS[state.muscle]}：${state.priority === "specialize" ? "专项" : "增长"}，按 ${cycleDays} 天微周期增加 1 组`);
      touchedItems.add(`${candidate.template.source.id}:${candidate.item.exerciseId}`);
      templateAdditions.set(candidate.template.source.id, (templateAdditions.get(candidate.template.source.id) ?? 0) + 1);
      recoveryGroupsTouchedThisRound.add(recoveryKey);
      state.current += itemMuscleWeight(candidate.item, state.muscle, presets) * (usage.get(candidate.template.source.id) ?? 1);
    }
  }

  for (const state of increases) {
    if (state.current + 0.001 >= state.desired) continue;
    warnings.push(`${MUSCLE_LABELS[state.muscle]}目标按 ${cycleDays} 天微周期折算为 ${state.desired} 组；受单次恢复和总时长边界限制，不把剩余缺口集中堆到一天。`);
  }

  for (const [muscle, priority] of Object.entries(policy.musclePriorities) as Array<[MuscleGroup, NonNullable<TrainingPolicy["musclePriorities"][MuscleGroup]>]>) {
    if (priority === "specialize" || priority === "grow") continue;
    const target = data.muscleTargets?.[muscle] ?? weeklyTargetFor(muscle, data.profile?.trainingLevel);
    const desired = Math.max(1, Math.round(target.low * cycleScale * musclePriorityMultiplier(priority)));
    let current = cycleMuscleSets(templates, usage, presets)[muscle] ?? 0;
    const reductionBudget = priority === "maintain" ? 1 : 2;
    if (current <= desired) continue;
    const candidates = templates.flatMap((template) => template.items.map((item, index) => ({ template, item, index })))
      .filter(({ item }) => itemMuscleWeight(item, muscle, presets) > 0 && item.sets > 2)
      .sort((a, b) => {
        const aPreset = itemPreset(a.item, presets);
        const bPreset = itemPreset(b.item, presets);
        const aMain = a.item.isMain ?? aPreset?.isMain ?? false;
        const bMain = b.item.isMain ?? bPreset?.isMain ?? false;
        return Number(aMain) - Number(bMain) || b.item.sets - a.item.sets;
      });
    for (const candidate of candidates.slice(0, reductionBudget)) {
      if (current <= desired) break;
      candidate.template.items[candidate.index] = withWorkingSets(candidate.item, candidate.item.sets - 1);
      candidate.template.reasons.add(`${MUSCLE_LABELS[muscle]}：${priority === "maintain" ? "维持" : "降低"}，按 ${cycleDays} 天微周期减少 1 组`);
      current -= itemMuscleWeight(candidate.item, muscle, presets) * (usage.get(candidate.template.source.id) ?? 1);
    }
  }
}

function enforceSessionCaps(
  template: MutableTemplate,
  constraints: ReturnType<typeof compileTrainingConstraints>,
  presets: Map<string, Preset>,
) {
  const setCount = () => template.items.reduce((sum, item) => sum + item.sets, 0);
  const exceedsWorkOrTimeCap = () => (
    setCount() > constraints.maxWorkingSetsPerSession
    || estimateTemplateMinutes(template.items, presets) > constraints.maxSessionMinutes
  );
  const lowValueIndex = () => template.items
    .map((item, index) => ({ item, index, preset: itemPreset(item, presets) }))
    .sort((a, b) => {
      const aMain = a.item.isMain ?? a.preset?.isMain ?? false;
      const bMain = b.item.isMain ?? b.preset?.isMain ?? false;
      const aScore = exercisePreferenceScore(a.preset ?? { id: a.item.exerciseId }, constraints);
      const bScore = exercisePreferenceScore(b.preset ?? { id: b.item.exerciseId }, constraints);
      return Number(aMain) - Number(bMain) || aScore - bScore || b.index - a.index;
    })[0]?.index;

  while (template.items.length > constraints.maxExercisesPerSession) {
    const index = lowValueIndex();
    if (index == null) break;
    const [removed] = template.items.splice(index, 1);
    template.removed += 1;
    template.reasons.add(`动作数超过 ${constraints.maxExercisesPerSession}，移除低优先级动作 ${removed.name}`);
  }

  let guard = 0;
  while (
    guard < 80
    && exceedsWorkOrTimeCap()
  ) {
    guard += 1;
    const candidates = template.items
      .map((item, index) => ({ item, index, preset: itemPreset(item, presets) }))
      .filter(({ item }) => item.sets > 1)
      .sort((a, b) => {
        const aMain = a.item.isMain ?? a.preset?.isMain ?? false;
        const bMain = b.item.isMain ?? b.preset?.isMain ?? false;
        const aScore = exercisePreferenceScore(a.preset ?? { id: a.item.exerciseId }, constraints);
        const bScore = exercisePreferenceScore(b.preset ?? { id: b.item.exerciseId }, constraints);
        return Number(aMain) - Number(bMain) || aScore - bScore || b.item.sets - a.item.sets;
      });
    const candidate = candidates[0];
    if (!candidate) break;
    const nextSets = candidate.item.sets - 1;
    template.items[candidate.index] = {
      ...candidate.item,
      sets: nextSets,
      ...(candidate.item.prescription ? { prescription: { ...candidate.item.prescription, workingSets: nextSets } } : {}),
    };
    template.reasons.add(`控制在 ${constraints.maxSessionMinutes} 分钟 / ${constraints.maxWorkingSetsPerSession} 组以内`);
  }

  // A one-set floor can still violate a hard session cap when the template has
  // many movements. Remove the lowest-value movement instead of claiming the
  // unchanged template satisfies the user's explicit limit.
  guard = 0;
  while (guard < 80 && template.items.length > 1 && exceedsWorkOrTimeCap()) {
    guard += 1;
    const index = lowValueIndex();
    if (index == null) break;
    const [removed] = template.items.splice(index, 1);
    template.removed += 1;
    template.reasons.add(`单次上限仍超出，移除低优先级动作 ${removed.name}，控制在 ${constraints.maxSessionMinutes} 分钟 / ${constraints.maxWorkingSetsPerSession} 组以内`);
  }
}

function sameItems(left: TemplateItem[], right: TemplateItem[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function muscleDelta(before: Partial<Record<MuscleGroup, number>>, after: Partial<Record<MuscleGroup, number>>) {
  const result: Partial<Record<MuscleGroup, number>> = {};
  const muscles = new Set<MuscleGroup>([...Object.keys(before), ...Object.keys(after)] as MuscleGroup[]);
  for (const muscle of muscles) {
    const delta = Math.round(((after[muscle] ?? 0) - (before[muscle] ?? 0)) * 10) / 10;
    if (delta) result[muscle] = delta;
  }
  return result;
}

export function buildPlanAdaptation(
  data: AppData,
  policy: TrainingPolicy,
  date: string,
  trigger: PlanAdaptationTrigger = "userRequested",
): PlanAdaptationProposal {
  const createdAt = new Date().toISOString();
  const sourceRevision = fingerprintTemplates(data, policy);
  const constraints = compileTrainingConstraints(policy, date);
  const presets = new Map<string, Preset>([...DEFAULT_EXERCISES, ...data.customExercises].map((preset) => [preset.id, preset]));
  const templates: MutableTemplate[] = (data.templates ?? []).map((template) => ({
    source: template,
    items: cloneItems(template.items),
    reasons: new Set<string>(),
    replaced: 0,
    removed: 0,
  }));
  const warnings: string[] = [];

  for (const template of templates) {
    for (let index = 0; index < template.items.length; index += 1) {
      const item = template.items[index];
      const preset = itemPreset(item, presets) ?? ({
        id: item.exerciseId,
        name: item.name,
        type: template.source.type,
        isMain: Boolean(item.isMain),
        equipment: item.equipment,
        movementPattern: item.movementPattern,
        primaryMuscle: item.primaryMuscle,
        alternatives: item.alternatives,
      } as ExercisePreset);
      const violations = exerciseConstraintViolations(preset, constraints);
      if (!violations.length) continue;
      const replacement = replacementCandidates(template, item, presets, constraints)[0];
      if (replacement) {
        template.items[index] = replacementItem(item, replacement);
        template.replaced += 1;
        template.reasons.add(`${item.name} 因${violations.join("、")}替换为 ${replacement.name}`);
        continue;
      }
      const isMain = item.isMain ?? preset.isMain;
      if (!isMain) {
        template.items.splice(index, 1);
        index -= 1;
        template.removed += 1;
        template.reasons.add(`${item.name} 因${violations.join("、")}且无合适替代，已从未来模板移除`);
      } else {
        warnings.push(`${template.source.name} 的主项 ${item.name} 违反约束，但没有找到同肌群/同模式替代动作；未自动删除。`);
      }
    }
  }

  const usage = templateUsage(data);
  const recoveryCaps = buildRecoveryCapContext(templates, usage, presets, planningCycleDays(data));
  const beforeMuscles = cycleMuscleSets(templates.map((template) => ({ ...template, items: cloneItems(template.source.items) })), usage, presets);
  for (const template of templates) {
    enforceRecoveryCaps(template, policy, presets, constraints, recoveryCaps, warnings);
    enforceSessionCaps(template, constraints, presets);
  }
  adjustMusclePriorities(data, policy, templates, usage, presets, constraints, recoveryCaps, warnings);
  for (const template of templates) enforceRecoveryCaps(template, policy, presets, constraints, recoveryCaps, warnings);
  const afterMuscles = cycleMuscleSets(templates, usage, presets);

  const changes: TemplatePlanChange[] = templates.flatMap((template) => {
    if (sameItems(template.source.items, template.items)) return [];
    return [{
      templateId: template.source.id,
      templateName: template.source.name,
      previousItems: cloneItems(template.source.items),
      nextItems: cloneItems(template.items),
      reasons: [...template.reasons],
      estimatedMinutesBefore: estimateTemplateMinutes(template.source.items, presets),
      estimatedMinutesAfter: estimateTemplateMinutes(template.items, presets),
    }];
  });

  const estimatedMinutesBefore = changes.reduce((sum, change) => sum + change.estimatedMinutesBefore, 0);
  const estimatedMinutesAfter = changes.reduce((sum, change) => sum + change.estimatedMinutesAfter, 0);
  const setDelta = changes.reduce((sum, change) => (
    sum + change.nextItems.reduce((total, item) => total + item.sets, 0) - change.previousItems.reduce((total, item) => total + item.sets, 0)
  ), 0);
  const replacedExercises = templates.reduce((sum, template) => sum + template.replaced, 0);
  const removedExercises = templates.reduce((sum, template) => sum + template.removed, 0);
  const cycleDays = planningCycleDays(data);
  const scheduledTrainingDays = planningSteps(data)
    ?.filter((step) => step.type !== "rest").length
    ?? data.schedule.split.filter((type) => type && type !== "rest").length;
  const weeklyEquivalent = Math.round(scheduledTrainingDays * 7 / Math.max(1, cycleDays) * 10) / 10;
  if (weeklyEquivalent < policy.weeklyTrainingDays.minimum || weeklyEquivalent > policy.weeklyTrainingDays.maximum) {
    warnings.push(`当前 ${cycleDays} 天微周期含 ${scheduledTrainingDays} 个训练日（约每 7 天 ${weeklyEquivalent} 次），与设定的每 7 天 ${policy.weeklyTrainingDays.minimum}–${policy.weeklyTrainingDays.maximum} 次不一致；分化只在日程提案中调整。`);
  }
  if (!changes.length) warnings.push("当前模板已经满足已识别的动作、器械、肌群容量和单次时长约束。频率与分化结构仍需在计划页手动确认。");

  const reasons = [...new Set(changes.flatMap((change) => change.reasons))];
  return {
    id: `adaptation:${sourceRevision}:${createdAt}`,
    createdAt,
    trigger,
    scope: "nextMicrocycle",
    sourceRevision,
    confidence: reasons.some((reason) => reason.includes("排除") || reason.includes("器械")) ? "explicit" : changes.length ? "high" : "medium",
    summary: changes.length
      ? `建议调整 ${changes.length} 个模板：${replacedExercises} 个动作替换，${removedExercises} 个动作移除，工作组净变化 ${setDelta > 0 ? "+" : ""}${setDelta}。`
      : "没有发现必须修改的模板。",
    reasons,
    evidence: [
      `目标：${policy.goal}`,
      `处方按 ${planningCycleDays(data)} 天微周期折算，优先肌群不会把周期缺口集中堆到单次训练`,
      `单次上限：${constraints.maxSessionMinutes} 分钟 / ${constraints.maxWorkingSetsPerSession} 组 / ${constraints.maxExercisesPerSession} 动作`,
      `每周训练目标：${policy.weeklyTrainingDays.target} 天`,
      `明确排除动作：${constraints.excludedExerciseIds.size} 个`,
      `不可用器械：${constraints.unavailableEquipment.size} 类`,
    ],
    changes,
    impact: {
      changedTemplates: changes.length,
      replacedExercises,
      removedExercises,
      setDelta,
      estimatedMinutesBefore,
      estimatedMinutesAfter,
      muscleSetDelta: muscleDelta(beforeMuscles, afterMuscles),
    },
    warnings,
  };
}

export function applyPlanAdaptation(data: AppData, policy: TrainingPolicy, proposal: PlanAdaptationProposal): ApplyPlanAdaptationResult {
  if (!proposal.changes.length) return { applied: false, reason: "empty", data };
  if (proposal.sourceRevision !== fingerprintTemplates(data, policy)) return { applied: false, reason: "stale", data };
  const changes = new Map(proposal.changes.map((change) => [change.templateId, change]));
  const templates = data.templates?.map((template) => {
    const change = changes.get(template.id);
    if (!change) return template;
    if (!sameItems(template.items, change.previousItems)) return template;
    return { ...template, items: cloneItems(change.nextItems) };
  });
  return { applied: true, data: { ...data, templates } };
}
