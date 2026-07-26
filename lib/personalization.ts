import type { AppData, DayLog, VolumeContribution } from "./types";
import { MUSCLE_LABELS, MUSCLE_ORDER, type MuscleGroup } from "./muscles";
import { buildExerciseTrackArchive } from "./trainingHistory";
import { workingSets } from "./trainingMetrics";
import { computeVolumeSummary, targetForMuscle } from "./volume";
import { shiftDate } from "./weight";

export type CalibrationConfidence = "collecting" | "building" | "ready";
export type CalibrationAction = "collect" | "maintain" | "personalize" | "reduce";
export type CalibrationReason = "insufficientCycles" | "recoveryPressure" | "positiveEvidence" | "holdEvidence";

export interface MuscleCalibration {
  muscle: MuscleGroup;
  confidence: CalibrationConfidence;
  action: CalibrationAction;
  sampledCycles: number;
  typicalDirectSets: number | null;
  improvingTracks: number;
  regressingTracks: number;
  difficultySamples: number;
  hardRate: number | null;
  currentTarget: { low: number; high: number };
  suggestedTarget: { low: number; high: number };
  reasonKind: CalibrationReason;
  reason: string;
}

const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2);
}

function contributions(exercise: { primaryMuscle?: MuscleGroup; volumeContributions?: VolumeContribution[] }) {
  if (exercise.volumeContributions?.length) return exercise.volumeContributions;
  return exercise.primaryMuscle ? [{ muscle: exercise.primaryMuscle, weight: 1, direct: true }] : [];
}

function directlyTrains(day: DayLog, muscle: MuscleGroup) {
  return Boolean(day.workout?.exercises.some((exercise) =>
    workingSets(exercise.sets).length > 0
    && contributions(exercise).some((entry) => entry.muscle === muscle && entry.direct),
  ));
}

function completedHistoricalCycles(data: AppData, today: string) {
  const start = shiftDate(today, -83);
  const groups = new Map<string, DayLog[]>();
  for (const [date, day] of Object.entries(data.days)) {
    const workout = day.workout;
    if (
      date < start
      || date > today
      || !workout
      || workout.type === "rest"
      || workout.done !== true
      || workout.cyclePhase === "deload"
      || !workout.microcycleId
      || workout.microcycleId === data.microcycle?.currentId
      || workout.microcycleId.startsWith("legacy_mc_")
    ) continue;
    const rows = groups.get(workout.microcycleId) ?? [];
    rows.push(day);
    groups.set(workout.microcycleId, rows);
  }
  const cycles = [...groups.entries()].map(([id, days]) => {
    const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const workout = sortedDays[0]?.workout;
    return {
      id,
      days: sortedDays,
      startedAt: sortedDays[0]?.date ?? "",
      endedAt: sortedDays.at(-1)?.date ?? "",
      mesocycleId: workout?.mesocycleId,
      mesocycleCycleNumber: workout?.mesocycleCycleNumber,
    };
  });
  const latestPosition = new Map<string, (typeof cycles)[number]>();
  for (const cycle of cycles) {
    if (!cycle.mesocycleId || !cycle.mesocycleCycleNumber) continue;
    const key = `${cycle.mesocycleId}::${cycle.mesocycleCycleNumber}`;
    const current = latestPosition.get(key);
    if (!current || cycle.endedAt > current.endedAt) latestPosition.set(key, cycle);
  }
  const currentCycle = data.microcycle;

  return cycles
    .filter((cycle) => {
      if (cycle.days.length < 2) return false;
      if (!cycle.mesocycleId || !cycle.mesocycleCycleNumber) return true;
      const positionKey = `${cycle.mesocycleId}::${cycle.mesocycleCycleNumber}`;
      if (latestPosition.get(positionKey)?.id !== cycle.id) return false;
      if (data.lastCycleReview?.sourceMicrocycleId === cycle.id) return true;
      if (currentCycle && currentCycle.startedAt > cycle.endedAt) {
        if (currentCycle.mesocycleId && currentCycle.mesocycleId !== cycle.mesocycleId) return true;
        if (
          currentCycle.mesocycleId === cycle.mesocycleId
          && (currentCycle.mesocycleCycleNumber ?? 0) > cycle.mesocycleCycleNumber
        ) return true;
      }
      return cycles.some((later) =>
        later.startedAt > cycle.endedAt
        && Boolean(later.mesocycleId)
        && (
          later.mesocycleId !== cycle.mesocycleId
          || (later.mesocycleCycleNumber ?? 0) > cycle.mesocycleCycleNumber!
        ),
      );
    })
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    .slice(0, 6);
}

export function buildPersonalCalibration(data: AppData, today: string): MuscleCalibration[] {
  const cycles = completedHistoricalCycles(data, today);
  const cycleVolumes = cycles.map((cycle) => computeVolumeSummary(cycle.days));
  const start = shiftDate(today, -83);
  const archive = buildExerciseTrackArchive(data.days, shiftDate(today, 1), today)
    .filter((row) => !row.legacy && row.latestDate >= start);

  return MUSCLE_ORDER.map((muscle) => {
    const currentTarget = targetForMuscle(muscle, data.profile?.trainingLevel, data.muscleTargets);
    const cycleSets = cycleVolumes
      .map((summary) => summary.rows.find((row) => row.muscle === muscle)?.directEffectiveSets ?? 0)
      .filter((sets) => sets > 0);
    const typicalDirectSets = median(cycleSets);
    const relevantDays = Object.entries(data.days)
      .filter(([date, day]) => date >= start && date <= today && day.workout?.done === true && directlyTrains(day, muscle))
      .map(([, day]) => day);
    const difficulty = relevantDays
      .map((day) => day.workout?.difficulty)
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const hardSessions = difficulty.filter((value) => value === "hard").length;
    const hardRate = difficulty.length ? round(hardSessions / difficulty.length) : null;
    const muscleTracks = archive.filter((row) => contributions(row.sessions[0].exercise).some((entry) => entry.muscle === muscle && entry.direct));
    const improvingTracks = muscleTracks.filter((row) => row.trend.status === "improving").length;
    const regressingTracks = muscleTracks.filter((row) => row.trend.status === "regressing").length;
    const confidence: CalibrationConfidence = cycleSets.length >= 4
      ? "ready"
      : cycleSets.length >= 2 ? "building" : "collecting";

    let action: CalibrationAction = "collect";
    let suggestedTarget = { ...currentTarget };
    let reasonKind: CalibrationReason = "insufficientCycles";
    let reason = `${MUSCLE_LABELS[muscle]}还没有两个完整建设周期的直接容量，先保持当前目标并继续记录。`;

    if (typicalDirectSets != null && cycleSets.length >= 2) {
      const minimumUsefulExposure = currentTarget.low * 0.7;
      const recoveryPressure = regressingTracks >= 2
        || (difficulty.length >= 3 && (hardRate ?? 0) >= 0.5);
      if (recoveryPressure) {
        const high = Math.max(2, Math.round(Math.min(currentTarget.high, typicalDirectSets)));
        const low = Math.max(1, Math.min(high, Math.round(high * 0.75)));
        suggestedTarget = { low, high };
        action = high < currentTarget.high ? "reduce" : "maintain";
        reasonKind = "recoveryPressure";
        reason = `典型容量 ${typicalDirectSets} 组，同时出现 ${regressingTracks} 条回落轨道和 ${hardSessions}/${difficulty.length} 次吃力记录；先收窄上限，不追加容量。`;
      } else if (typicalDirectSets >= minimumUsefulExposure && improvingTracks > regressingTracks) {
        const lowFloor = Math.max(1, Math.floor(currentTarget.low * 0.75));
        const highCeiling = Math.max(currentTarget.high, Math.ceil(currentTarget.high * 1.2));
        const low = clamp(Math.floor(typicalDirectSets - 1), lowFloor, highCeiling - 1);
        const high = clamp(Math.ceil(typicalDirectSets + 2), low + 1, highCeiling);
        suggestedTarget = { low, high };
        action = low === currentTarget.low && high === currentTarget.high ? "maintain" : "personalize";
        reasonKind = "positiveEvidence";
        reason = `${cycleSets.length} 个周期的典型直接容量为 ${typicalDirectSets} 组，${improvingTracks} 条轨道提升、${regressingTracks} 条回落；建议把目标贴近已验证的可恢复区间。`;
      } else {
        action = "maintain";
        reasonKind = "holdEvidence";
        reason = `典型容量 ${typicalDirectSets} 组，但当前没有足够的正向表现证据支持改目标；保持 ${currentTarget.low}–${currentTarget.high}，继续观察。`;
      }
    }

    return {
      muscle,
      confidence,
      action,
      sampledCycles: cycleSets.length,
      typicalDirectSets,
      improvingTracks,
      regressingTracks,
      difficultySamples: difficulty.length,
      hardRate,
      currentTarget,
      suggestedTarget,
      reasonKind,
      reason,
    };
  });
}
