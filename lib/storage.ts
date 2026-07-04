import type {
  BackupData,
  BodyWeightEntry,
  WaistEntry,
  CutPlan,
  ActivityEnergyEntry,
  DayLog,
  ExercisePreset,
  Profile,
  Schedule,
  Template,
  TemplateItem,
  TemplateSlot,
  TrainingType,
} from "./types";

// ============================================================
// 本地优先存储：单个 JSON blob 存于 localStorage
// 数据量极小（每天 ~1KB），同步读写足够快、足够可靠
// 导出 / 导入 直接复用同一份结构
// ============================================================

const KEY = "fitlog:v1";
export const SCHEMA_VERSION = 5;

export interface AppData {
  days: Record<string, DayLog>;
  bodyWeights: BodyWeightEntry[];
  waistEntries: WaistEntry[];
  /** 减脂目标与日常活动基线；旧数据可为空。 */
  cutPlan?: CutPlan;
  customExercises: ExercisePreset[];
  schedule: Schedule;
  /** 身体数据（用于心率区间推算），全部可选 */
  profile?: Profile;
  /** 具名训练模板：推1/推2/拉1/拉2/腿（B 层） */
  templates?: Template[];
  /** 最近一次导出 / 导入备份的时间（ISO），用于"备份感知"提醒 */
  lastBackupAt?: string;
}

const VALID_TYPES: TrainingType[] = ["push", "pull", "legs", "rest", "custom"];

export function defaultSchedule(): Schedule {
  // 合理的 PPL 默认模板，用户可在「计划」页编辑
  return { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] };
}

export function emptyData(): AppData {
  return {
    days: {},
    bodyWeights: [],
    waistEntries: [],
    customExercises: [],
    schedule: defaultSchedule(),
  };
}

/** 仅在浏览器端调用 */
export function loadData(): AppData {
  if (typeof window === "undefined") return emptyData();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw);
    return normalize(parsed);
  } catch {
    return emptyData();
  }
}

export function saveData(data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    // 存储满 / 隐私模式等 —— 静默失败，不阻断 UI
    console.warn("保存失败：", e);
  }
}

/** 把任意来源数据规整成合法的 AppData，防止脏数据炸 UI */
function normalize(input: unknown): AppData {
  const out = emptyData();
  if (!input || typeof input !== "object") return out;
  const obj = input as Record<string, unknown>;

  if (obj.days && typeof obj.days === "object") {
    for (const [k, v] of Object.entries(obj.days as Record<string, unknown>)) {
      const day = v as DayLog;
      if (day && typeof day === "object") {
        const next: DayLog = { ...day, date: k };
        // v1.38：手动补充的主动活动消耗。只收可识别来源与合理数值。
        if (Array.isArray(day.activityEnergy)) {
          const allowed = new Set(["strength", "steps", "wearable", "other"]);
          const entries = (day.activityEnergy as ActivityEnergyEntry[]).filter(
            (e) =>
              e &&
              typeof e.id === "string" &&
              typeof e.kcal === "number" &&
              Number.isFinite(e.kcal) &&
              e.kcal > 0 &&
              e.kcal <= 3000 &&
              allowed.has(e.source)
          );
          if (entries.length) next.activityEnergy = entries;
          else delete next.activityEnergy;
        } else {
          delete next.activityEnergy;
        }
        out.days[k] = next;
      }
    }
  }
  if (Array.isArray(obj.bodyWeights)) {
    out.bodyWeights = (obj.bodyWeights as BodyWeightEntry[]).filter(
      (e) => e && typeof e.date === "string" && typeof e.weight === "number"
    );
  }
  // v1.37 新增：腰围历史。旧数据没有该字段时自然保持为空。
  if (Array.isArray(obj.waistEntries)) {
    out.waistEntries = (obj.waistEntries as WaistEntry[]).filter(
      (e) =>
        e &&
        typeof e.date === "string" &&
        typeof e.waist === "number" &&
        Number.isFinite(e.waist) &&
        e.waist >= 30 &&
        e.waist <= 200
    );
  }
  // v1.38：减脂计划；没有则保持为空，兼容旧备份。
  if (obj.cutPlan && typeof obj.cutPlan === "object") {
    const c = obj.cutPlan as Record<string, unknown>;
    const plan: CutPlan = {};
    if (c.baselineActivity === "low" || c.baselineActivity === "light" || c.baselineActivity === "moderate" || c.baselineActivity === "high") {
      plan.baselineActivity = c.baselineActivity;
    }
    if (typeof c.weeklyLossPct === "number" && Number.isFinite(c.weeklyLossPct) && c.weeklyLossPct >= 0.1 && c.weeklyLossPct <= 1.5) {
      plan.weeklyLossPct = Math.round(c.weeklyLossPct * 100) / 100;
    }
    if (typeof c.enabled === "boolean") {
      plan.enabled = c.enabled;
    }
    if (typeof c.targetBodyFatPct === "number" && Number.isFinite(c.targetBodyFatPct) && c.targetBodyFatPct >= 5 && c.targetBodyFatPct <= 45) {
      plan.targetBodyFatPct = Math.round(c.targetBodyFatPct * 10) / 10;
    }
    if (typeof c.trainingVolumeScale === "number" && Number.isFinite(c.trainingVolumeScale) && c.trainingVolumeScale >= 0.5 && c.trainingVolumeScale <= 1) {
      plan.trainingVolumeScale = Math.round(c.trainingVolumeScale * 100) / 100;
    }
    if (typeof c.weeklyCardioMinutes === "number" && Number.isFinite(c.weeklyCardioMinutes) && c.weeklyCardioMinutes >= 30 && c.weeklyCardioMinutes <= 420) {
      plan.weeklyCardioMinutes = Math.round(c.weeklyCardioMinutes);
    }
    // Legacy v1.38 field: keep it only so an imported backup loses no data.
    if (typeof c.targetWeightKg === "number" && Number.isFinite(c.targetWeightKg) && c.targetWeightKg >= 30 && c.targetWeightKg <= 300) {
      plan.targetWeightKg = Math.round(c.targetWeightKg * 10) / 10;
    }
    if (Object.keys(plan).length) out.cutPlan = plan;
  }
  if (Array.isArray(obj.customExercises)) {
    out.customExercises = (obj.customExercises as ExercisePreset[]).filter(
      (e) => e && typeof e.id === "string" && typeof e.name === "string"
    );
  }
  // schedule: 容错读取
  if (
    obj.schedule &&
    typeof obj.schedule === "object" &&
    Array.isArray((obj.schedule as Schedule).split) &&
    (obj.schedule as Schedule).split.length === 7
  ) {
    out.schedule = {
      split: (obj.schedule as Schedule).split.map((t) =>
        VALID_TYPES.includes(t as TrainingType) ? (t as TrainingType) : ""
      ) as (TrainingType | "")[],
    };
  }
  if (typeof obj.lastBackupAt === "string") {
    out.lastBackupAt = obj.lastBackupAt;
  }
  // profile: 容错读取（全部可选，仅取合理数值）
  if (obj.profile && typeof obj.profile === "object") {
    const p = obj.profile as Record<string, unknown>;
    const prof: Profile = {};
    if (p.sex === "male" || p.sex === "female") prof.sex = p.sex;
    if (typeof p.heightCm === "number" && p.heightCm >= 120 && p.heightCm <= 230)
      prof.heightCm = p.heightCm;
    if (typeof p.birthYear === "number" && p.birthYear > 1900 && p.birthYear < 2100)
      prof.birthYear = p.birthYear;
    if (typeof p.restingHR === "number" && p.restingHR >= 20 && p.restingHR < 150)
      prof.restingHR = p.restingHR;
    if (typeof p.maxHR === "number" && p.maxHR > 100 && p.maxHR < 230)
      prof.maxHR = p.maxHR;
    if (p.trainingLevel === "beginner" || p.trainingLevel === "intermediate" || p.trainingLevel === "advanced")
      prof.trainingLevel = p.trainingLevel;
    if (Object.keys(prof).length) out.profile = prof;
  }
  // templates: 支持新格式（Template[]）+ 迁移旧格式（按槽位的对象）
  {
    const genId = () => "tpl_" + Math.random().toString(36).slice(2, 10);
    const parseItem = (it: unknown): TemplateItem | null => {
      if (!it || typeof it !== "object") return null;
      const o = it as Record<string, unknown>;
      if (typeof o.exerciseId !== "string" || !o.exerciseId) return null;
      let repsLow: number;
      let repsHigh: number;
      if (typeof o.repsLow === "number" && typeof o.repsHigh === "number") {
        repsLow = o.repsLow;
        repsHigh = o.repsHigh;
      } else if (typeof o.reps === "string") {
        const m = o.reps.match(/(\d+)\s*[-–~]\s*(\d+)/);
        if (m) {
          repsLow = Number(m[1]);
          repsHigh = Number(m[2]);
        } else {
          const single = parseInt(o.reps, 10);
          repsLow = Number.isFinite(single) ? single : 8;
          repsHigh = Number.isFinite(single) ? single : 12;
        }
      } else {
        repsLow = 8;
        repsHigh = 12;
      }
      repsLow = Math.min(30, Math.max(1, Math.round(repsLow)));
      repsHigh = Math.min(40, Math.max(repsLow, Math.round(repsHigh)));
      return {
        exerciseId: o.exerciseId,
        name: typeof o.name === "string" ? o.name : "",
        sets:
          typeof o.sets === "number" && o.sets >= 1 && o.sets <= 12
            ? Math.round(o.sets)
            : 3,
        repsLow,
        repsHigh,
        ...(typeof o.rpe === "number" && o.rpe >= 5 && o.rpe <= 10
          ? { rpe: o.rpe }
          : {}),
      };
    };

    if (Array.isArray(obj.templates)) {
      // 新格式：Template[]
      const list: Template[] = [];
      for (const t of obj.templates) {
        if (!t || typeof t !== "object") continue;
        const o = t as Record<string, unknown>;
        if (o.type !== "push" && o.type !== "pull" && o.type !== "legs") continue;
        const items = Array.isArray(o.items)
          ? (o.items.map(parseItem).filter(Boolean) as TemplateItem[])
          : [];
        list.push({
          id: typeof o.id === "string" && o.id ? o.id : genId(),
          name: typeof o.name === "string" ? o.name : "",
          type: o.type,
          items,
        });
      }
      if (list.length) out.templates = list;
    } else if (obj.templates && typeof obj.templates === "object") {
      // 旧格式：按槽位的对象 → 迁移为具名 Template
      const SLOT_META: Record<TemplateSlot, { type: TrainingType; name: string }> = {
        push1: { type: "push", name: "推 1" },
        push2: { type: "push", name: "推 2" },
        pull1: { type: "pull", name: "拉 1" },
        pull2: { type: "pull", name: "拉 2" },
        legs1: { type: "legs", name: "腿" },
      };
      const src = obj.templates as Record<string, unknown>;
      const list: Template[] = [];
      (Object.keys(SLOT_META) as TemplateSlot[]).forEach((slot) => {
        const arr = src[slot];
        if (!Array.isArray(arr)) return;
        const items = arr.map(parseItem).filter(Boolean) as TemplateItem[];
        if (!items.length) return;
        list.push({
          id: genId(),
          name: SLOT_META[slot].name,
          type: SLOT_META[slot].type,
          items,
        });
      });
      if (list.length) out.templates = list;
    }
  }
  return out;
}

// ---------------- 导出 / 导入 ----------------

export function toBackup(data: AppData): BackupData {
  return {
    app: "fitlog",
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    days: data.days,
    bodyWeights: data.bodyWeights,
    waistEntries: data.waistEntries,
    cutPlan: data.cutPlan,
    customExercises: data.customExercises,
    schedule: data.schedule,
    profile: data.profile,
    templates: data.templates,
  };
}

export function downloadBackup(data: AppData): void {
  const backup = toBackup(data);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `fitlog-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseBackup(text: string): AppData {
  const parsed = JSON.parse(text);
  if (!parsed || parsed.app !== "fitlog") {
    throw new Error("文件格式不正确：不是 fitlog 备份");
  }
  return normalize(parsed);
}

export function parseBackupWithMeta(text: string): {
  data: AppData;
  exportedAt?: string;
  version?: number;
} {
  const parsed = JSON.parse(text) as {
    app?: unknown;
    exportedAt?: unknown;
    version?: unknown;
  };
  if (!parsed || parsed.app !== "fitlog") {
    throw new Error("文件格式不正确：不是 fitlog 备份");
  }
  return {
    data: normalize(parsed),
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : undefined,
    version: typeof parsed.version === "number" ? parsed.version : undefined,
  };
}
