import type { AppData } from "./storage";
import type { SessionDifficulty, Template, VolumeContribution, WorkoutSession } from "./types";
import { DEFAULT_EXERCISES } from "./exercises";
import { currentCutSnapshot, cutSetPlan, isCutModeActive, suggestedCutVolumeScale } from "./cutMode";
import { activeMicrocyclePattern, currentMicrocycleProgress } from "./microcycle";
import { MUSCLE_ORDER, type MuscleGroup } from "./muscles";
import { summarizeExerciseTrackTrends, type ExerciseTrackTrendSummary } from "./prescription";
import {
  isDecisionEligibleWorkout,
  isPastUnclosedWorkout,
  setStimulusFactor,
  summarizeWorkoutWork,
  workingSets,
} from "./trainingMetrics";
import { computeVolumeSummary, microcycleDays, volumeTargetScale } from "./volume";
import { shiftDate } from "./weight";

export type TrainingAnalysisConfidence = "starter" | "building" | "ready";
export type CycleProjectionStatus = "under" | "in" | "over" | "projectedOver";

export interface PlanAdherenceSummary {
  sessions: number;
  plannedSets: number;
  completedSets: number;
  completionPct: number | null;
  averageMissingSets: number;
}

export interface TemplateAdherenceSummary extends PlanAdherenceSummary {
  templateId: string;
  templateName: string;
  latestDate: string;
}

export interface TrainingLoadSummary {
  sessions7d: number;
  sessions28d: number;
  difficultySamples: number;
  hardSessions: number;
  easySessions: number;
  hardRatio: number | null;
  recentHardStreak: number;
}

export interface PlannedVolumeSource {
  exerciseId: string;
  name: string;
  sets: number;
  templateId?: string;
  templateName?: string;
}

export interface CycleVolumeProjection {
  muscle: MuscleGroup;
  current: number;
  remaining: number;
  projected: number;
  target: { low: number; high: number };
  status: CycleProjectionStatus;
  actualSource?: PlannedVolumeSource;
  plannedSource?: PlannedVolumeSource;
}

export interface RecoveryConstraint {
  active: boolean;
  score: number;
  regressingExercises: number;
  overTargetMuscles: number;
}

export interface UnclosedWorkoutEvidence {
  date: string;
  setCount: number;
}

export interface TrainingAnalysis {
  confidence: TrainingAnalysisConfidence;
  load: TrainingLoadSummary;
  adherence: PlanAdherenceSummary;
  templateAdherence: TemplateAdherenceSummary[];
  weakTemplate: TemplateAdherenceSummary | null;
  trends: ExerciseTrackTrendSummary[];
  improvingTracks: number;
  plateauTracks: number;
  regressingTracks: number;
  recovery: RecoveryConstraint;
  unclosed: UnclosedWorkoutEvidence | null;
  cycle: {
    completed: number;
    total: number;
    ratio: number;
    remainingTrainingSteps: number;
    coveredTrainingSteps: number;
    projectionComplete: boolean;
    rows: CycleVolumeProjection[];
  };
}

interface SessionEvidence {
  date: string;
  workout: WorkoutSession;
  plannedSets: number;
  completedSets: number;
  difficulty?: SessionDifficulty;
  templateId?: string;
  templateName?: string;
}

const round = (value: number) => Math.round(value * 10) / 10;

function confirmedSessions(data: AppData, today: string, windowDays = 28): SessionEvidence[] {
  const start = shiftDate(today, -(windowDays - 1));
  return Object.entries(data.days)
    .filter(([date, day]) => date >= start && date <= today && isDecisionEligibleWorkout(day.workout))
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, day]) => {
      const workout = day.workout!;
      const work = summarizeWorkoutWork(workout);
      const templateId = workout.templateSnapshot?.id ?? workout.templateId;
      const templateName = workout.templateSnapshot?.name
        ?? data.templates?.find((template) => template.id === templateId)?.name;
      return {
        date,
        workout,
        plannedSets: work.plannedSets,
        completedSets: work.completionCredits,
        difficulty: workout.difficulty,
        templateId,
        templateName,
      };
    });
}

function summarizeAdherence(sessions: Array<Pick<SessionEvidence, "plannedSets" | "completedSets">>): PlanAdherenceSummary {
  const plannedSets = sessions.reduce((sum, session) => sum + session.plannedSets, 0);
  const completedSets = round(sessions.reduce((sum, session) => sum + session.completedSets, 0));
  return {
    sessions: sessions.length,
    plannedSets,
    completedSets,
    completionPct: plannedSets ? Math.round((completedSets / plannedSets) * 100) : null,
    averageMissingSets: sessions.length ? round(Math.max(0, plannedSets - completedSets) / sessions.length) : 0,
  };
}

export function recentPlanAdherence(data: AppData, today: string, limit = 4): PlanAdherenceSummary {
  const sessions = confirmedSessions(data, today)
    .filter((session) => session.plannedSets > 0)
    .slice(0, limit);
  return summarizeAdherence(sessions);
}

export function recentTemplateAdherence(data: AppData, today: string, perTemplateLimit = 4): TemplateAdherenceSummary[] {
  const grouped = new Map<string, SessionEvidence[]>();
  for (const session of confirmedSessions(data, today)) {
    if (!session.templateId || !session.plannedSets) continue;
    const group = grouped.get(session.templateId) ?? [];
    if (group.length < perTemplateLimit) group.push(session);
    grouped.set(session.templateId, group);
  }
  return [...grouped.entries()]
    .map(([templateId, sessions]) => ({
      templateId,
      templateName: sessions[0].templateName?.trim() || "未命名模板",
      latestDate: sessions[0].date,
      ...summarizeAdherence(sessions),
    }))
    .sort((a, b) => {
      const aScore = a.completionPct ?? 101;
      const bScore = b.completionPct ?? 101;
      return aScore - bScore || b.sessions - a.sessions || b.latestDate.localeCompare(a.latestDate);
    });
}

function loadSummary(sessions: SessionEvidence[], today: string): TrainingLoadSummary {
  const start7d = shiftDate(today, -6);
  const recent = sessions.slice(0, 6);
  const difficulty = recent.filter((session) => session.difficulty != null);
  const hardSessions = difficulty.filter((session) => session.difficulty === "hard").length;
  const easySessions = difficulty.filter((session) => session.difficulty === "easy").length;
  let recentHardStreak = 0;
  for (const session of recent) {
    if (session.difficulty !== "hard") break;
    recentHardStreak += 1;
  }
  return {
    sessions7d: sessions.filter((session) => session.date >= start7d).length,
    sessions28d: sessions.length,
    difficultySamples: difficulty.length,
    hardSessions,
    easySessions,
    hardRatio: difficulty.length ? round(hardSessions / difficulty.length) : null,
    recentHardStreak,
  };
}

function contributionsFor(
  item: Template["items"][number],
  presets: Map<string, (typeof DEFAULT_EXERCISES)[number] | AppData["customExercises"][number]>,
): VolumeContribution[] {
  const preset = presets.get(item.exerciseId);
  if (item.volumeContributions?.length) return item.volumeContributions;
  if (preset?.volumeContributions?.length) return preset.volumeContributions;
  const primary = item.primaryMuscle ?? preset?.primaryMuscle;
  return primary ? [{ muscle: primary, weight: 1, direct: true }] : [];
}

function workoutContributionsFor(
  exercise: WorkoutSession["exercises"][number],
  presets: Map<string, (typeof DEFAULT_EXERCISES)[number] | AppData["customExercises"][number]>,
): VolumeContribution[] {
  const preset = presets.get(exercise.id);
  if (exercise.volumeContributions?.length) return exercise.volumeContributions;
  if (preset?.volumeContributions?.length) return preset.volumeContributions;
  const primary = exercise.primaryMuscle ?? preset?.primaryMuscle;
  return primary ? [{ muscle: primary, weight: 1, direct: true }] : [];
}

function cycleProjection(data: AppData, today: string) {
  const progress = currentMicrocycleProgress(data, today);
  const pattern = activeMicrocyclePattern(data);
  const cutActive = isCutModeActive(data.cutPlan);
  const cutSnapshot = currentCutSnapshot(data.profile, data.bodyWeights, data.waistEntries);
  const cutScale = cutActive
    ? data.cutPlan?.trainingVolumeScale ?? suggestedCutVolumeScale(cutSnapshot?.bodyFatPercent, data.cutPlan?.weeklyLossPct)
    : 1;
  const targetScale = volumeTargetScale("microcycle", data) * cutScale;
  const cycleDays = microcycleDays(data)
    .filter((day) => day.date <= today && day.workout?.done !== false);
  const current = computeVolumeSummary(
    cycleDays,
    data.profile?.trainingLevel,
    data.muscleTargets,
    targetScale,
  );
  const presets = new Map([...DEFAULT_EXERCISES, ...data.customExercises].map((preset) => [preset.id, preset]));
  const actualSources = new Map<MuscleGroup, Map<string, PlannedVolumeSource>>();
  for (const day of cycleDays) {
    const workout = day.workout;
    const templateId = workout?.templateSnapshot?.id ?? workout?.templateId;
    if (!workout) continue;
    const templateName = workout.templateSnapshot?.name
      ?? data.templates?.find((template) => template.id === templateId)?.name;
    for (const exercise of workout.exercises) {
      const effort = workingSets(exercise.sets)
        .reduce((sum, set) => sum + setStimulusFactor(set), 0);
      if (!effort) continue;
      for (const contribution of workoutContributionsFor(exercise, presets)) {
        if (!contribution.direct) continue;
        const sources = actualSources.get(contribution.muscle) ?? new Map<string, PlannedVolumeSource>();
        const sourceKey = `${templateId ?? "legacy"}::${exercise.id}`;
        const source = sources.get(sourceKey) ?? {
          exerciseId: exercise.id,
          name: exercise.name,
          sets: 0,
          ...(templateId ? { templateId } : {}),
          ...(templateName ? { templateName } : {}),
        };
        source.sets += effort * contribution.weight;
        sources.set(sourceKey, source);
        actualSources.set(contribution.muscle, sources);
      }
    }
  }
  const remaining = new Map<MuscleGroup, number>();
  const plannedSources = new Map<MuscleGroup, Map<string, PlannedVolumeSource>>();
  let remainingTrainingSteps = 0;
  let coveredTrainingSteps = 0;

  for (const step of pattern.slice(progress.completed)) {
    if (step.type === "rest") continue;
    remainingTrainingSteps += 1;
    const template = step.templateSnapshot
      ?? (step.templateId ? data.templates?.find((item) => item.id === step.templateId) : undefined);
    if (!template?.items.length) continue;
    coveredTrainingSteps += 1;
    const allocations = cutActive
      ? cutSetPlan(template.items.map((item) => ({
          id: item.exerciseId,
          sets: item.sets,
          isMain: item.isMain ?? presets.get(item.exerciseId)?.isMain,
        })), cutScale).map((item) => item.cutSets)
      : template.items.map((item) => item.sets);

    template.items.forEach((item, index) => {
      const sets = Math.max(0, allocations[index] ?? item.sets);
      for (const contribution of contributionsFor(item, presets)) {
        if (!contribution.direct) continue;
        const value = sets * contribution.weight;
        remaining.set(contribution.muscle, (remaining.get(contribution.muscle) ?? 0) + value);
        const sources = plannedSources.get(contribution.muscle) ?? new Map<string, PlannedVolumeSource>();
        const sourceKey = `${template.id}::${item.exerciseId}`;
        const source = sources.get(sourceKey) ?? { exerciseId: item.exerciseId, name: item.name, sets: 0, templateId: template.id, templateName: template.name };
        source.sets += value;
        sources.set(sourceKey, source);
        plannedSources.set(contribution.muscle, sources);
      }
    });
  }

  const projectionComplete = coveredTrainingSteps === remainingTrainingSteps;
  const rows = MUSCLE_ORDER.map((muscle): CycleVolumeProjection => {
    const currentRow = current.rows.find((row) => row.muscle === muscle)!;
    const currentSets = currentRow.directEffectiveSets;
    const remainingSets = round(remaining.get(muscle) ?? 0);
    const projected = round(currentSets + remainingSets);
    const actualSource = [...(actualSources.get(muscle)?.values() ?? [])]
      .sort((a, b) => b.sets - a.sets)[0];
    const plannedSource = [...(plannedSources.get(muscle)?.values() ?? [])]
      .sort((a, b) => b.sets - a.sets)[0];
    const status: CycleProjectionStatus = currentSets > currentRow.target.high
      ? "over"
      : projected > currentRow.target.high
        ? "projectedOver"
        : projectionComplete && projected < currentRow.target.low
          ? "under"
          : "in";
    return {
      muscle,
      current: currentSets,
      remaining: remainingSets,
      projected,
      target: currentRow.target,
      status,
      ...(actualSource ? { actualSource: { ...actualSource, sets: round(actualSource.sets) } } : {}),
      ...(plannedSource ? { plannedSource: { ...plannedSource, sets: round(plannedSource.sets) } } : {}),
    };
  });
  const total = pattern.length;
  return {
    completed: progress.completed,
    total,
    ratio: total ? progress.completed / total : 0,
    remainingTrainingSteps,
    coveredTrainingSteps,
    projectionComplete,
    rows,
  };
}

function latestUnclosed(data: AppData, today: string): UnclosedWorkoutEvidence | null {
  const start = shiftDate(today, -27);
  const currentId = data.microcycle?.currentId;
  const match = Object.entries(data.days)
    .filter(([date, day]) => (
      (date >= start || day.workout?.microcycleId === currentId)
      && isPastUnclosedWorkout(day.workout, date, today)
    ))
    .sort(([a], [b]) => b.localeCompare(a))[0];
  if (!match) return null;
  return { date: match[0], setCount: summarizeWorkoutWork(match[1].workout).workingSets };
}

function recoveryConstraint(
  load: TrainingLoadSummary,
  trends: ExerciseTrackTrendSummary[],
  rows: CycleVolumeProjection[],
): RecoveryConstraint {
  const regressingExercises = new Set(
    trends
      .filter((item) => item.trend.status === "regressing" && item.trend.sessionCount >= 3)
      .map((item) => item.exerciseId),
  ).size;
  const overTargetMuscles = rows.filter((row) => row.current > row.target.high && row.current > 0).length;
  let score = 0;
  if (regressingExercises >= 2) score += 2;
  if (load.difficultySamples >= 4 && (load.hardRatio ?? 0) >= 0.5) score += 2;
  if (load.sessions7d >= 5) score += 1;
  if (overTargetMuscles >= 2) score += 1;
  if (load.recentHardStreak >= 2) score += 1;
  return {
    active: score >= 4 && (regressingExercises > 0 || overTargetMuscles > 0),
    score,
    regressingExercises,
    overTargetMuscles,
  };
}

export function buildTrainingAnalysis(data: AppData, today: string): TrainingAnalysis {
  const sessions = confirmedSessions(data, today);
  const load = loadSummary(sessions, today);
  const adherence = recentPlanAdherence(data, today);
  const templateAdherence = recentTemplateAdherence(data, today);
  const editableTemplateIds = new Set((data.templates ?? []).map((template) => template.id));
  const weakTemplate = templateAdherence.find((item) => (
    editableTemplateIds.has(item.templateId)
    &&
    item.sessions >= 2
    && item.completionPct != null
    && item.completionPct < 75
    && item.averageMissingSets >= 1
  )) ?? null;
  const trendStart = shiftDate(today, -27);
  const trends = summarizeExerciseTrackTrends(data.days, shiftDate(today, 1), 40)
    .filter((item) => item.latestDate >= trendStart);
  const cycle = cycleProjection(data, today);
  const recovery = recoveryConstraint(load, trends, cycle.rows);
  const confidence: TrainingAnalysisConfidence = load.sessions28d < 2
    ? "starter"
    : load.sessions28d >= 6 && (trends.length >= 2 || load.difficultySamples >= 4)
      ? "ready"
      : "building";
  return {
    confidence,
    load,
    adherence,
    templateAdherence,
    weakTemplate,
    trends,
    improvingTracks: trends.filter((item) => item.trend.status === "improving").length,
    plateauTracks: trends.filter((item) => item.trend.status === "plateau").length,
    regressingTracks: trends.filter((item) => item.trend.status === "regressing").length,
    recovery,
    unclosed: latestUnclosed(data, today),
    cycle,
  };
}
