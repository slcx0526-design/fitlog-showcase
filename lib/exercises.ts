import type { ExercisePreset, TrainingType } from "./types";

// ============================================================
// 内置动作预设（器械 / 绳索为主，对应 PPL 分化）
// id 固定不变 —— "上次记录"与自动填充均依赖它
// isMain：复合主项标记（仅视觉区分，无评分用途）
// ============================================================

export const DEFAULT_EXERCISES: ExercisePreset[] = [
  // 推 Push（胸 / 肩 / 三头）
  { id: "px_chest_press", name: "坐姿推胸", isMain: true, type: "push", primaryMuscle: "chest", equipment: "machine", region: "中胸" },
  { id: "px_incline_press", name: "上斜推胸", isMain: true, type: "push", primaryMuscle: "chest", equipment: "machine", region: "上胸" },
  { id: "px_pec_deck", name: "蝴蝶机夹胸", isMain: false, type: "push", primaryMuscle: "chest", equipment: "machine", region: "中胸" },
  { id: "px_cable_fly", name: "绳索夹胸", isMain: false, type: "push", primaryMuscle: "chest", equipment: "cable", region: "中胸" },
  { id: "px_shoulder_press", name: "坐姿肩推", isMain: true, type: "push", primaryMuscle: "frontDelt", equipment: "machine" },
  { id: "px_lateral_raise", name: "侧平举", isMain: false, type: "push", primaryMuscle: "sideDelt", equipment: "free" },
  { id: "px_triceps_pushdown", name: "三头下压", isMain: false, type: "push", primaryMuscle: "triceps", equipment: "cable" },
  { id: "px_overhead_ext", name: "过顶臂屈伸", isMain: false, type: "push", primaryMuscle: "triceps", equipment: "cable" },

  // 拉 Pull（背 / 后束 / 二头）
  { id: "pl_lat_pulldown", name: "高位下拉", isMain: true, type: "pull", primaryMuscle: "back", equipment: "cable", region: "阔背" },
  { id: "pl_seated_row", name: "坐姿划船", isMain: true, type: "pull", primaryMuscle: "back", equipment: "cable", region: "中背" },
  { id: "pl_close_pulldown", name: "对握下拉", isMain: false, type: "pull", primaryMuscle: "back", equipment: "cable", region: "阔背" },
  { id: "pl_rear_delt", name: "反向蝴蝶机", isMain: false, type: "pull", primaryMuscle: "rearDelt", equipment: "machine" },
  { id: "pl_face_pull", name: "面拉", isMain: false, type: "pull", primaryMuscle: "rearDelt", equipment: "cable" },
  { id: "pl_biceps_curl", name: "二头弯举", isMain: false, type: "pull", primaryMuscle: "biceps", equipment: "free" },
  { id: "pl_hammer_curl", name: "锤式弯举", isMain: false, type: "pull", primaryMuscle: "biceps", equipment: "free" },

  // 腿 Legs
  { id: "lg_leg_press", name: "腿举", isMain: true, type: "legs", primaryMuscle: "quads", equipment: "machine" },
  { id: "lg_hack_squat", name: "哈克深蹲", isMain: true, type: "legs", primaryMuscle: "quads", equipment: "machine" },
  { id: "lg_leg_extension", name: "坐姿腿屈伸", isMain: false, type: "legs", primaryMuscle: "quads", equipment: "machine" },
  { id: "lg_leg_curl", name: "俯卧腿弯举", isMain: false, type: "legs", primaryMuscle: "hamstrings", equipment: "machine" },
  { id: "lg_hip_thrust", name: "臀冲", isMain: true, type: "legs", primaryMuscle: "glutes", equipment: "machine" },
  { id: "lg_hip_abduction", name: "髋外展", isMain: false, type: "legs", primaryMuscle: "abductors", equipment: "machine" },
  { id: "lg_calf_raise", name: "提踵", isMain: false, type: "legs", primaryMuscle: "calves", equipment: "machine" },

  // —— v1.10 扩充：真练、反馈大的动作 ——
  // 推 Push 补充
  { id: "px_incline_db", name: "上斜哑铃卧推", isMain: true, type: "push", primaryMuscle: "chest", equipment: "free", region: "上胸" },
  { id: "px_dips", name: "双杠臂屈伸", isMain: false, type: "push", primaryMuscle: "chest", equipment: "bodyweight", region: "下胸" },
  { id: "px_cable_lateral", name: "绳索侧平举", isMain: false, type: "push", primaryMuscle: "sideDelt", equipment: "cable" },
  { id: "px_machine_lateral", name: "器械侧平举", isMain: false, type: "push", primaryMuscle: "sideDelt", equipment: "machine" },
  { id: "px_skullcrusher", name: "仰卧臂屈伸", isMain: false, type: "push", primaryMuscle: "triceps", equipment: "free" },

  // 拉 Pull 补充
  { id: "pl_pullup", name: "引体向上", isMain: true, type: "pull", primaryMuscle: "back", equipment: "bodyweight", region: "阔背" },
  { id: "pl_straight_arm", name: "直臂下拉", isMain: false, type: "pull", primaryMuscle: "back", equipment: "cable", region: "阔背" },
  { id: "pl_barbell_row", name: "杠铃划船", isMain: true, type: "pull", primaryMuscle: "back", equipment: "free", region: "中背" },
  { id: "pl_preacher_curl", name: "牧师凳弯举", isMain: false, type: "pull", primaryMuscle: "biceps", equipment: "machine" },

  // 腿 Legs 补充
  { id: "lg_squat", name: "深蹲", isMain: true, type: "legs", primaryMuscle: "quads", equipment: "free" },
  { id: "lg_bulgarian", name: "保加利亚分腿蹲", isMain: false, type: "legs", primaryMuscle: "quads", equipment: "free" },
  { id: "lg_rdl", name: "罗马尼亚硬拉", isMain: true, type: "legs", primaryMuscle: "hamstrings", equipment: "free" },
  { id: "lg_seated_leg_curl", name: "坐姿腿弯举", isMain: false, type: "legs", primaryMuscle: "hamstrings", equipment: "machine" },

  // 腹肌 Abs（无固定日，记录页常驻"腹肌"分组）
  { id: "ab_crunch", name: "卷腹", isMain: false, type: "custom", primaryMuscle: "abs", equipment: "bodyweight" },
  { id: "ab_hanging_leg", name: "悬垂举腿", isMain: false, type: "custom", primaryMuscle: "abs", equipment: "bodyweight" },
  { id: "ab_cable_crunch", name: "绳索卷腹", isMain: false, type: "custom", primaryMuscle: "abs", equipment: "cable" },

  // —— v1.20 全身肌群补全：新增部位的内置动作 ——
  // 斜方肌 traps
  { id: "tr_shrug", name: "耸肩", isMain: false, type: "pull", primaryMuscle: "traps", equipment: "free" },
  { id: "tr_machine_shrug", name: "器械耸肩", isMain: false, type: "pull", primaryMuscle: "traps", equipment: "machine" },
  { id: "tr_upright_row", name: "直立划船", isMain: false, type: "pull", primaryMuscle: "traps", equipment: "cable" },
  // 前臂 forearms
  { id: "fa_wrist_curl", name: "腕弯举", isMain: false, type: "pull", primaryMuscle: "forearms", equipment: "free" },
  { id: "fa_rev_wrist_curl", name: "反向腕弯举", isMain: false, type: "pull", primaryMuscle: "forearms", equipment: "free" },
  // 前锯肌 serratus
  { id: "se_pushup_plus", name: "前锯肌俯卧撑", isMain: false, type: "push", primaryMuscle: "serratus", equipment: "bodyweight" },
  { id: "se_cable_punch", name: "绳索前推", isMain: false, type: "push", primaryMuscle: "serratus", equipment: "cable" },
  // 内收肌 adductors
  { id: "add_machine", name: "坐姿夹腿", isMain: false, type: "legs", primaryMuscle: "adductors", equipment: "machine" },
  { id: "add_copenhagen", name: "哥本哈根侧桥", isMain: false, type: "legs", primaryMuscle: "adductors", equipment: "bodyweight" },
  // 外展肌 abductors（髋外展已归此类）
  { id: "abd_cable", name: "绳索髋外展", isMain: false, type: "legs", primaryMuscle: "abductors", equipment: "cable" },
  // 颈部 neck
  { id: "ne_flexion", name: "颈部前屈", isMain: false, type: "custom", primaryMuscle: "neck", equipment: "bodyweight" },
  { id: "ne_extension", name: "颈部后伸", isMain: false, type: "custom", primaryMuscle: "neck", equipment: "bodyweight" },
];

const TYPE_LABEL: Record<TrainingType, string> = {
  push: "推",
  pull: "拉",
  legs: "腿",
  rest: "休息",
  custom: "自定义",
};

export function typeLabel(t: TrainingType): string {
  return TYPE_LABEL[t];
}

/** 是否有动作可记录（休息日没有动作列表） */
export function typeHasExercises(t: TrainingType): boolean {
  return t !== "rest";
}

/** 生成一个稳定的自定义动作 ID */
export function makeCustomId(): string {
  return "cx_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
