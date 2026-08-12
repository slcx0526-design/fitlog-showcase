"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BodyWeightEntry,
  CardioEntry,
  WaistEntry,
  ActivityEnergyEntry,
  CutPlan,
  DayLog,
  Exercise,
  ExercisePreset,
  NutritionLog,
  Profile,
  RecordMode,
  RecoveryCheckIn,
  MicrocycleState,
  Schedule,
  SessionDifficulty,
  SetRecord,
  StarterPlanPreset,
  TemplateItem,
  TrainingPreferences,
  TrainingIntent,
  TrainingCyclePhase,
  TrainingType,
  VolumeContribution,
  WorkoutSession,
} from "./types";
import type { Equipment, MuscleGroup } from "./muscles";
import {
  AppData,
  downloadBackup,
  emptyData,
  loadData,
  normalizeData,
  parseBackupWithMeta,
  parseStoredData,
  saveData,
  STORAGE_KEY,
} from "./storage";
import { emitPersistenceStatus } from "./persistence";
import { DEFAULT_EXERCISES } from "./exercises";
import { todayKey } from "./date";
import {
  canonicalizeLibraryTemplate,
  MAX_TEMPLATES_PER_TYPE,
  moveTemplateWithinType,
  updateCustomExerciseTemplateReferences,
} from "./templates";
import { buildAdaptiveRuntimePlan } from "./adaptiveEvidence";
import {
  defaultTrainingPolicy,
  loadTrainingPolicy,
  saveTrainingPolicy,
  type TrainingPolicy,
} from "./trainingPolicy";
import {
  applyAdaptivePlanPatch,
  type AdaptiveTemplatePatch,
} from "./adaptivePlanCommit";
import {
  advanceTrainingCycle,
  cloneTemplate,
  defaultMesocycle,
  defaultMicrocycle,
  ensureMesocycle,
  ensureMicrocycle,
  microcycleAssignmentForNewWorkout,
  microcycleForScheduleEdit,
  microcycleForTemplateEdit,
  templateForCyclePhase,
  templateForMicrocycleStep,
} from "./microcycle";
import {
  applyPrescriptionSnapshot,
  deloadPrescription,
  normalizeTemplateItemPrescription,
  prescriptionForPreset,
  prescriptionFromTemplateItem,
  type TrackHistoryCollection,
} from "./prescription";
import { hasSetPerformance, isWorkoutEditingLocked, workingSets } from "./trainingMetrics";
import { inspectDataHealth } from "./dataHealth";
import { applyExercisePlannedLoad, type PlannedLoadContext } from "./trainingExecution";
import {
  applyCycleReviewToData,
  requiresCycleReviewBeforeWorkout,
  type CycleReview,
} from "./cyclePlanning";
import { starterPlanById } from "./starterPlans";
import { mergeAppData, reconcileStorageEvent, type DataMergeSummary } from "./dataMerge";
import {
  mergeAppleHealthSnapshot as mergeAppleHealthData,
  type AppleHealthMergeSummary,
} from "./appleHealth";
import {
  createTrainingHistoryIndexCache,
  findIndexedLastNutrition,
  findIndexedLastWorkoutByType,
  findIndexedTrackHistories,
} from "./historyIndex";
import { pendingWorkoutForPlanChange } from "./trainingAnalysis";

type MicrocycleStartStatus = "started" | "blocked" | "persistence";
type CycleReviewCommitStatus = "applied" | "stale" | "persistence";

function withTemplateItems(prev: AppData, id: string, items: TemplateItem[]): AppData {
  if (!(prev.templates ?? []).some((template) => template.id === id)) return prev;
  const pool = new Map(
    [...DEFAULT_EXERCISES, ...prev.customExercises].map((preset) => [preset.id, preset])
  );
  const canonicalItems = items.map((item) =>
    normalizeTemplateItemPrescription(item, pool.get(item.exerciseId))
  );
  const templates = (prev.templates ?? []).map((template) =>
    template.id === id
      ? canonicalizeLibraryTemplate({ ...template, items: canonicalItems })
      : template
  );
  const base = { ...prev, templates };
  return { ...base, microcycle: microcycleForTemplateEdit(base, templates) };
}

function withMuscleTarget(prev: AppData, muscle: MuscleGroup, low: number, high: number): AppData {
  const targetLow = Math.max(0, Math.round(low));
  return {
    ...prev,
    muscleTargets: {
      ...(prev.muscleTargets ?? {}),
      [muscle]: { low: targetLow, high: Math.max(targetLow, Math.round(high)) },
    },
  };
}

interface StoreApi {
  loaded: boolean;
  data: AppData;

  getDay: (date: string) => DayLog | undefined;

  // 训练
  setWorkoutType: (date: string, type: TrainingType, options?: { microcycleStepId?: string }) => boolean;
  setWorkoutDone: (date: string, done: boolean, difficulty?: SessionDifficulty) => boolean;
  setWorkoutDifficulty: (date: string, difficulty?: SessionDifficulty) => void;
  addExercise: (date: string, preset: ExercisePreset, options?: { intent?: TrainingIntent | "context" }) => boolean;
  removeExercise: (date: string, exerciseId: string) => void;
  addSet: (date: string, exerciseId: string, set: SetRecord) => void;
  updateSet: (
    date: string,
    exerciseId: string,
    index: number,
    set: SetRecord
  ) => void;
  removeSet: (date: string, exerciseId: string, index: number) => void;
  setExercisePlannedLoad: (date: string, exerciseId: string, weight?: number, context?: PlannedLoadContext) => void;

  // 营养
  setNutrition: (date: string, log: NutritionLog | undefined) => void;

  // 每日恢复状态
  setRecovery: (date: string, log: RecoveryCheckIn | undefined) => void;

  // 有氧
  addCardio: (date: string, entry: Omit<CardioEntry, "id" | "at">) => void;
  updateCardio: (
    date: string,
    id: string,
    patch: Partial<Omit<CardioEntry, "id">>
  ) => void;
  removeCardio: (date: string, id: string) => void;

  // 身体数据 / 减脂计划
  setProfile: (patch: Partial<Profile>) => void;
  setCutPlan: (patch: Partial<CutPlan>) => void;
  addActivityEnergy: (
    date: string,
    entry: Omit<ActivityEnergyEntry, "id" | "at">
  ) => void;
  removeActivityEnergy: (date: string, id: string) => void;

  // 训练模板（自由命名 + 归属类型，每类型上限 5）
  createTemplate: (type: TrainingType, name: string, items?: TemplateItem[]) => string | null;
  duplicateTemplate: (id: string) => string | null;
  moveTemplate: (id: string, dir: -1 | 1) => void;
  renameTemplate: (id: string, name: string) => void;
  setTemplateItems: (id: string, items: TemplateItem[]) => void;
  commitTemplateItems: (id: string, items: TemplateItem[]) => boolean;
  deleteTemplate: (id: string) => boolean;
  applyTemplate: (id: string, date: string, options?: { microcycleStepId?: string }) => number | null;

  // 跨天查询
  trackHistories: (
    exerciseId: string,
    beforeDate: string,
    progressionTrackId?: string,
    limit?: number,
  ) => TrackHistoryCollection;
  lastNutrition: (beforeDate: string) => NutritionLog | null;

  // 体重
  setBodyWeight: (date: string, weight: number) => void;
  removeBodyWeight: (date: string) => void;
  // 腰围（cm）
  setWaist: (date: string, waist: number) => void;
  removeWaist: (date: string) => void;

  // 自定义动作
  addCustomExercise: (
    name: string,
    isMain: boolean,
    primaryMuscle?: MuscleGroup,
    equipment?: Equipment,
    recordModes?: RecordMode[]
  ) => ExercisePreset;
  removeCustomExercise: (id: string) => boolean;
  updateCustomExercise: (
    id: string,
    patch: {
      name: string;
      primaryMuscle: MuscleGroup;
      secondaryMuscles?: MuscleGroup[];
      volumeContributions?: VolumeContribution[];
      equipment?: Equipment;
      recordModes?: RecordMode[];
    }
  ) => boolean;
  toggleFavoriteExercise: (id: string) => void;

  // 计划
  setSchedule: (schedule: Schedule) => void;
  commitAdaptivePlan: (
    patches: AdaptiveTemplatePatch[],
    schedule: Schedule | undefined,
    policy: TrainingPolicy,
  ) => boolean;
  setMuscleTarget: (muscle: MuscleGroup, low: number, high: number) => void;
  commitMuscleTarget: (muscle: MuscleGroup, low: number, high: number) => boolean;
  resetMuscleTarget: (muscle: MuscleGroup) => void;
  setMesocycleTargetCycles: (cycles: number) => void;
  startNewMicrocycle: (date: string, phase?: TrainingCyclePhase) => MicrocycleStartStatus;
  applyCycleReview: (review: CycleReview, date: string, phase?: TrainingCyclePhase) => CycleReviewCommitStatus;
  completeSetup: (options: { starterPlan: StarterPlanPreset; profile: Partial<Profile>; date: string }) => boolean;
  dismissSetup: () => boolean;
  setTrainingPreferences: (patch: Partial<TrainingPreferences>) => void;
  importAppleHealthSnapshot: (snapshot: unknown) => AppleHealthMergeSummary;

  // 跨天 type 查询（"上次也做了"用）
  lastWorkoutByType: (
    type: TrainingType,
    beforeDate: string
  ) => { date: string; exercises: Exercise[] } | null;

  // 数据管理
  exportData: () => boolean;
  importFromText: (text: string) => void;
  importData: (data: AppData, adaptiveTraining?: TrainingPolicy) => boolean;
  mergeData: (data: AppData) => DataMergeSummary;
  repairData: () => number | null;
  clearAll: () => boolean;
}

const StoreContext = createContext<StoreApi | null>(null);

function workoutCycleContext(microcycle: MicrocycleState, microcycleId: string): Partial<WorkoutSession> {
  if (microcycleId !== microcycle.currentId) return {};
  return {
    ...(microcycle.mesocycleId ? { mesocycleId: microcycle.mesocycleId } : {}),
    ...(microcycle.mesocycleCycleNumber ? { mesocycleCycleNumber: microcycle.mesocycleCycleNumber } : {}),
    cyclePhase: microcycle.phase ?? "build",
  };
}

function withWorkoutMutation(
  prev: AppData,
  date: string,
  fn: (workout: WorkoutSession) => WorkoutSession,
): AppData {
  const day = prev.days[date] ?? { date };
  if (isWorkoutEditingLocked(day.workout)) return prev;
  if (!day.workout && requiresCycleReviewBeforeWorkout(prev, date)) return prev;
  const current = ensureMicrocycle(prev, date);
  const assignment = day.workout
    ? {
        microcycle: current,
        mesocycle: ensureMesocycle(prev, date),
        microcycleId: day.workout.microcycleId ?? (date < current.startedAt ? `legacy_mc_${date.replace(/[^0-9]/g, "")}` : current.currentId),
      }
    : microcycleAssignmentForNewWorkout(prev, date);
  const microcycle = assignment.microcycle;
  const workout: WorkoutSession = day.workout ?? {
    type: "push",
    exercises: [],
    microcycleId: assignment.microcycleId,
    ...workoutCycleContext(microcycle, assignment.microcycleId),
  };
  const mutableWorkout = { ...workout };
  const changedWorkout = fn(mutableWorkout);
  if (changedWorkout === mutableWorkout) return prev;
  const microcycleId = day.workout?.microcycleId ?? changedWorkout.microcycleId ?? assignment.microcycleId;
  return {
    ...prev,
    microcycle,
    mesocycle: assignment.mesocycle,
    days: {
      ...prev.days,
      [date]: {
        ...day,
        date,
        workout: {
          ...workoutCycleContext(microcycle, microcycleId),
          ...changedWorkout,
          microcycleId,
        },
      },
    },
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [data, setDataState] = useState<AppData>(emptyData);
  const firstRun = useRef(true);
  const dataRef = useRef(data);
  const setData = useCallback((update: React.SetStateAction<AppData>) => {
    const current = dataRef.current;
    const next = typeof update === "function"
      ? (update as (value: AppData) => AppData)(current)
      : update;
    dataRef.current = next;
    setDataState(next);
  }, []);
  const committedDataRef = useRef<AppData | null>(null);
  const commitData = useCallback((next: AppData) => {
    if (!saveData(next)) return false;
    committedDataRef.current = next;
    setData(next);
    return true;
  }, [setData]);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const remoteDataRef = useRef<AppData | null>(null);
  const [indexTrainingHistory] = useState(() => createTrainingHistoryIndexCache());
  const historyIndex = useMemo(() => indexTrainingHistory(data.days), [data.days, indexTrainingHistory]);

  // 仅客户端：挂载后读取本地数据
  useEffect(() => {
    setData(loadData());
    setLoaded(true);
  }, [setData]);

  // 跨标签页 / 跨窗口同步：监听同一浏览器内其他标签的 localStorage 写入
  // 避免多标签同时打开时谁后保存谁覆盖的静默丢失
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY || e.newValue === null || !loadedRef.current) return;
      try {
        const incoming = parseStoredData(e.newValue);
        const previousStored = e.oldValue ? parseStoredData(e.oldValue) : emptyData();
        const reconciled = reconcileStorageEvent(dataRef.current, previousStored, incoming);
        if (reconciled.shouldPersist) {
          remoteDataRef.current = null;
          setData(reconciled.data);
        } else {
          remoteDataRef.current = reconciled.data;
          dataRef.current = reconciled.data;
          setData(reconciled.data);
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setData]);

  // 写穿透：data 变化后防抖落盘（避免输入时频繁写）
  useEffect(() => {
    if (!loaded) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (remoteDataRef.current === data) {
      remoteDataRef.current = null;
      return;
    }
    if (committedDataRef.current === data) {
      committedDataRef.current = null;
      return;
    }
    committedDataRef.current = null;
    remoteDataRef.current = null;
    const t = setTimeout(() => {
      saveData(data);
    }, 120);
    return () => clearTimeout(t);
  }, [data, loaded]);

  // 切后台 / 关闭页面时立即落盘，堵住"改完立刻锁屏，120ms 防抖没触发"的丢失
  useEffect(() => {
    const flush = () => {
      if (loadedRef.current) {
        saveData(dataRef.current);
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  // ---- 内部：以不可变方式更新某一天 ----
  const mutateDay = useCallback(
    (date: string, fn: (day: DayLog) => DayLog) => {
      setData((prev) => {
        const current = prev.days[date] ?? { date };
        const next = fn({ ...current, date });
        return { ...prev, days: { ...prev.days, [date]: next } };
      });
    },
    [setData]
  );

  const mutateWorkout = useCallback(
    (date: string, fn: (w: WorkoutSession) => WorkoutSession) => {
      setData((prev) => withWorkoutMutation(prev, date, fn));
    },
    [setData]
  );

  const mutateExercise = useCallback(
    (date: string, exerciseId: string, fn: (ex: Exercise) => Exercise) => {
      mutateWorkout(date, (w) => ({
        ...w,
        exercises: w.exercises.map((e) =>
          e.id === exerciseId ? fn({ ...e }) : e
        ),
      }));
    },
    [mutateWorkout]
  );

  // ---- 训练相关 API ----
  const setWorkoutType = useCallback(
    (date: string, type: TrainingType, options?: { microcycleStepId?: string }) => {
      const prev = dataRef.current;
      const day = prev.days[date] ?? { date };
      if (isWorkoutEditingLocked(day.workout)) return false;
      if (!day.workout && requiresCycleReviewBeforeWorkout(prev, date)) return false;
      const current = ensureMicrocycle(prev, date);
      const assignment = day.workout
        ? {
            microcycle: current,
            mesocycle: ensureMesocycle(prev, date),
            microcycleId: day.workout.microcycleId ?? (date < current.startedAt ? `legacy_mc_${date.replace(/[^0-9]/g, "")}` : current.currentId),
          }
        : microcycleAssignmentForNewWorkout(prev, date);
      const microcycle = assignment.microcycle;
      const requestedStep = options?.microcycleStepId
        ? microcycle.steps?.find((step) => step.id === options.microcycleStepId && step.type === type)
        : undefined;
      const workout = day.workout ?? {
        type,
        exercises: [],
        microcycleId: assignment.microcycleId,
        ...workoutCycleContext(microcycle, assignment.microcycleId),
      };
      const hasRecordedSets = workout.exercises.some((exercise) => exercise.sets.some(hasSetPerformance));
      if (type === "rest" && workout.type !== "rest" && hasRecordedSets) return false;
      const sameType = workout.type === type;
      const completedAt = type === "rest"
        ? sameType
          ? workout.completedAt ?? new Date().toISOString()
          : new Date().toISOString()
        : sameType && workout.done === true
          ? workout.completedAt
          : undefined;
      const next: AppData = {
        ...prev,
        microcycle,
        mesocycle: assignment.mesocycle,
        days: {
          ...prev.days,
          [date]: {
            ...day,
            date,
            workout: {
              ...workoutCycleContext(microcycle, workout.microcycleId ?? assignment.microcycleId),
              ...workout,
              type,
              // A type switch keeps real records but drops empty drafts from the old plan.
              exercises: sameType
                ? workout.exercises
                : workout.exercises.filter((exercise) => exercise.sets.some(hasSetPerformance)),
              templateId: sameType ? workout.templateId : undefined,
              templateSnapshot: sameType ? workout.templateSnapshot : undefined,
              microcycleId: workout.microcycleId ?? assignment.microcycleId,
              microcycleStepId: requestedStep?.id ?? (sameType ? workout.microcycleStepId : undefined),
              done: type === "rest" ? true : sameType ? (workout.done ?? false) : false,
              completedAt,
            },
          },
        },
      };
      return commitData(next);
    },
    [commitData]
  );

  const setWorkoutDone = useCallback(
    (date: string, done: boolean, difficulty?: SessionDifficulty) => {
      const prev = dataRef.current;
      const day = prev.days[date];
      if (!day?.workout) return false;
      const next: AppData = {
        ...prev,
        days: {
          ...prev.days,
          [date]: {
            ...day,
            workout: {
              ...day.workout,
              ...(difficulty ? { difficulty } : {}),
              done,
              completedAt: done ? new Date().toISOString() : undefined,
            },
          },
        },
      };
      return commitData(next);
    },
    [commitData]
  );

  const setWorkoutDifficulty = useCallback((date: string, difficulty?: SessionDifficulty) => {
    setData((prev) => {
      const day = prev.days[date];
      if (!day?.workout || isWorkoutEditingLocked(day.workout)) return prev;
      return {
        ...prev,
        days: {
          ...prev.days,
          [date]: { ...day, workout: { ...day.workout, difficulty } },
        },
      };
    });
  }, [setData]);

  const addExercise = useCallback(
    (date: string, preset: ExercisePreset, options?: { intent?: TrainingIntent | "context" }) => {
      const prev = dataRef.current;
      const next = withWorkoutMutation(prev, date, (w) => {
        if (w.exercises.some((e) => e.id === preset.id)) return w; // 当天去重
        const context = options?.intent === "context" || !options?.intent
          ? w.exercises.find((exercise) => exercise.prescription)?.prescription
          : undefined;
        const intent = options?.intent && options.intent !== "context" ? options.intent : undefined;
        const basePrescription = prescriptionForPreset(preset, w.type, intent, context);
        const prescription = w.cyclePhase === "deload"
          ? deloadPrescription(basePrescription)
          : basePrescription;
        const ex = applyPrescriptionSnapshot({
          id: preset.id,
          name: preset.name,
          isMain: preset.isMain,
          sets: [],
          primaryMuscle: preset.primaryMuscle,
          secondaryMuscles: preset.secondaryMuscles,
          volumeContributions: preset.volumeContributions,
          recordModes: preset.recordModes,
          equipment: preset.equipment,
          movementPattern: preset.movementPattern,
          alternatives: preset.alternatives,
        }, prescription);
        return { ...w, done: false, completedAt: undefined, exercises: [...w.exercises, ex] };
      });
      return next !== prev && commitData(next);
    },
    [commitData]
  );

  const removeExercise = useCallback(
    (date: string, exerciseId: string) => {
      mutateWorkout(date, (w) => ({
        ...w,
        done: false,
        completedAt: undefined,
        exercises: w.exercises.filter((e) => e.id !== exerciseId),
      }));
    },
    [mutateWorkout]
  );

  const addSet = useCallback(
    (date: string, exerciseId: string, set: SetRecord) => {
      // 加组即视为会话重新进行中：顺带清除"已结束"标记
      mutateWorkout(date, (w) => ({
        ...w,
        done: false,
        completedAt: undefined,
        exercises: w.exercises.map((e) =>
          e.id === exerciseId
            ? {
                ...e,
                sets: [
                  ...e.sets,
                  { type: "working", ...set, at: set.at ?? new Date().toISOString() },
                ],
              }
            : e
        ),
      }));
    },
    [mutateWorkout]
  );

  const updateSet = useCallback(
    (date: string, exerciseId: string, index: number, set: SetRecord) => {
      mutateWorkout(date, (workout) => ({
        ...workout,
        done: false,
        completedAt: undefined,
        exercises: workout.exercises.map((exercise) => exercise.id === exerciseId
          ? { ...exercise, sets: exercise.sets.map((current, currentIndex) => currentIndex === index ? set : current) }
          : exercise),
      }));
    },
    [mutateWorkout]
  );

  const removeSet = useCallback(
    (date: string, exerciseId: string, index: number) => {
      mutateWorkout(date, (workout) => ({
        ...workout,
        done: false,
        completedAt: undefined,
        exercises: workout.exercises.map((exercise) => exercise.id === exerciseId
          ? { ...exercise, sets: exercise.sets.filter((_, currentIndex) => currentIndex !== index) }
          : exercise),
      }));
    },
    [mutateWorkout]
  );

  const setExercisePlannedLoad = useCallback(
    (date: string, exerciseId: string, weight?: number, context?: PlannedLoadContext) => {
      mutateExercise(date, exerciseId, (exercise) => applyExercisePlannedLoad(exercise, weight, context));
    },
    [mutateExercise]
  );

  // ---- 营养 ----
  const setNutrition = useCallback(
    (date: string, log: NutritionLog | undefined) => {
      mutateDay(date, (day) => ({ ...day, nutrition: log }));
    },
    [mutateDay]
  );

  const setRecovery = useCallback(
    (date: string, log: RecoveryCheckIn | undefined) => {
      mutateDay(date, (day) => ({ ...day, recovery: log }));
    },
    [mutateDay]
  );

  // ---- 有氧 ----
  const addCardio = useCallback(
    (date: string, entry: Omit<CardioEntry, "id" | "at">) => {
      mutateDay(date, (day) => {
        const list = day.cardio ?? [];
        const item: CardioEntry = {
          ...entry,
          id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          at: new Date().toISOString(),
        };
        return { ...day, cardio: [...list, item] };
      });
    },
    [mutateDay]
  );

  const updateCardio = useCallback(
    (date: string, id: string, patch: Partial<Omit<CardioEntry, "id">>) => {
      mutateDay(date, (day) => {
        if (!day.cardio) return day;
        return {
          ...day,
          cardio: day.cardio.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        };
      });
    },
    [mutateDay]
  );

  const removeCardio = useCallback(
    (date: string, id: string) => {
      mutateDay(date, (day) => {
        if (!day.cardio) return day;
        const next = day.cardio.filter((c) => c.id !== id);
        return { ...day, cardio: next.length ? next : undefined };
      });
    },
    [mutateDay]
  );

  // ---- 身体数据 ----
  const setProfile = useCallback((patch: Partial<Profile>) => {
    setData((prev) => {
      const merged = { ...(prev.profile ?? {}), ...patch };
      // 清掉被设为 undefined / 0 / NaN 的字段，保持干净
      (Object.keys(merged) as (keyof Profile)[]).forEach((k) => {
        const v = merged[k];
        if (v == null || Number.isNaN(v) || v === 0) delete merged[k];
      });
      return { ...prev, profile: Object.keys(merged).length ? merged : undefined };
    });
  }, [setData]);

  // ---- 减脂计划 / 主动活动消耗 ----
  const setCutPlan = useCallback((patch: Partial<CutPlan>) => {
    setData((prev) => {
      const merged = { ...(prev.cutPlan ?? {}), ...patch };
      (Object.keys(merged) as (keyof CutPlan)[]).forEach((k) => {
        const v = merged[k];
        if (v == null || Number.isNaN(v as number) || v === 0) delete merged[k];
      });
      return {
        ...prev,
        cutPlan: Object.keys(merged).length ? merged : undefined,
      };
    });
  }, [setData]);

  const addActivityEnergy = useCallback(
    (date: string, entry: Omit<ActivityEnergyEntry, "id" | "at">) => {
      if (!Number.isFinite(entry.kcal) || entry.kcal <= 0) return;
      mutateDay(date, (day) => {
        const next: ActivityEnergyEntry = {
          ...entry,
          kcal: Math.round(entry.kcal),
          id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          at: new Date().toISOString(),
        };
        return { ...day, activityEnergy: [...(day.activityEnergy ?? []), next] };
      });
    },
    [mutateDay]
  );

  const removeActivityEnergy = useCallback(
    (date: string, id: string) => {
      mutateDay(date, (day) => {
        const next = (day.activityEnergy ?? []).filter((e) => e.id !== id);
        return { ...day, activityEnergy: next.length ? next : undefined };
      });
    },
    [mutateDay]
  );

  // ---- 训练模板 ----
  const genTplId = () =>
    "tpl_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  /** 新建模板（受每类型上限约束）。只有完整落盘后才返回新 id。 */
  const createTemplate = useCallback((type: TrainingType, name: string, items: TemplateItem[] = []): string | null => {
    const prev = dataRef.current;
    const list = prev.templates ?? [];
    if (list.filter((t) => t.type === type).length >= MAX_TEMPLATES_PER_TYPE) {
      return null;
    }
    const id = genTplId();
    const pool = new Map([...DEFAULT_EXERCISES, ...prev.customExercises].map((preset) => [preset.id, preset]));
    const tpl = canonicalizeLibraryTemplate({
      id,
      name: name.trim() || name,
      type,
      items: items.map((item) => normalizeTemplateItemPrescription(item, pool.get(item.exerciseId))),
    });
    const templates = [...list, tpl];
    const base = { ...prev, templates };
    const next = { ...base, microcycle: microcycleForTemplateEdit(base, templates) };
    return commitData(next) ? id : null;
  }, [commitData]);

  const duplicateTemplate = useCallback((id: string): string | null => {
    const prev = dataRef.current;
    const current = prev.templates ?? [];
    const source = current.find((t) => t.id === id);
    if (!source) return null;
    if (current.filter((t) => t.type === source.type).length >= MAX_TEMPLATES_PER_TYPE) {
      return null;
    }
    const nextId = genTplId();
    const copy = canonicalizeLibraryTemplate(cloneTemplate({
      ...source,
      id: nextId,
      name: `${source.name.trim() || "模板"} 副本`,
    }));
    const sourceIndex = current.findIndex((template) => template.id === id);
    const templates = [...current];
    templates.splice(sourceIndex + 1, 0, copy);
    const base = { ...prev, templates };
    const next = { ...base, microcycle: microcycleForTemplateEdit(base, templates) };
    return commitData(next) ? nextId : null;
  }, [commitData]);

  const moveTemplate = useCallback((id: string, dir: -1 | 1) => {
    setData((prev) => {
      const list = prev.templates ?? [];
      const next = moveTemplateWithinType(list, id, dir);
      if (next === list) return prev;
      return { ...prev, templates: next };
    });
  }, [setData]);

  const renameTemplate = useCallback((id: string, name: string) => {
    setData((prev) => {
      const templates = (prev.templates ?? []).map((template) => template.id === id ? { ...template, name } : template);
      return { ...prev, templates, microcycle: microcycleForTemplateEdit({ ...prev, templates }, templates) };
    });
  }, [setData]);

  const setTemplateItems = useCallback((id: string, items: TemplateItem[]) => {
    setData((prev) => withTemplateItems(prev, id, items));
  }, [setData]);

  const commitTemplateItems = useCallback((id: string, items: TemplateItem[]) => {
    const prev = dataRef.current;
    const next = withTemplateItems(prev, id, items);
    return next !== prev && commitData(next);
  }, [commitData]);

  const deleteTemplate = useCallback((id: string) => {
    const prev = dataRef.current;
    const current = prev.templates ?? [];
    if (!current.some((template) => template.id === id)) return false;
    const templates = current.filter((template) => template.id !== id);
    const clearBinding = (step: import("./types").MicrocycleStep) => step.templateId === id ? { ...step, templateId: undefined } : step;
    const schedule = prev.schedule.microcycle ? { ...prev.schedule, microcycle: prev.schedule.microcycle.map(clearBinding) } : prev.schedule;
    const trainingTemplateIds = prev.cutPlan?.trainingTemplateIds
      ? Object.fromEntries(Object.entries(prev.cutPlan.trainingTemplateIds).filter(([, templateId]) => templateId !== id)) as NonNullable<CutPlan["trainingTemplateIds"]>
      : undefined;
    const base = {
      ...prev,
      templates: templates.length ? templates : undefined,
      schedule,
      cutPlan: prev.cutPlan ? { ...prev.cutPlan, trainingTemplateIds: trainingTemplateIds && Object.keys(trainingTemplateIds).length ? trainingTemplateIds : undefined } : prev.cutPlan,
    };
    const next = {
      ...base,
      // A cycle with recorded work keeps its immutable snapshot. An unstarted cycle follows the edited schedule.
      microcycle: microcycleForTemplateEdit(base, templates),
    };
    return commitData(next);
  }, [commitData]);

  /**
   * 套用模板到某天：合并去重（已有的动作保留，模板里缺的补进来）。
   * 不写入任何重量 —— 重量交给"沿用上次"。返回新增动作数。
  */
  const applyTemplate = useCallback(
    (id: string, date: string, options?: { microcycleStepId?: string }): number | null => {
      const currentData = dataRef.current;
      const targetWorkout = currentData.days[date]?.workout;
      if (isWorkoutEditingLocked(targetWorkout)) return null;
      if (!targetWorkout && requiresCycleReviewBeforeWorkout(currentData, date)) return null;
      const targetPhase = targetWorkout?.cyclePhase
        ?? (date >= (currentData.microcycle?.startedAt ?? date) ? currentData.microcycle?.phase : "build")
        ?? "build";
      const baseTemplate = templateForMicrocycleStep(currentData, options?.microcycleStepId, id);
      const tpl = baseTemplate
        ? templateForCyclePhase(baseTemplate, targetPhase)
        : undefined;
      if (!tpl || !tpl.items.length) return null;
      const currentExercises = dataRef.current.days[date]?.workout?.exercises ?? [];
      const currentIds = new Set(currentExercises.filter((exercise) => workingSets(exercise.sets).length > 0).map((exercise) => exercise.id));
      const added = tpl.items.filter((item) => !currentIds.has(item.exerciseId)).length;
      // 预设池：内置 + 自定义（拿 primaryMuscle / isMain 快照）
      const next = ((prev: AppData) => {
        const day = prev.days[date] ?? { date };
        if (isWorkoutEditingLocked(day.workout)) return prev;
        if (!day.workout && requiresCycleReviewBeforeWorkout(prev, date)) return prev;
        const current = ensureMicrocycle(prev, date);
        const assignment = day.workout
          ? {
              microcycle: current,
              mesocycle: ensureMesocycle(prev, date),
              microcycleId: day.workout.microcycleId ?? (date < current.startedAt ? `legacy_mc_${date.replace(/-/g, "")}` : current.currentId),
            }
          : microcycleAssignmentForNewWorkout(prev, date);
        const microcycle = assignment.microcycle;
        const requestedStep = options?.microcycleStepId
          ? microcycle.steps?.find((step) => step.id === options.microcycleStepId && step.type === tpl.type && step.templateId === id)
          : undefined;
        const sourceTemplate = templateForMicrocycleStep({ ...prev, microcycle }, requestedStep?.id, id);
        if (!sourceTemplate) return prev;
        const phase = day.workout?.cyclePhase
          ?? (date >= microcycle.startedAt ? microcycle.phase : "build")
          ?? "build";
        const resolvedTemplate = templateForCyclePhase(sourceTemplate, phase);
        const pool = [...DEFAULT_EXERCISES, ...prev.customExercises];
        const presetById = new Map(pool.map((preset) => [preset.id, preset]));
        const runtimePolicy = loadTrainingPolicy();
        const runtimeTemplate = {
          ...resolvedTemplate,
          items: resolvedTemplate.items.map((item) => ({
            ...item,
            isMain: item.isMain ?? presetById.get(item.exerciseId)?.isMain,
          })),
        };
        const runtimePlan = buildAdaptiveRuntimePlan(prev, runtimePolicy, date, runtimeTemplate.items);
        const adjustedSets = new Map(runtimePlan.rows.map((item) => [item.exerciseId, item.prescribedSets]));
        const existing = day.workout?.exercises ?? [];
        // 已记录组数的动作保留（绝不丢数据）；其余（空的、上一个模板残留的）一律替换掉
        const kept = existing.filter((e) => workingSets(e.sets).length > 0);
        const keptIds = new Set(kept.map((e) => e.id));

        const fresh: Exercise[] = [];
        for (const it of resolvedTemplate.items) {
          if (keptIds.has(it.exerciseId)) continue; // 已保留（有记录）的不重复加
          const preset = presetById.get(it.exerciseId);
          const prescription = prescriptionFromTemplateItem(it, preset);
          fresh.push(applyPrescriptionSnapshot({
            id: it.exerciseId,
            name: it.name || preset?.name || "动作",
            isMain: it.isMain ?? preset?.isMain ?? false,
            sets: [],
            primaryMuscle: it.primaryMuscle ?? preset?.primaryMuscle,
            secondaryMuscles: it.secondaryMuscles ?? preset?.secondaryMuscles,
            volumeContributions: it.volumeContributions ?? preset?.volumeContributions,
            recordModes: it.recordModes ?? preset?.recordModes,
            equipment: it.equipment ?? preset?.equipment,
            movementPattern: it.movementPattern ?? preset?.movementPattern,
            alternatives: it.alternatives ?? preset?.alternatives,
            supersetGroup: it.supersetGroup,
          }, { ...prescription, workingSets: adjustedSets.get(it.exerciseId) ?? prescription.workingSets }));
        }
        const templateSnapshot = cloneTemplate({
          ...resolvedTemplate,
          items: resolvedTemplate.items.map((item) => {
            const workingSets = adjustedSets.get(item.exerciseId) ?? item.sets;
            return {
              ...item,
              sets: workingSets,
              ...(item.prescription ? { prescription: { ...item.prescription, workingSets } } : {}),
            };
          }),
        });
        return {
          ...prev,
          microcycle,
          mesocycle: assignment.mesocycle,
          days: {
            ...prev.days,
            [date]: {
              ...day,
              date,
              // Editing an existing historical day must not move it to the current cycle.
              workout: {
                ...workoutCycleContext(microcycle, day.workout?.microcycleId ?? assignment.microcycleId),
                type: resolvedTemplate.type,
                templateId: resolvedTemplate.id,
                templateSnapshot,
                microcycleId: day.workout?.microcycleId ?? assignment.microcycleId,
                microcycleStepId: requestedStep?.id ?? (day.workout?.templateId === resolvedTemplate.id ? day.workout.microcycleStepId : undefined),
                done: false,
                completedAt: undefined,
                ...(day.workout?.difficulty ? { difficulty: day.workout.difficulty } : {}),
                ...(runtimePlan.snapshot ? { adaptiveSnapshot: runtimePlan.snapshot } : {}),
                exercises: [...kept, ...fresh],
              },
            },
          },
        };
      })(currentData);
      if (next === currentData) return null;
      return commitData(next) ? added : null;
    },
    [commitData]
  );

  // ---- 跨天查询 ----
  const trackHistories = useCallback(
    (exerciseId: string, beforeDate: string, progressionTrackId?: string, limit = 8) =>
      findIndexedTrackHistories(historyIndex, exerciseId, beforeDate, progressionTrackId, limit),
    [historyIndex],
  );

  const lastNutrition = useCallback(
    (beforeDate: string) => findIndexedLastNutrition(historyIndex, beforeDate),
    [historyIndex],
  );

  // ---- 体重 ----
  const setBodyWeight = useCallback((date: string, weight: number) => {
    setData((prev) => {
      const rest = prev.bodyWeights.filter((e) => e.date !== date);
      const next: BodyWeightEntry[] = [...rest, { date, weight }].sort((a, b) =>
        a.date < b.date ? -1 : 1
      );
      return { ...prev, bodyWeights: next };
    });
  }, [setData]);

  const removeBodyWeight = useCallback((date: string) => {
    setData((prev) => ({
      ...prev,
      bodyWeights: prev.bodyWeights.filter((e) => e.date !== date),
    }));
  }, [setData]);

  // ---- 腰围 ----
  const setWaist = useCallback((date: string, waist: number) => {
    setData((prev) => {
      const rest = prev.waistEntries.filter((e) => e.date !== date);
      const next: WaistEntry[] = [...rest, { date, waist }].sort((a, b) =>
        a.date < b.date ? -1 : 1
      );
      return { ...prev, waistEntries: next };
    });
  }, [setData]);

  const removeWaist = useCallback((date: string) => {
    setData((prev) => ({
      ...prev,
      waistEntries: prev.waistEntries.filter((e) => e.date !== date),
    }));
  }, [setData]);

  // ---- 自定义动作 ----
  const addCustomExercise = useCallback(
    (
      name: string,
      isMain: boolean,
      primaryMuscle?: MuscleGroup,
      equipment?: Equipment,
      recordModes?: RecordMode[]
    ) => {
      const preset: ExercisePreset = {
        id:
          "cx_" +
          Math.random().toString(36).slice(2, 9) +
          Date.now().toString(36).slice(-4),
        name: name.trim(),
        isMain,
        type: "custom",
        custom: true,
        ...(primaryMuscle ? { primaryMuscle } : {}),
        ...(primaryMuscle ? { volumeContributions: [{ muscle: primaryMuscle, weight: 1, direct: true }] } : {}),
        ...(equipment ? { equipment } : {}),
        ...(recordModes?.length ? { recordModes: [...new Set(recordModes)] } : {}),
      };
      setData((prev) => ({
        ...prev,
        customExercises: [...prev.customExercises, preset],
      }));
      return preset;
    },
    [setData]
  );

  const removeCustomExercise = useCallback((id: string) => {
    const prev = dataRef.current;
    if (!prev.customExercises.some((exercise) => exercise.id === id)) return false;
    return commitData({
      ...prev,
      customExercises: prev.customExercises.filter((e) => e.id !== id),
      favoriteExerciseIds: prev.favoriteExerciseIds?.filter((exerciseId) => exerciseId !== id),
    });
  }, [commitData]);

  const toggleFavoriteExercise = useCallback((id: string) => {
    setData((prev) => {
      const current = prev.favoriteExerciseIds ?? [];
      const favoriteExerciseIds = current.includes(id)
        ? current.filter((exerciseId) => exerciseId !== id)
        : [...current, id];
      return { ...prev, favoriteExerciseIds: favoriteExerciseIds.length ? favoriteExerciseIds : undefined };
    });
  }, [setData]);

  /**
   * 编辑自定义动作：改名 / 部位 / 器械。
   * 只影响动作库（以后添加 + 按部位归类 + 以后统计）。
   * 名字变更会同步到引用它的模板条目（模板显示最新名字）；
   * 但不回溯历史记录与过去的容量统计（各自保留当时快照）。
   */
  const updateCustomExercise = useCallback(
    (
      id: string,
      patch: {
        name: string;
        primaryMuscle: MuscleGroup;
        secondaryMuscles?: MuscleGroup[];
        volumeContributions?: VolumeContribution[];
        equipment?: Equipment;
        recordModes?: RecordMode[];
      }
    ) => {
      const name = patch.name.trim();
      if (!name) return false;
      const prev = dataRef.current;
      if (!prev.customExercises.some((exercise) => exercise.id === id)) return false;
      const secondary = (patch.volumeContributions ?? [])
        .filter((item) => item.muscle !== patch.primaryMuscle)
        .filter((item, index, items) => items.findIndex((candidate) => candidate.muscle === item.muscle) === index)
        .map((item) => ({
          muscle: item.muscle,
          weight: Math.min(1, Math.max(0.1, Math.round(item.weight * 100) / 100)),
          direct: Boolean(item.direct),
        }));
      const secondaryMuscles = secondary.map((item) => item.muscle);
      const volumeContributions: VolumeContribution[] = [
        { muscle: patch.primaryMuscle, weight: 1, direct: true },
        ...secondary,
      ];
      const recordModes = patch.recordModes?.length ? [...new Set(patch.recordModes)] : undefined;
      const customExercises = prev.customExercises.map((exercise) =>
        exercise.id === id
          ? {
              ...exercise,
              name,
              primaryMuscle: patch.primaryMuscle,
              secondaryMuscles,
              volumeContributions,
              ...(patch.equipment
                ? { equipment: patch.equipment }
                : { equipment: undefined }),
              ...(recordModes
                ? { recordModes }
                : { recordModes: undefined }),
            }
          : exercise
      );
      const updatedPreset = customExercises.find((exercise) => exercise.id === id);
      const templates = updatedPreset
        ? updateCustomExerciseTemplateReferences(prev.templates, updatedPreset)
        : prev.templates;
      const base = { ...prev, customExercises, templates };
      const next = {
        ...base,
        microcycle: templates ? microcycleForTemplateEdit(base, templates) : prev.microcycle,
      };
      return commitData(next);
    },
    [commitData]
  );

  // ---- 计划 ----
  const setSchedule = useCallback((schedule: Schedule) => {
    setData((prev) => ({ ...prev, schedule, microcycle: microcycleForScheduleEdit(prev, schedule) }));
  }, [setData]);

  const commitAdaptivePlan = useCallback((
    patches: AdaptiveTemplatePatch[],
    schedule: Schedule | undefined,
    policy: TrainingPolicy,
  ) => {
    const previous = dataRef.current;
    const previousPolicy = loadTrainingPolicy();
    const next = applyAdaptivePlanPatch(previous, patches, schedule);
    if (!saveTrainingPolicy(policy)) return false;
    if (!saveData(next)) {
      saveTrainingPolicy(previousPolicy);
      emitPersistenceStatus("error");
      return false;
    }
    dataRef.current = next;
    setData(next);
    return true;
  }, [setData]);

  const setMuscleTarget = useCallback((muscle: MuscleGroup, low: number, high: number) => {
    setData((prev) => withMuscleTarget(prev, muscle, low, high));
  }, [setData]);

  const commitMuscleTarget = useCallback((muscle: MuscleGroup, low: number, high: number) => {
    return commitData(withMuscleTarget(dataRef.current, muscle, low, high));
  }, [commitData]);

  const resetMuscleTarget = useCallback((muscle: MuscleGroup) => {
    setData((prev) => {
      if (!prev.muscleTargets?.[muscle]) return prev;
      const muscleTargets = { ...prev.muscleTargets };
      delete muscleTargets[muscle];
      return { ...prev, muscleTargets: Object.keys(muscleTargets).length ? muscleTargets : undefined };
    });
  }, [setData]);

  const setMesocycleTargetCycles = useCallback((cycles: number) => {
    setData((prev) => {
      const current = ensureMesocycle(prev, todayKey());
      const targetBuildCycles = Math.min(8, Math.max(current.currentBuildCycle, Math.max(2, Math.round(cycles))));
      return { ...prev, mesocycle: { ...current, targetBuildCycles } };
    });
  }, [setData]);

  const completeSetup = useCallback((options: { starterPlan: StarterPlanPreset; profile: Partial<Profile>; date: string }) => {
    const prev = dataRef.current;
    const plan = starterPlanById(options.starterPlan);
    const hasTraining = Object.values(prev.days).some((day) => day.workout?.exercises.some((exercise) => workingSets(exercise.sets).length > 0));
    const installPlan = !hasTraining && !(prev.templates?.length);
    const templates = installPlan ? plan.templates.map(cloneTemplate) : prev.templates;
    const schedule = installPlan
      ? {
          split: [...plan.schedule.split],
          microcycle: plan.schedule.microcycle?.map((step) => ({ ...step })),
        }
      : prev.schedule;
    const mesocycle = installPlan ? defaultMesocycle(options.date) : prev.mesocycle;
    const microcycle = installPlan
      ? defaultMicrocycle(options.date, schedule, templates, { mesocycle })
      : prev.microcycle;
    const profile = { ...(prev.profile ?? {}), ...options.profile };
    const next: AppData = {
      ...prev,
      profile,
      ...(installPlan ? { templates, schedule, mesocycle, microcycle } : {}),
      onboarding: {
        completedAt: new Date().toISOString(),
        starterPlan: options.starterPlan,
      },
    };
    if (!saveData(next)) return false;
    dataRef.current = next;
    setData(next);
    return true;
  }, [setData]);

  const dismissSetup = useCallback(() => {
    const prev = dataRef.current;
    const next: AppData = {
      ...prev,
      onboarding: { ...prev.onboarding, dismissedAt: new Date().toISOString() },
    };
    if (!saveData(next)) return false;
    dataRef.current = next;
    setData(next);
    return true;
  }, [setData]);

  const setTrainingPreferences = useCallback((patch: Partial<TrainingPreferences>) => {
    setData((prev) => {
      const current = prev.trainingPreferences ?? {};
      const barbellWeightKg = patch.barbellWeightKg == null
        ? current.barbellWeightKg
        : Math.min(50, Math.max(1, Math.round(patch.barbellWeightKg * 4) / 4));
      const plateSizesKg = patch.plateSizesKg == null
        ? current.plateSizesKg
        : [...new Set(patch.plateSizesKg
            .filter((plate) => Number.isFinite(plate) && plate >= 0.25 && plate <= 50)
            .map((plate) => Math.round(plate * 4) / 4))]
            .sort((a, b) => b - a)
            .slice(0, 16);
      return {
        ...prev,
        trainingPreferences: {
          ...(barbellWeightKg ? { barbellWeightKg } : {}),
          ...(plateSizesKg?.length ? { plateSizesKg } : {}),
        },
      };
    });
  }, [setData]);

  const importAppleHealthSnapshot = useCallback((snapshot: unknown) => {
    const result = mergeAppleHealthData(dataRef.current, snapshot);
    if (!saveData(result.data)) throw new Error("Apple Health 数据未能保存");
    dataRef.current = result.data;
    setData(result.data);
    return result.summary;
  }, [setData]);

  const startNewMicrocycle = useCallback((date: string, phase: TrainingCyclePhase = "build") => {
    const prev = dataRef.current;
    if (pendingWorkoutForPlanChange(prev, date)) return "blocked";
    const advanced = advanceTrainingCycle(prev, date, phase);
    const next = { ...prev, microcycle: advanced.microcycle, mesocycle: advanced.mesocycle };
    return commitData(next) ? "started" : "persistence";
  }, [commitData]);

  const applyCycleReview = useCallback((review: CycleReview, date: string, phase?: TrainingCyclePhase) => {
    const result = applyCycleReviewToData(dataRef.current, review, date, phase);
    if (!result.applied) return "stale";
    return commitData(result.data) ? "applied" : "persistence";
  }, [commitData]);

  // ---- 跨天 type 查询 ----
  const lastWorkoutByType = useCallback(
    (type: TrainingType, beforeDate: string) => findIndexedLastWorkoutByType(historyIndex, type, beforeDate),
    [historyIndex],
  );

  // ---- 数据管理 ----
  const exportData = useCallback(() => {
    try {
      downloadBackup(dataRef.current);
      // Only mark a backup after the browser download has been created.
      setData((prev) => ({ ...prev, lastBackupAt: new Date().toISOString() }));
      return true;
    } catch {
      emitPersistenceStatus("error");
      return false;
    }
  }, [setData]);

  const importData = useCallback((input: AppData, adaptiveTraining?: TrainingPolicy) => {
    const previousPolicy = adaptiveTraining ? loadTrainingPolicy() : undefined;
    const next = normalizeData(input);
    // 把导入时刻当作新的"已同步"基点
    next.lastBackupAt = new Date().toISOString();
    if (adaptiveTraining && !saveTrainingPolicy(adaptiveTraining)) return false;
    if (!saveData(next, { checkpoint: "import" })) {
      if (previousPolicy) saveTrainingPolicy(previousPolicy);
      emitPersistenceStatus("error");
      return false;
    }
    dataRef.current = next;
    setData(next);
    return true;
  }, [setData]);

  const importFromText = useCallback((text: string) => {
    const parsed = parseBackupWithMeta(text);
    if (!importData(parsed.data, parsed.adaptiveTraining)) throw new Error("导入失败");
  }, [importData]);

  const mergeData = useCallback((incoming: AppData) => {
    const result = mergeAppData(dataRef.current, incoming);
    result.data.lastBackupAt = new Date().toISOString();
    if (!saveData(result.data, { checkpoint: "import" })) throw new Error("合并失败");
    setData(result.data);
    return result.summary;
  }, [setData]);

  const repairData = useCallback(() => {
    const current = dataRef.current;
    const issueCount = inspectDataHealth(current).issueCount;
    const repaired = normalizeData(current);
    if (!saveData(repaired, { checkpoint: "repair" })) return null;
    setData(repaired);
    return issueCount;
  }, [setData]);

  const clearAll = useCallback(() => {
    const previousPolicy = loadTrainingPolicy();
    const fresh = emptyData();
    if (!saveTrainingPolicy(defaultTrainingPolicy())) return false;
    if (!saveData(fresh)) {
      saveTrainingPolicy(previousPolicy);
      emitPersistenceStatus("error");
      return false;
    }
    setData(fresh);
    return true;
  }, [setData]);

  const getDay = useCallback(
    (date: string) => data.days[date],
    [data.days]
  );

  const api = useMemo<StoreApi>(
    () => ({
      loaded,
      data,
      getDay,
      setWorkoutType,
      setWorkoutDone,
      setWorkoutDifficulty,
      addExercise,
      removeExercise,
      addSet,
      updateSet,
      removeSet,
      setExercisePlannedLoad,
      setNutrition,
      setRecovery,
      addCardio,
      updateCardio,
      removeCardio,
      setProfile,
      setCutPlan,
      addActivityEnergy,
      removeActivityEnergy,
      createTemplate,
      duplicateTemplate,
      moveTemplate,
      renameTemplate,
      setTemplateItems,
      commitTemplateItems,
      deleteTemplate,
      applyTemplate,
      trackHistories,
      lastNutrition,
      setBodyWeight,
      removeBodyWeight,
      setWaist,
      removeWaist,
      addCustomExercise,
      removeCustomExercise,
      updateCustomExercise,
      toggleFavoriteExercise,
      setSchedule,
      commitAdaptivePlan,
      setMuscleTarget,
      commitMuscleTarget,
      resetMuscleTarget,
      setMesocycleTargetCycles,
      startNewMicrocycle,
      applyCycleReview,
      completeSetup,
      dismissSetup,
      setTrainingPreferences,
      importAppleHealthSnapshot,
      lastWorkoutByType,
      exportData,
      importFromText,
      importData,
      mergeData,
      repairData,
      clearAll,
    }),
    [
      loaded,
      data,
      getDay,
      setWorkoutType,
      setWorkoutDone,
      setWorkoutDifficulty,
      addExercise,
      removeExercise,
      addSet,
      updateSet,
      removeSet,
      setExercisePlannedLoad,
      setNutrition,
      setRecovery,
      addCardio,
      updateCardio,
      removeCardio,
      setProfile,
      setCutPlan,
      addActivityEnergy,
      removeActivityEnergy,
      createTemplate,
      duplicateTemplate,
      moveTemplate,
      renameTemplate,
      setTemplateItems,
      commitTemplateItems,
      deleteTemplate,
      applyTemplate,
      trackHistories,
      lastNutrition,
      setBodyWeight,
      removeBodyWeight,
      setWaist,
      removeWaist,
      addCustomExercise,
      removeCustomExercise,
      updateCustomExercise,
      toggleFavoriteExercise,
      setSchedule,
      commitAdaptivePlan,
      setMuscleTarget,
      commitMuscleTarget,
      resetMuscleTarget,
      setMesocycleTargetCycles,
      startNewMicrocycle,
      applyCycleReview,
      completeSetup,
      dismissSetup,
      setTrainingPreferences,
      importAppleHealthSnapshot,
      lastWorkoutByType,
      exportData,
      importFromText,
      importData,
      mergeData,
      repairData,
      clearAll,
    ]
  );

  return (
    <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}
