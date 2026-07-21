import type {
  DayLog,
  Exercise,
  ExercisePreset,
  PerformanceMode,
  ProgressionPrescription,
  SessionDifficulty,
  SetRecord,
  TemplateItem,
  TrainingIntent,
  TrainingType,
} from "./types";
import { progressionSets, workingSets } from "./trainingMetrics";

export { hasSetPerformance, progressionSets, workingSets } from "./trainingMetrics";

export type TrackHistoryKind = "same" | "other" | "legacy";

export interface TrackHistoryResult {
  date: string;
  exercise: Exercise;
  sets: SetRecord[];
  kind: TrackHistoryKind;
  sessionDifficulty?: SessionDifficulty;
  implicitCompletion?: boolean;
}

export interface ProgressionSuggestion {
  nextWeight: number | null;
  status: "addWeight" | "addReps" | "stabilize" | "effortCheck" | "finishSets" | "noHistory" | "modeReference" | "manualProgression" | "mixedLoads" | "missingLoad" | "unconfirmedHistory";
  message: string;
  condition: string;
}

export interface TrackHistoryCollection {
  same: TrackHistoryResult[];
  other: TrackHistoryResult[];
  legacy: TrackHistoryResult[];
}

export interface TrackTrend {
  status: "insufficient" | "improving" | "stable" | "plateau" | "regressing";
  sessionCount: number;
  metricKind: "e1rm" | "reps" | "duration" | "distance" | null;
  latestValue: number | null;
  previousValue: number | null;
  latestE1rm: number | null;
  previousE1rm: number | null;
  changePct: number | null;
  message: string;
}

export interface TrackPerformanceMetric {
  kind: Exclude<TrackTrend["metricKind"], null>;
  value: number;
  set: SetRecord;
}

export interface ExerciseTrackTrendSummary {
  key: string;
  exerciseId: string;
  exerciseName: string;
  trackId: string;
  trackLabel: string;
  latestDate: string;
  histories: TrackHistoryResult[];
  trend: TrackTrend;
}

const INTENT_LABEL: Record<TrainingIntent, string> = {
  strength: "力量",
  hypertrophy: "增肌",
  endurance: "耐力",
  custom: "自定义",
};

function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export function inferIntent(repsLow: number, repsHigh: number): TrainingIntent {
  if (repsHigh <= 6) return "strength";
  if (repsLow >= 13) return "endurance";
  return "hypertrophy";
}

export function intentLabel(intent: TrainingIntent) {
  return INTENT_LABEL[intent] ?? intent;
}

export function defaultTrackId(
  exerciseId: string,
  intent: TrainingIntent,
  repsLow?: number,
  repsHigh?: number,
  workingSets?: number,
  performanceMode: PerformanceMode = "reps"
) {
  const suffix =
    repsLow != null && repsHigh != null && workingSets != null
      ? `${performanceMode === "reps" ? "" : `${performanceMode}-`}${intent}-${workingSets}x${repsLow}-${repsHigh}`
      : intent;
  return `${cleanId(exerciseId)}-${suffix}`;
}

export function performanceModeFor(recordModes: ExercisePreset["recordModes"] | Exercise["recordModes"]): PerformanceMode {
  if (recordModes?.includes("duration") && !recordModes.includes("reps")) return "duration";
  if (recordModes?.includes("distance") && !recordModes.includes("reps")) return "distance";
  return "reps";
}

export function performanceValue(set: SetRecord, mode: PerformanceMode = "reps") {
  if (mode === "duration") return Math.max(0, set.durationSeconds ?? 0);
  if (mode === "distance") return Math.max(0, set.distanceMeters ?? 0);
  return Math.max(0, set.reps ?? 0);
}

export function legacyTrackId(exerciseId: string) {
  return `legacy:${exerciseId}`;
}

export function prescriptionFromTemplateItem(
  item: TemplateItem,
  preset?: ExercisePreset
): ProgressionPrescription {
  const performanceMode = item.prescription?.performanceMode ?? performanceModeFor(item.recordModes ?? preset?.recordModes);
  const intent = item.trainingIntent ?? item.prescription?.trainingIntent ?? inferIntent(item.repsLow, item.repsHigh);
  const increment = item.loadIncrementKg ?? item.prescription?.loadIncrementKg ?? preset?.defaultLoadIncrementKg ?? (preset?.equipment === "bodyweight" ? 0 : 2.5);
  const nestedDefinitionChanged = Boolean(item.prescription && (
    item.prescription.targetRepMin !== item.repsLow ||
    item.prescription.targetRepMax !== item.repsHigh ||
    item.prescription.workingSets !== item.sets ||
    item.prescription.trainingIntent !== intent ||
    (item.prescription.performanceMode ?? "reps") !== performanceMode
  ));
  const trackId = !nestedDefinitionChanged
    ? item.progressionTrackId ?? item.prescription?.progressionTrackId ?? defaultTrackId(item.exerciseId, intent, item.repsLow, item.repsHigh, item.sets, performanceMode)
    : defaultTrackId(item.exerciseId, intent, item.repsLow, item.repsHigh, item.sets, performanceMode);
  const unit = performanceMode === "duration" ? "秒" : performanceMode === "distance" ? "米" : "次";
  return {
    progressionTrackId: trackId,
    progressionTrackLabel:
      !nestedDefinitionChanged
        ? item.progressionTrackLabel ?? item.prescription?.progressionTrackLabel ?? `${intentLabel(intent)} · ${item.repsLow}–${item.repsHigh} ${unit}`
        : `${performanceMode === "reps" ? intentLabel(intent) : performanceMode === "duration" ? "时长" : "距离"} · ${item.repsLow}–${item.repsHigh} ${unit}`,
    trainingIntent: intent,
    targetRepMin: item.repsLow,
    targetRepMax: item.repsHigh,
    targetRirMin: item.targetRirMin ?? item.prescription?.targetRirMin ?? (item.rpe ? Math.max(0, Math.round(10 - item.rpe)) : 1),
    targetRirMax: item.targetRirMax ?? item.prescription?.targetRirMax ?? 2,
    workingSets: item.sets,
    loadIncrementKg: increment,
    progressionRule: item.progressionRule ?? item.prescription?.progressionRule ?? "doubleProgression",
    performanceMode,
  };
}

export function prescriptionForPreset(
  preset: ExercisePreset,
  type: TrainingType,
  intentOverride?: TrainingIntent,
  context?: ProgressionPrescription
): ProgressionPrescription {
  const performanceMode = performanceModeFor(preset.recordModes);
  if (context && (context.performanceMode ?? "reps") === performanceMode) {
    return {
      ...context,
      progressionTrackId: defaultTrackId(
        preset.id,
        context.trainingIntent,
        context.targetRepMin,
        context.targetRepMax,
        context.workingSets,
        performanceMode
      ),
    };
  }
  const intent: TrainingIntent = performanceMode !== "reps" ? "custom" : intentOverride ?? (type === "custom" ? "custom" : "hypertrophy");
  const reps = performanceMode === "duration" ? [30, 60] : performanceMode === "distance" ? [20, 50] : intent === "strength" ? [4, 6] : intent === "endurance" ? [13, 20] : intent === "custom" ? [10, 15] : [8, 12];
  const workingSets = intent === "strength" ? 4 : 3;
  const unit = performanceMode === "duration" ? "秒" : performanceMode === "distance" ? "米" : "次";
  return {
    progressionTrackId: defaultTrackId(preset.id, intent, reps[0], reps[1], workingSets, performanceMode),
    progressionTrackLabel: `${performanceMode === "reps" ? intentLabel(intent) : performanceMode === "duration" ? "时长" : "距离"} · ${reps[0]}–${reps[1]} ${unit}`,
    trainingIntent: intent,
    targetRepMin: reps[0],
    targetRepMax: reps[1],
    targetRirMin: 1,
    targetRirMax: 2,
    workingSets,
    loadIncrementKg: preset.defaultLoadIncrementKg ?? (preset.equipment === "bodyweight" ? 0 : 2.5),
    progressionRule: "doubleProgression",
    performanceMode,
  };
}

export function applyPrescriptionSnapshot(
  exercise: Omit<Exercise, "sets"> & { sets?: SetRecord[] },
  prescription: ProgressionPrescription
): Exercise {
  const {
    planned: _planned,
    basePlannedSets: _basePlannedSets,
    progressionTrackId: _progressionTrackId,
    progressionTrackLabel: _progressionTrackLabel,
    trainingIntent: _trainingIntent,
    targetRepMin: _targetRepMin,
    targetRepMax: _targetRepMax,
    targetRirMin: _targetRirMin,
    targetRirMax: _targetRirMax,
    workingSets: _workingSets,
    loadIncrementKg: _loadIncrementKg,
    progressionRule: _progressionRule,
    ...canonical
  } = exercise;
  return {
    ...canonical,
    sets: exercise.sets ?? [],
    prescription,
  };
}

export function exercisePrescription(exercise: Exercise): ProgressionPrescription {
  const mode = exercise.prescription?.performanceMode ?? performanceModeFor(exercise.recordModes);
  if (exercise.prescription) {
    return { ...exercise.prescription, performanceMode: mode };
  }
  const trackId = exercise.progressionTrackId ?? legacyTrackId(exercise.id);
  const intent = exercise.trainingIntent ?? "custom";
  const targetRepMin = Math.max(1, Math.round(exercise.targetRepMin ?? exercise.planned?.repsLow ?? 8));
  const targetRepMax = Math.max(targetRepMin, Math.round(exercise.targetRepMax ?? exercise.planned?.repsHigh ?? 12));
  return {
    progressionTrackId: trackId,
    progressionTrackLabel: exercise.progressionTrackLabel ?? (trackId.startsWith("legacy:") ? "旧记录参考" : `${intentLabel(intent)} · ${targetRepMin}–${targetRepMax} 次`),
    trainingIntent: intent,
    targetRepMin,
    targetRepMax,
    ...(typeof exercise.targetRirMin === "number" ? { targetRirMin: exercise.targetRirMin } : {}),
    ...(typeof exercise.targetRirMax === "number" ? { targetRirMax: exercise.targetRirMax } : {}),
    workingSets: Math.max(
      1,
      Math.round((exercise.workingSets ?? exercise.planned?.sets ?? workingSets(exercise.sets).length) || 1)
    ),
    loadIncrementKg: Math.max(0, exercise.loadIncrementKg ?? (trackId.startsWith("legacy:") ? 0 : 2.5)),
    progressionRule: exercise.progressionRule ?? (trackId.startsWith("legacy:") ? "custom" : "doubleProgression"),
    performanceMode: mode,
  };
}

export function exerciseTrackId(exercise: Exercise) {
  return exercisePrescription(exercise).progressionTrackId;
}

export function exerciseTrackLabel(exercise: Exercise) {
  return exercisePrescription(exercise).progressionTrackLabel;
}

export function normalizeExercisePrescription(exercise: Exercise): Exercise {
  return applyPrescriptionSnapshot(exercise, exercisePrescription(exercise));
}

export function normalizeTemplateItemPrescription(
  item: TemplateItem,
  preset?: ExercisePreset
): TemplateItem {
  const prescription = prescriptionFromTemplateItem(item, preset);
  const {
    progressionTrackId: _progressionTrackId,
    progressionTrackLabel: _progressionTrackLabel,
    trainingIntent: _trainingIntent,
    targetRirMin: _targetRirMin,
    targetRirMax: _targetRirMax,
    loadIncrementKg: _loadIncrementKg,
    progressionRule: _progressionRule,
    ...canonical
  } = item;
  const secondaryMuscles = item.secondaryMuscles ?? preset?.secondaryMuscles;
  const volumeContributions = item.volumeContributions ?? preset?.volumeContributions;
  const alternatives = item.alternatives ?? preset?.alternatives;
  const recordModes = item.recordModes ?? preset?.recordModes;
  return {
    ...canonical,
    name: item.name.trim() || preset?.name || "动作",
    isMain: item.isMain ?? preset?.isMain ?? false,
    ...(item.primaryMuscle ?? preset?.primaryMuscle ? { primaryMuscle: item.primaryMuscle ?? preset?.primaryMuscle } : {}),
    ...(secondaryMuscles?.length ? { secondaryMuscles: [...secondaryMuscles] } : {}),
    ...(volumeContributions?.length ? { volumeContributions: volumeContributions.map((entry) => ({ ...entry })) } : {}),
    ...(item.equipment ?? preset?.equipment ? { equipment: item.equipment ?? preset?.equipment } : {}),
    ...(item.movementPattern ?? preset?.movementPattern ? { movementPattern: item.movementPattern ?? preset?.movementPattern } : {}),
    ...(alternatives?.length ? { alternatives: [...alternatives] } : {}),
    ...(recordModes?.length ? { recordModes: [...recordModes] } : {}),
    prescription,
  };
}

export function lastValidWorkingSet(sets: SetRecord[]) {
  const list = workingSets(sets);
  return list.at(-1) ?? null;
}

export function lastProgressionSet(sets: SetRecord[]) {
  const list = progressionSets(sets);
  return list.at(-1) ?? null;
}

export function bestSet(sets: SetRecord[]) {
  const list = progressionSets(sets);
  if (!list.length) return null;
  return list.reduce((winner, set) => {
    const current = estimatedOneRepMax(set) ?? set.durationSeconds ?? set.distanceMeters ?? set.reps;
    const previous = estimatedOneRepMax(winner) ?? winner.durationSeconds ?? winner.distanceMeters ?? winner.reps;
    return current > previous ? set : winner;
  }, list[0]);
}

export function findTrackHistories(
  days: Record<string, DayLog>,
  exerciseId: string,
  beforeDate: string,
  progressionTrackId?: string,
  limit = 8
): TrackHistoryCollection {
  const dates = Object.keys(days).filter((date) => date < beforeDate).sort().reverse();
  const confirmed: TrackHistoryCollection = { same: [], other: [], legacy: [] };
  const fallback: TrackHistoryCollection = { same: [], other: [], legacy: [] };

  for (const date of dates) {
    const workout = days[date].workout;
    if (!workout || workout.type === "rest") continue;
    const exercise = workout.exercises.find((item) => item.id === exerciseId && workingSets(item.sets).length > 0);
    if (!exercise) continue;
    const normalized = normalizeExercisePrescription(exercise);
    const track = exerciseTrackId(normalized);
    const target = workout.done === false ? fallback : confirmed;
    const row: TrackHistoryResult = {
      date,
      exercise: normalized,
      sets: workingSets(normalized.sets),
      kind: "other",
      sessionDifficulty: workout.difficulty,
      implicitCompletion: workout.done === false ? true : undefined,
    };
    if (progressionTrackId && track === progressionTrackId) {
      if (target.same.length < limit) target.same.push({ ...row, kind: "same" });
    } else if (track?.startsWith("legacy:")) {
      if (target.legacy.length < limit) target.legacy.push({ ...row, kind: "legacy" });
    } else if (track !== progressionTrackId) {
      if (target.other.length < limit) target.other.push(row);
    }
  }

  return {
    same: [...confirmed.same, ...fallback.same].slice(0, limit),
    other: [...confirmed.other, ...fallback.other].slice(0, limit),
    legacy: [...confirmed.legacy, ...fallback.legacy].slice(0, limit),
  };
}

export function findTrackHistory(
  days: Record<string, DayLog>,
  exerciseId: string,
  beforeDate: string,
  progressionTrackId?: string
): {
  same: TrackHistoryResult | null;
  other: TrackHistoryResult | null;
  legacy: TrackHistoryResult | null;
} {
  const history = findTrackHistories(days, exerciseId, beforeDate, progressionTrackId, 1);
  return { same: history.same[0] ?? null, other: history.other[0] ?? null, legacy: history.legacy[0] ?? null };
}

export function estimatedOneRepMax(set: SetRecord) {
  if (set.weight <= 0 || set.reps <= 0) return null;
  return +(set.weight * (1 + Math.min(set.reps, 15) / 30)).toFixed(1);
}

export function trackPerformanceMetric(history: TrackHistoryResult): TrackPerformanceMetric | null {
  const sets = progressionSets(history.sets);
  if (!sets.length) return null;
  const mode = exercisePrescription(history.exercise).performanceMode ?? performanceModeFor(history.exercise.recordModes);
  if (mode === "duration") {
    const set = sets.reduce((winner, current) => (current.durationSeconds ?? 0) > (winner.durationSeconds ?? 0) ? current : winner);
    return (set.durationSeconds ?? 0) > 0 ? { kind: "duration", value: set.durationSeconds!, set } : null;
  }
  if (mode === "distance") {
    const set = sets.reduce((winner, current) => (current.distanceMeters ?? 0) > (winner.distanceMeters ?? 0) ? current : winner);
    return (set.distanceMeters ?? 0) > 0 ? { kind: "distance", value: set.distanceMeters!, set } : null;
  }
  const weighted = sets
    .map((set) => ({ set, value: estimatedOneRepMax(set) }))
    .filter((item): item is { set: SetRecord; value: number } => item.value != null);
  if (weighted.length) {
    const best = weighted.reduce((winner, current) => current.value > winner.value ? current : winner);
    return { kind: "e1rm", value: best.value, set: best.set };
  }
  const set = sets.reduce((winner, current) => current.reps > winner.reps ? current : winner);
  return set.reps > 0 ? { kind: "reps", value: set.reps, set } : null;
}

export function analyzeTrackTrend(histories: TrackHistoryResult[]): TrackTrend {
  const measured = histories
    .filter((history) => !history.implicitCompletion)
    .map((history) => ({ history, metric: trackPerformanceMetric(history) }))
    .filter((item): item is { history: TrackHistoryResult; metric: TrackPerformanceMetric } => item.metric != null);
  const metricKind = measured[0]?.metric.kind ?? null;
  const sessions = metricKind ? measured.filter((item) => item.metric.kind === metricKind) : [];
  const latestValue = sessions[0]?.metric.value ?? null;
  const latestE1rm = metricKind === "e1rm" ? latestValue : null;
  if (sessions.length < 2) return {
    status: "insufficient",
    sessionCount: sessions.length,
    metricKind,
    latestValue,
    previousValue: null,
    latestE1rm,
    previousE1rm: null,
    changePct: null,
    message: "至少完成 2 次同轨道训练后判断趋势",
  };
  const latest = sessions[0].metric.value;
  const previous = sessions[1].metric.value;
  const changePct = +(((latest - previous) / Math.max(previous, 1)) * 100).toFixed(1);
  const recent = sessions.slice(0, 3).map((item) => item.metric.value);
  const rangePct = recent.length >= 3 ? ((Math.max(...recent) - Math.min(...recent)) / Math.max(recent[recent.length - 1], 1)) * 100 : null;
  const base = {
    sessionCount: sessions.length,
    metricKind,
    latestValue: latest,
    previousValue: previous,
    latestE1rm: metricKind === "e1rm" ? latest : null,
    previousE1rm: metricKind === "e1rm" ? previous : null,
    changePct,
  };
  if (recent.length >= 3 && recent[0] < recent[1] && recent[1] < recent[2] && changePct <= -2) return { ...base, status: "regressing", message: "连续表现回落，下一次先稳住训练变量并检查恢复" };
  if (recent.length >= 3 && rangePct != null && rangePct <= 1.5) return { ...base, status: "plateau", message: "连续 3 次变化很小，优先补目标表现或调整动作顺序" };
  if (changePct >= 1.5) return { ...base, status: "improving", message: "同轨道表现正在提升，继续当前进度规则" };
  if (changePct <= -2) return { ...base, status: "regressing", message: "本次表现回落，先维持训练变量观察下一次" };
  return { ...base, status: "stable", message: "表现基本稳定，按当前目标继续推进" };
}

export function summarizeExerciseTrackTrends(
  days: Record<string, DayLog>,
  beforeDate: string,
  limit = 6
): ExerciseTrackTrendSummary[] {
  const groups = new Map<string, { exerciseId: string; exerciseName: string; trackId: string; trackLabel: string; histories: TrackHistoryResult[] }>();
  const dates = Object.keys(days).filter((date) => date < beforeDate).sort().reverse();
  for (const date of dates) {
    const workout = days[date].workout;
    if (!workout || workout.type === "rest" || workout.done === false) continue;
    for (const rawExercise of workout.exercises) {
      const sets = workingSets(rawExercise.sets);
      if (!sets.length) continue;
      const exercise = normalizeExercisePrescription(rawExercise);
      const trackId = exerciseTrackId(exercise);
      const key = `${exercise.id}::${trackId}`;
      const group = groups.get(key) ?? {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        trackId,
        trackLabel: exerciseTrackLabel(exercise),
        histories: [],
      };
      if (group.histories.length < 8) group.histories.push({ date, exercise, sets, kind: trackId.startsWith("legacy:") ? "legacy" : "same" });
      groups.set(key, group);
    }
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      exerciseId: group.exerciseId,
      exerciseName: group.exerciseName,
      trackId: group.trackId,
      trackLabel: group.trackLabel,
      latestDate: group.histories[0]?.date ?? "",
      histories: group.histories,
      trend: analyzeTrackTrend(group.histories),
    }))
    .filter((item) => item.trend.sessionCount >= 2)
    .sort((a, b) => b.latestDate.localeCompare(a.latestDate))
    .slice(0, limit);
}

export function progressionSuggestion(
  prescription: ProgressionPrescription | undefined,
  history: TrackHistoryResult | null
): ProgressionSuggestion {
  if (!prescription || !history) {
    return {
      nextWeight: null,
      status: "noHistory",
      message: "当前轨道暂无历史，先记录本次表现",
      condition: "只使用同轨道历史生成建议",
    };
  }
  const mode = prescription.performanceMode ?? performanceModeFor(history.exercise.recordModes);
  if (prescription.progressionRule === "custom") {
    return {
      nextWeight: null,
      status: "modeReference",
      message: "自定义进步轨道只提供同轨道历史参考",
      condition: "由用户手动调整处方目标",
    };
  }
  const sets = progressionSets(history.sets);
  if (!sets.length) {
    return {
      nextWeight: null,
      status: "noHistory",
      message: "当前轨道暂无有效工作组",
      condition: "只使用有效组生成建议",
    };
  }
  if (history.implicitCompletion) {
    const weights = sets.map((set) => Math.round(set.weight * 100) / 100);
    const positiveWeights = weights.filter((weight) => weight > 0);
    const referenceWeight = mode === "reps" && positiveWeights.length === sets.length && new Set(positiveWeights).size === 1
      ? positiveWeights[0]
      : null;
    return {
      nextWeight: referenceWeight,
      status: "unconfirmedHistory",
      message: "上次记录未显式结束，仅保留原负重参考",
      condition: "完成一次同轨道训练后再判断加重",
    };
  }
  const plannedSetCount = prescription.workingSets || sets.length;
  const counted = sets.slice(0, plannedSetCount);
  const values = counted.map((set) => performanceValue(set, mode));
  const allAtTop = counted.length > 0 && values.every((value) => value >= prescription.targetRepMax);
  const belowBottom = values.some((value) => value < prescription.targetRepMin);
  const roundedWeights = counted.map((set) => Math.round(set.weight * 100) / 100);
  const positiveWeights = roundedWeights.filter((weight) => weight > 0);
  const consistentWeight = positiveWeights.length === counted.length && new Set(positiveWeights).size === 1
    ? positiveWeights[0]
    : null;
  if (counted.length < prescription.workingSets) {
    const remaining = prescription.workingSets - counted.length;
    return {
      nextWeight: mode === "reps" ? consistentWeight : null,
      status: "finishSets",
      message: `先完成剩余 ${remaining} 组计划工作组`,
      condition: `完成 ${prescription.workingSets} 个有效工作组后再判断加重`,
    };
  }
  if (mode !== "reps" || prescription.loadIncrementKg <= 0) {
    if (belowBottom) {
      return {
        nextWeight: null,
        status: "stabilize",
        message: "先稳定完成目标下限",
        condition: `所有工作组先达到 ${prescription.targetRepMin}`,
      };
    }
    if (allAtTop) {
      return {
        nextWeight: null,
        status: "manualProgression",
        message: "已经达到当前处方上限",
        condition: "下一步由用户选择更难变式、外部负重或新的处方目标",
      };
    }
    return {
      nextWeight: null,
      status: "addReps",
      message: "保持当前方式，继续补目标表现",
      condition: `所有工作组达到 ${prescription.targetRepMax}`,
    };
  }
  if (positiveWeights.length !== counted.length) {
    return {
      nextWeight: null,
      status: "missingLoad",
      message: "上次计划组缺少完整负重",
      condition: "每个标准工作组记录实际负重后再生成建议",
    };
  }
  if (consistentWeight == null) {
    return {
      nextWeight: null,
      status: "mixedLoads",
      message: "上次计划组使用了不同负重",
      condition: "先明确同一基准负重，再判断是否加重",
    };
  }
  const baseWeight = consistentWeight;
  if (allAtTop && history.sessionDifficulty === "hard") {
    return {
      nextWeight: baseWeight,
      status: "effortCheck",
      message: "次数已达标，但上次整体偏吃力",
      condition: "先用相同重量稳定完成，再决定加重",
    };
  }
  if (allAtTop && prescription.loadIncrementKg > 0) {
    return {
      nextWeight: +(baseWeight + prescription.loadIncrementKg).toFixed(2),
      status: "addWeight",
      message: `下次建议加 ${prescription.loadIncrementKg}kg`,
      condition: `工作组达到 ${prescription.targetRepMax} 次`,
    };
  }
  if (belowBottom) {
    return {
      nextWeight: baseWeight,
      status: "stabilize",
      message: "先稳定完成目标下限",
      condition: `所有工作组先达到 ${prescription.targetRepMin} 次`,
    };
  }
  return {
    nextWeight: baseWeight,
    status: "addReps",
    message: "保持重量，继续补次数",
    condition: `补到 ${prescription.targetRepMax} 次后再加重`,
  };
}
