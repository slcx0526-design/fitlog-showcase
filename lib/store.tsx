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
  Schedule,
  SessionDifficulty,
  SetRecord,
  Template,
  TemplateItem,
  TrainingIntent,
  TrainingType,
  VolumeContribution,
  WorkoutSession,
} from "./types";
import type { Equipment, MuscleGroup } from "./muscles";
import {
  AppData,
  emptyData,
  loadData,
  normalizeData,
  parseBackup,
  saveData,
} from "./storage";
import { DEFAULT_EXERCISES } from "./exercises";
import { MAX_TEMPLATES_PER_TYPE } from "./templates";
import { currentCutSnapshot, cutAdjustedSets, isCutModeActive, suggestedCutVolumeScale } from "./cutMode";
import { ensureMicrocycle, microcycleForNewWorkout, microcycleForScheduleEdit, nextMicrocycle } from "./microcycle";
import {
  applyPrescriptionSnapshot,
  findTrackHistory,
  normalizeTemplateItemPrescription,
  prescriptionForPreset,
  prescriptionFromTemplateItem,
  type TrackHistoryResult,
} from "./prescription";
import { hasSetPerformance, workingSets } from "./trainingMetrics";
import { inspectDataHealth } from "./dataHealth";
import { applyExercisePlannedLoad } from "./trainingExecution";

interface StoreApi {
  loaded: boolean;
  data: AppData;

  getDay: (date: string) => DayLog | undefined;

  // 训练
  setWorkoutType: (date: string, type: TrainingType) => void;
  setWorkoutDone: (date: string, done: boolean) => void;
  setWorkoutDifficulty: (date: string, difficulty?: SessionDifficulty) => void;
  addExercise: (date: string, preset: ExercisePreset, options?: { intent?: TrainingIntent | "context" }) => void;
  removeExercise: (date: string, exerciseId: string) => void;
  addSet: (date: string, exerciseId: string, set: SetRecord) => void;
  updateSet: (
    date: string,
    exerciseId: string,
    index: number,
    set: SetRecord
  ) => void;
  removeSet: (date: string, exerciseId: string, index: number) => void;
  setExercisePlannedLoad: (date: string, exerciseId: string, weight?: number) => void;

  // 营养
  setNutrition: (date: string, log: NutritionLog | undefined) => void;

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
  createTemplate: (type: TrainingType, name: string) => string | null;
  duplicateTemplate: (id: string) => string | null;
  moveTemplate: (id: string, dir: -1 | 1) => void;
  renameTemplate: (id: string, name: string) => void;
  setTemplateItems: (id: string, items: TemplateItem[]) => void;
  deleteTemplate: (id: string) => void;
  applyTemplate: (id: string, date: string) => number;

  // 跨天查询
  lastSession: (
    exerciseId: string,
    beforeDate: string,
    progressionTrackId?: string
  ) => { date: string; sets: SetRecord[]; exercise?: Exercise; other?: TrackHistoryResult | null; legacy?: TrackHistoryResult | null } | null;
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
  removeCustomExercise: (id: string) => void;
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
  ) => void;

  // 计划
  setSchedule: (schedule: Schedule) => void;
  setMuscleTarget: (muscle: MuscleGroup, low: number, high: number) => void;
  startNewMicrocycle: (date: string) => void;

  // 跨天 type 查询（"上次也做了"用）
  lastWorkoutByType: (
    type: TrainingType,
    beforeDate: string
  ) => { date: string; exercises: Exercise[] } | null;

  // 数据管理
  exportData: () => void;
  importFromText: (text: string) => void;
  repairData: () => number;
  clearAll: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<AppData>(emptyData);

  // 仅客户端：挂载后读取本地数据
  useEffect(() => {
    setData(loadData());
    setLoaded(true);
  }, []);

  // 跨标签页 / 跨窗口同步：监听同一浏览器内其他标签的 localStorage 写入
  // 避免多标签同时打开时谁后保存谁覆盖的静默丢失
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== "fitlog:v1" || e.newValue === null) return;
      try {
        setData(loadData());
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // 写穿透：data 变化后防抖落盘（避免输入时频繁写）
  const firstRun = useRef(true);
  const dataRef = useRef(data);
  dataRef.current = data;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;

  useEffect(() => {
    if (!loaded) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => saveData(data), 120);
    return () => clearTimeout(t);
  }, [data, loaded]);

  // 切后台 / 关闭页面时立即落盘，堵住"改完立刻锁屏，120ms 防抖没触发"的丢失
  useEffect(() => {
    const flush = () => {
      if (loadedRef.current) saveData(dataRef.current);
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
    []
  );

  const mutateWorkout = useCallback(
    (date: string, fn: (w: WorkoutSession) => WorkoutSession) => {
      setData((prev) => {
        const day = prev.days[date] ?? { date };
        const microcycle = day.workout
          ? ensureMicrocycle(prev, date)
          : microcycleForNewWorkout(prev, date);
        const w: WorkoutSession = day.workout ?? {
          type: "push",
          exercises: [],
          microcycleId: microcycle.currentId,
        };
        const next = fn({ ...w, microcycleId: w.microcycleId ?? microcycle.currentId });
        // Historical edits must preserve the session's original microcycle.
        // Only a genuinely new workout receives the currently active cycle id.
        const microcycleId = day.workout?.microcycleId ?? next.microcycleId ?? microcycle.currentId;
        const nextData = {
          ...prev,
          microcycle,
          days: {
            ...prev.days,
            [date]: {
              ...day,
              date,
              workout: { ...next, microcycleId },
            },
          },
        };
        return nextData;
      });
    },
    []
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
    (date: string, type: TrainingType) => {
      setData((prev) => {
        const day = prev.days[date] ?? { date };
        const microcycle = day.workout
          ? ensureMicrocycle(prev, date)
          : microcycleForNewWorkout(prev, date);
        const w = day.workout ?? { type, exercises: [], microcycleId: microcycle.currentId };
        if (type === "rest" && w.type !== "rest" && w.exercises.some((exercise) => exercise.sets.some(hasSetPerformance))) {
          return prev;
        }
        const nextData: AppData = {
          ...prev,
          microcycle,
          days: {
            ...prev.days,
            [date]: {
              ...day,
              date,
              workout: {
                ...w,
                type,
                templateId: w.type === type ? w.templateId : undefined,
                microcycleId: w.microcycleId ?? microcycle.currentId,
                ...(w.type === type ? {} : { done: false }),
              },
            },
          },
        };
        return nextData;
      });
    },
    []
  );

  const setWorkoutDone = useCallback(
    (date: string, done: boolean) => {
      setData((prev) => {
        const day = prev.days[date];
        if (!day?.workout) return prev;
        return {
          ...prev,
          days: {
            ...prev.days,
            [date]: { ...day, workout: { ...day.workout, done } },
          },
        };
      });
    },
    []
  );

  const setWorkoutDifficulty = useCallback((date: string, difficulty?: SessionDifficulty) => {
    setData((prev) => {
      const day = prev.days[date];
      if (!day?.workout) return prev;
      return {
        ...prev,
        days: {
          ...prev.days,
          [date]: { ...day, workout: { ...day.workout, difficulty } },
        },
      };
    });
  }, []);

  const addExercise = useCallback(
    (date: string, preset: ExercisePreset, options?: { intent?: TrainingIntent | "context" }) => {
      mutateWorkout(date, (w) => {
        if (w.exercises.some((e) => e.id === preset.id)) return w; // 当天去重
        const context = options?.intent === "context" || !options?.intent
          ? w.exercises.find((exercise) => exercise.prescription)?.prescription
          : undefined;
        const intent = options?.intent && options.intent !== "context" ? options.intent : undefined;
        const prescription = prescriptionForPreset(preset, w.type, intent, context);
        const ex = applyPrescriptionSnapshot({
          id: preset.id,
          name: preset.name,
          isMain: preset.isMain,
          sets: [],
          primaryMuscle: preset.primaryMuscle,
          secondaryMuscles: preset.secondaryMuscles,
          volumeContributions: preset.volumeContributions,
          recordModes: preset.recordModes,
        }, prescription);
        return { ...w, done: false, exercises: [...w.exercises, ex] };
      });
    },
    [mutateWorkout]
  );

  const removeExercise = useCallback(
    (date: string, exerciseId: string) => {
      mutateWorkout(date, (w) => ({
        ...w,
        done: false,
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
        exercises: workout.exercises.map((exercise) => exercise.id === exerciseId
          ? { ...exercise, sets: exercise.sets.filter((_, currentIndex) => currentIndex !== index) }
          : exercise),
      }));
    },
    [mutateWorkout]
  );

  const setExercisePlannedLoad = useCallback(
    (date: string, exerciseId: string, weight?: number) => {
      mutateExercise(date, exerciseId, (exercise) => applyExercisePlannedLoad(exercise, weight));
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
  }, []);

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
  }, []);

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

  /** 新建模板（受每类型上限约束）。返回新 id，超限返回 null。 */
  const createTemplate = useCallback((type: TrainingType, name: string): string | null => {
    const list = dataRef.current.templates ?? [];
    if (list.filter((t) => t.type === type).length >= MAX_TEMPLATES_PER_TYPE) {
      return null;
    }
    const id = genTplId();
    setData((prev) => {
      const current = prev.templates ?? [];
      if (current.filter((t) => t.type === type).length >= MAX_TEMPLATES_PER_TYPE) {
        return prev;
      }
      const tpl: Template = { id, name: name.trim() || name, type, items: [] };
      return { ...prev, templates: [...current, tpl] };
    });
    return id;
  }, []);

  const duplicateTemplate = useCallback((id: string): string | null => {
    const current = dataRef.current.templates ?? [];
    const source = current.find((t) => t.id === id);
    if (!source) return null;
    if (current.filter((t) => t.type === source.type).length >= MAX_TEMPLATES_PER_TYPE) {
      return null;
    }
    const nextId = genTplId();
    setData((prev) => {
      const source = (prev.templates ?? []).find((t) => t.id === id);
      if (!source) return prev;
      const list = prev.templates ?? [];
      if (list.filter((t) => t.type === source.type).length >= MAX_TEMPLATES_PER_TYPE) {
        return prev;
      }
      const copy: Template = {
        ...source,
        id: nextId,
        name: `${source.name.trim() || "模板"} 副本`,
        items: source.items.map((item) => ({ ...item })),
      };
      const sourceIndex = list.findIndex((t) => t.id === id);
      const next = [...list];
      next.splice(sourceIndex + 1, 0, copy);
      return { ...prev, templates: next };
    });
    return nextId;
  }, []);

  const moveTemplate = useCallback((id: string, dir: -1 | 1) => {
    setData((prev) => {
      const list = prev.templates ?? [];
      const index = list.findIndex((t) => t.id === id);
      if (index < 0) return prev;
      const target = index + dir;
      if (target < 0 || target >= list.length) return prev;
      if (list[index].type !== list[target].type) return prev;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, templates: next };
    });
  }, []);

  const renameTemplate = useCallback((id: string, name: string) => {
    setData((prev) => ({
      ...prev,
      templates: (prev.templates ?? []).map((t) =>
        t.id === id ? { ...t, name } : t
      ),
    }));
  }, []);

  const setTemplateItems = useCallback((id: string, items: TemplateItem[]) => {
    setData((prev) => {
      const pool = new Map(
        [...DEFAULT_EXERCISES, ...prev.customExercises].map((preset) => [preset.id, preset])
      );
      const canonicalItems = items.map((item) =>
        normalizeTemplateItemPrescription(item, pool.get(item.exerciseId))
      );
      return {
        ...prev,
        templates: (prev.templates ?? []).map((template) =>
          template.id === id ? { ...template, items: canonicalItems } : template
        ),
      };
    });
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setData((prev) => {
      const next = (prev.templates ?? []).filter((t) => t.id !== id);
      const clearBinding = (step: import("./types").MicrocycleStep) => step.templateId === id ? { ...step, templateId: undefined } : step;
      const trainingTemplateIds = prev.cutPlan?.trainingTemplateIds
        ? Object.fromEntries(Object.entries(prev.cutPlan.trainingTemplateIds).filter(([, templateId]) => templateId !== id)) as NonNullable<CutPlan["trainingTemplateIds"]>
        : undefined;
      return {
        ...prev,
        templates: next.length ? next : undefined,
        schedule: prev.schedule.microcycle ? { ...prev.schedule, microcycle: prev.schedule.microcycle.map(clearBinding) } : prev.schedule,
        microcycle: prev.microcycle?.steps ? { ...prev.microcycle, steps: prev.microcycle.steps.map(clearBinding) } : prev.microcycle,
        cutPlan: prev.cutPlan ? { ...prev.cutPlan, trainingTemplateIds: trainingTemplateIds && Object.keys(trainingTemplateIds).length ? trainingTemplateIds : undefined } : prev.cutPlan,
      };
    });
  }, []);

  /**
   * 套用模板到某天：合并去重（已有的动作保留，模板里缺的补进来）。
   * 不写入任何重量 —— 重量交给"沿用上次"。返回新增动作数。
   */
  const applyTemplate = useCallback(
    (id: string, date: string): number => {
      const tpl = dataRef.current.templates?.find((t) => t.id === id);
      if (!tpl || !tpl.items.length) return 0;
      const currentExercises = dataRef.current.days[date]?.workout?.exercises ?? [];
      const currentIds = new Set(currentExercises.filter((exercise) => workingSets(exercise.sets).length > 0).map((exercise) => exercise.id));
      const added = tpl.items.filter((item) => !currentIds.has(item.exerciseId)).length;
      // 预设池：内置 + 自定义（拿 primaryMuscle / isMain 快照）
      setData((prev) => {
        const day = prev.days[date] ?? { date };
        const microcycle = day.workout
          ? ensureMicrocycle(prev, date)
          : microcycleForNewWorkout(prev, date);
        const pool = [...DEFAULT_EXERCISES, ...prev.customExercises];
        const cutSnapshot = currentCutSnapshot(prev.profile, prev.bodyWeights, prev.waistEntries);
        const cutActive = isCutModeActive(prev.cutPlan);
        const cutScale = prev.cutPlan?.trainingVolumeScale ?? suggestedCutVolumeScale(cutSnapshot?.bodyFatPercent, prev.cutPlan?.weeklyLossPct);
        const existing = day.workout?.exercises ?? [];
        // 已记录组数的动作保留（绝不丢数据）；其余（空的、上一个模板残留的）一律替换掉
        const kept = existing.filter((e) => workingSets(e.sets).length > 0);
        const keptIds = new Set(kept.map((e) => e.id));

        const fresh: Exercise[] = [];
        for (const it of tpl.items) {
          if (keptIds.has(it.exerciseId)) continue; // 已保留（有记录）的不重复加
          const preset = pool.find((p) => p.id === it.exerciseId);
          const prescription = prescriptionFromTemplateItem(it, preset);
          fresh.push(applyPrescriptionSnapshot({
            id: it.exerciseId,
            name: preset?.name ?? it.name ?? "动作",
            isMain: preset?.isMain ?? false,
            sets: [],
            primaryMuscle: preset?.primaryMuscle,
            secondaryMuscles: preset?.secondaryMuscles,
            volumeContributions: preset?.volumeContributions,
            recordModes: it.recordModes ?? preset?.recordModes,
          }, { ...prescription, workingSets: cutActive ? cutAdjustedSets(prescription.workingSets, cutScale) : prescription.workingSets }));
        }
        return {
          ...prev,
          microcycle,
          days: {
            ...prev.days,
            [date]: {
              ...day,
              date,
              // Editing an existing historical day must not move it to the current cycle.
              workout: {
                type: tpl.type,
                templateId: tpl.id,
                microcycleId: day.workout?.microcycleId ?? microcycle.currentId,
                done: false,
                ...(day.workout?.difficulty ? { difficulty: day.workout.difficulty } : {}),
                exercises: [...kept, ...fresh],
              },
            },
          },
        };
      });
      return added;
    },
    []
  );

  // ---- 跨天查询 ----
  const lastSession = useCallback(
    (exerciseId: string, beforeDate: string, progressionTrackId?: string) => {
      const history = findTrackHistory(data.days, exerciseId, beforeDate, progressionTrackId);
      if (!history.same) return null;
      return {
        date: history.same.date,
        sets: history.same.sets,
        exercise: history.same.exercise,
        other: history.other,
        legacy: history.legacy,
      };
    },
    [data.days]
  );

  const lastNutrition = useCallback(
    (beforeDate: string) => {
      const dates = Object.keys(data.days)
        .filter((d) => d < beforeDate)
        .sort()
        .reverse();
      for (const d of dates) {
        const n = data.days[d].nutrition;
        if (n && (n.calories || n.protein || n.carbs || n.fat)) return n;
      }
      return null;
    },
    [data.days]
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
  }, []);

  const removeBodyWeight = useCallback((date: string) => {
    setData((prev) => ({
      ...prev,
      bodyWeights: prev.bodyWeights.filter((e) => e.date !== date),
    }));
  }, []);

  // ---- 腰围 ----
  const setWaist = useCallback((date: string, waist: number) => {
    setData((prev) => {
      const rest = prev.waistEntries.filter((e) => e.date !== date);
      const next: WaistEntry[] = [...rest, { date, waist }].sort((a, b) =>
        a.date < b.date ? -1 : 1
      );
      return { ...prev, waistEntries: next };
    });
  }, []);

  const removeWaist = useCallback((date: string) => {
    setData((prev) => ({
      ...prev,
      waistEntries: prev.waistEntries.filter((e) => e.date !== date),
    }));
  }, []);

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
    []
  );

  const removeCustomExercise = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      customExercises: prev.customExercises.filter((e) => e.id !== id),
    }));
  }, []);

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
      if (!name) return;
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
      setData((prev) => {
        const customExercises = prev.customExercises.map((e) =>
          e.id === id
            ? {
                ...e,
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
            : e
        );
        // 自定义动作的记录方式属于未来处方，模板引用需要一起更新。
        let templates = prev.templates;
        if (templates) {
          let changed = false;
          const next = templates.map((t) => {
            let itemsChanged = false;
            const items = t.items.map((it) => {
              if (it.exerciseId === id) {
                const mode = recordModes?.includes("duration") ? "duration" : recordModes?.includes("distance") ? "distance" : "reps";
                const modeChanged = JSON.stringify(it.recordModes ?? ["weight", "reps"]) !== JSON.stringify(recordModes ?? ["weight", "reps"]);
                if (it.name === name && !modeChanged) return it;
                itemsChanged = true;
                return normalizeTemplateItemPrescription({
                  ...it,
                  name,
                  recordModes,
                  ...(modeChanged ? {
                    repsLow: mode === "duration" ? 30 : mode === "distance" ? 20 : 8,
                    repsHigh: mode === "duration" ? 60 : mode === "distance" ? 50 : 12,
                    prescription: undefined,
                    progressionTrackId: undefined,
                    progressionTrackLabel: undefined,
                  } : {}),
                }, customExercises.find((exercise) => exercise.id === id));
              }
              return it;
            });
            if (itemsChanged) {
              changed = true;
              return { ...t, items };
            }
            return t;
          });
          if (changed) templates = next;
        }
        return { ...prev, customExercises, templates };
      });
    },
    []
  );

  // ---- 计划 ----
  const setSchedule = useCallback((schedule: Schedule) => {
    setData((prev) => ({ ...prev, schedule, microcycle: microcycleForScheduleEdit(prev, schedule) }));
  }, []);

  const setMuscleTarget = useCallback((muscle: MuscleGroup, low: number, high: number) => {
    setData((prev) => ({
      ...prev,
      muscleTargets: {
        ...(prev.muscleTargets ?? {}),
        [muscle]: { low: Math.max(0, Math.round(low)), high: Math.max(Math.round(low), Math.round(high)) },
      },
    }));
  }, []);

  const startNewMicrocycle = useCallback((date: string) => {
    setData((prev) => ({ ...prev, microcycle: nextMicrocycle(prev.microcycle, date, prev.schedule) }));
  }, []);

  // ---- 跨天 type 查询 ----
  const lastWorkoutByType = useCallback(
    (type: TrainingType, beforeDate: string) => {
      const dates = Object.keys(data.days)
        .filter((d) => d < beforeDate)
        .sort()
        .reverse();
      for (const d of dates) {
        const w = data.days[d].workout;
        if (
          w &&
          w.type === type &&
          w.done !== false &&
          w.exercises.some((e) => workingSets(e.sets).length > 0)
        ) {
          return {
            date: d,
            exercises: w.exercises.filter((e) => workingSets(e.sets).length > 0),
          };
        }
      }
      return null;
    },
    [data.days]
  );

  // ---- 数据管理 ----
  const exportData = useCallback(() => {
    import("./storage").then((m) => m.downloadBackup(data));
    // 标记最后一次备份
    setData((prev) => ({ ...prev, lastBackupAt: new Date().toISOString() }));
  }, [data]);

  const importFromText = useCallback((text: string) => {
    const next = parseBackup(text);
    // 把导入时刻当作新的"已同步"基点
    next.lastBackupAt = new Date().toISOString();
    setData(next);
    saveData(next);
  }, []);

  const repairData = useCallback(() => {
    const current = dataRef.current;
    const issueCount = inspectDataHealth(current).issueCount;
    const repaired = normalizeData(current);
    setData(repaired);
    saveData(repaired);
    return issueCount;
  }, []);

  const clearAll = useCallback(() => {
    const fresh = emptyData();
    setData(fresh);
    saveData(fresh);
  }, []);

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
      deleteTemplate,
      applyTemplate,
      lastSession,
      lastNutrition,
      setBodyWeight,
      removeBodyWeight,
      setWaist,
      removeWaist,
      addCustomExercise,
      removeCustomExercise,
      updateCustomExercise,
      setSchedule,
      setMuscleTarget,
      startNewMicrocycle,
      lastWorkoutByType,
      exportData,
      importFromText,
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
      deleteTemplate,
      applyTemplate,
      lastSession,
      lastNutrition,
      setBodyWeight,
      removeBodyWeight,
      setWaist,
      removeWaist,
      addCustomExercise,
      removeCustomExercise,
      updateCustomExercise,
      setSchedule,
      setMuscleTarget,
      startNewMicrocycle,
      lastWorkoutByType,
      exportData,
      importFromText,
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
