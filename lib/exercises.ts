import type { Exercise, ExercisePreset, TrainingType, VolumeContribution } from "./types";
import type { MuscleGroup } from "./muscles";

type PresetInput = Omit<ExercisePreset, "isMain" | "recordModes" | "compound" | "volumeContributions"> & {
  isMain?: boolean;
  compound?: boolean;
  volumeContributions: VolumeContribution[];
};

function primary(contributions: VolumeContribution[]): MuscleGroup | undefined {
  return contributions.find((item) => item.direct)?.muscle ?? contributions[0]?.muscle;
}

function secondary(contributions: VolumeContribution[]): MuscleGroup[] {
  const p = primary(contributions);
  return contributions.map((item) => item.muscle).filter((muscle) => muscle !== p);
}

function ex(input: PresetInput): ExercisePreset {
  return {
    isMain: input.compound ?? false,
    recordModes: ["weight", "reps"],
    defaultLoadIncrementKg: input.equipment === "bodyweight" ? 0 : input.defaultLoadIncrementKg ?? 2.5,
    ...input,
    compound: input.compound ?? false,
    primaryMuscle: input.primaryMuscle ?? primary(input.volumeContributions),
    secondaryMuscles: input.secondaryMuscles ?? secondary(input.volumeContributions),
  };
}

const c = (muscle: MuscleGroup, weight = 1, direct = true): VolumeContribution => ({ muscle, weight, direct });
const s = (muscle: MuscleGroup, weight = 0.5): VolumeContribution => ({ muscle, weight, direct: false });

export const DEFAULT_EXERCISES: ExercisePreset[] = [
  ex({ id: "px_barbell_bench", name: "平板杠铃卧推", englishName: "Barbell Bench Press", aliases: ["bench press", "卧推", "杠铃卧推"], type: "push", equipment: "free", movementPattern: "horizontalPush", compound: true, category: "胸 · 平推", volumeContributions: [c("chest"), s("frontDelt", 0.5), s("triceps", 0.5)], alternatives: ["px_db_bench", "px_chest_press", "px_smith_bench"] }),
  ex({ id: "px_db_bench", name: "平板哑铃卧推", englishName: "Dumbbell Bench Press", aliases: ["db bench", "哑铃卧推"], type: "push", equipment: "free", movementPattern: "horizontalPush", compound: true, category: "胸 · 平推", volumeContributions: [c("chest"), s("frontDelt", 0.5), s("triceps", 0.4)], alternatives: ["px_barbell_bench", "px_chest_press"] }),
  ex({ id: "px_smith_bench", name: "史密斯卧推", englishName: "Smith Machine Bench Press", aliases: ["smith bench", "史密斯平板"], type: "push", equipment: "machine", movementPattern: "horizontalPush", compound: true, category: "胸 · 平推", volumeContributions: [c("chest"), s("frontDelt", 0.45), s("triceps", 0.45)], alternatives: ["px_barbell_bench", "px_chest_press"] }),
  ex({ id: "px_chest_press", name: "悍马推胸", englishName: "Hammer Strength Chest Press", aliases: ["hammer chest press", "悍马机推胸"], type: "push", equipment: "machine", movementPattern: "horizontalPush", compound: true, category: "胸 · 平推", volumeContributions: [c("chest"), s("frontDelt", 0.4), s("triceps", 0.4)], alternatives: ["px_machine_chest_press", "px_barbell_bench", "px_db_bench"] }),
  ex({ id: "px_machine_chest_press", name: "器械推胸", englishName: "Seated Machine Chest Press", aliases: ["坐姿推胸", "machine chest press"], type: "push", equipment: "machine", movementPattern: "horizontalPush", compound: true, category: "胸 · 平推", volumeContributions: [c("chest"), s("frontDelt", 0.4), s("triceps", 0.4)], alternatives: ["px_chest_press", "px_smith_bench", "px_db_bench"] }),
  ex({ id: "px_incline_barbell", name: "上斜杠铃卧推", englishName: "Incline Barbell Bench Press", aliases: ["incline bench", "上斜卧推", "上斜杠铃"], type: "push", equipment: "free", movementPattern: "inclinePush", compound: true, category: "胸 · 上斜", region: "上胸", volumeContributions: [c("upperChest"), s("chest", 0.7), s("frontDelt", 0.6), s("triceps", 0.4)], alternatives: ["px_incline_db", "px_incline_press", "px_incline_smith"] }),
  ex({ id: "px_incline_db", name: "上斜哑铃卧推", englishName: "Incline Dumbbell Press", aliases: ["incline dumbbell press", "上斜哑铃"], type: "push", equipment: "free", movementPattern: "inclinePush", compound: true, category: "胸 · 上斜", region: "上胸", volumeContributions: [c("upperChest"), s("chest", 0.65), s("frontDelt", 0.55), s("triceps", 0.35)], alternatives: ["px_incline_barbell", "px_incline_press"] }),
  ex({ id: "px_incline_smith", name: "上斜史密斯推", englishName: "Incline Smith Press", aliases: ["smith incline press", "上斜史密斯卧推"], type: "push", equipment: "machine", movementPattern: "inclinePush", compound: true, category: "胸 · 上斜", region: "上胸", volumeContributions: [c("upperChest"), s("chest", 0.65), s("frontDelt", 0.55), s("triceps", 0.35)], alternatives: ["px_incline_barbell", "px_incline_press"] }),
  ex({ id: "px_incline_press", name: "上斜器械推", englishName: "Incline Machine Press", aliases: ["上斜推胸", "incline chest press"], type: "push", equipment: "machine", movementPattern: "inclinePush", compound: true, category: "胸 · 上斜", region: "上胸", volumeContributions: [c("upperChest"), s("chest", 0.65), s("frontDelt", 0.5), s("triceps", 0.35)], alternatives: ["px_incline_db", "px_incline_barbell"] }),
  ex({ id: "px_dips", name: "双杠臂屈伸", englishName: "Dips", aliases: ["dips", "双杠"], type: "push", equipment: "bodyweight", movementPattern: "horizontalPush", compound: true, category: "胸/三头", region: "下胸", volumeContributions: [c("chest"), s("triceps", 0.8), s("frontDelt", 0.35)], alternatives: ["px_decline_press", "px_close_grip_bench"] }),
  ex({ id: "px_pec_deck", name: "蝴蝶机夹胸", englishName: "Pec Deck Fly", aliases: ["pec deck", "蝴蝶机"], type: "push", equipment: "machine", movementPattern: "fly", category: "胸 · 夹胸", volumeContributions: [c("chest")], alternatives: ["px_cable_fly"] }),
  ex({ id: "px_cable_fly", name: "绳索夹胸", englishName: "Cable Fly", aliases: ["cable fly", "夹胸"], type: "push", equipment: "cable", movementPattern: "fly", category: "胸 · 夹胸", volumeContributions: [c("chest")], alternatives: ["px_pec_deck"] }),
  ex({ id: "px_decline_press", name: "下胸推", englishName: "Decline Chest Press", aliases: ["decline press", "下斜推胸"], type: "push", equipment: "machine", movementPattern: "horizontalPush", compound: true, category: "胸 · 下胸", region: "下胸", volumeContributions: [c("chest"), s("triceps", 0.45), s("frontDelt", 0.3)], alternatives: ["px_dips", "px_chest_press"] }),

  ex({ id: "px_lateral_raise", name: "哑铃侧平举", englishName: "Dumbbell Lateral Raise", aliases: ["侧平举", "lateral raise"], type: "push", equipment: "free", movementPattern: "lateralRaise", category: "肩 · 中束", volumeContributions: [c("sideDelt")], alternatives: ["px_cable_lateral", "px_machine_lateral"] }),
  ex({ id: "px_cable_lateral", name: "绳索侧平举", englishName: "Cable Lateral Raise", aliases: ["cable lateral raise"], type: "push", equipment: "cable", movementPattern: "lateralRaise", category: "肩 · 中束", volumeContributions: [c("sideDelt")], alternatives: ["px_lateral_raise", "px_machine_lateral"] }),
  ex({ id: "px_machine_lateral", name: "器械侧平举", englishName: "Machine Lateral Raise", aliases: ["machine lateral raise"], type: "push", equipment: "machine", movementPattern: "lateralRaise", category: "肩 · 中束", volumeContributions: [c("sideDelt")], alternatives: ["px_lateral_raise", "px_cable_lateral"] }),
  ex({ id: "px_shoulder_press", name: "推肩", englishName: "Machine Shoulder Press", aliases: ["坐姿肩推", "shoulder press"], type: "push", equipment: "machine", movementPattern: "verticalPush", compound: true, category: "肩 · 推举", volumeContributions: [c("frontDelt"), s("sideDelt", 0.5), s("triceps", 0.5)], alternatives: ["px_db_shoulder_press", "px_barbell_ohp"] }),
  ex({ id: "px_db_shoulder_press", name: "哑铃推举", englishName: "Dumbbell Shoulder Press", aliases: ["db shoulder press", "哑铃肩推"], type: "push", equipment: "free", movementPattern: "verticalPush", compound: true, category: "肩 · 推举", volumeContributions: [c("frontDelt"), s("sideDelt", 0.5), s("triceps", 0.5)], alternatives: ["px_shoulder_press", "px_barbell_ohp"] }),
  ex({ id: "px_barbell_ohp", name: "杠铃推举", englishName: "Overhead Press", aliases: ["OHP", "barbell shoulder press"], type: "push", equipment: "free", movementPattern: "verticalPush", compound: true, category: "肩 · 推举", volumeContributions: [c("frontDelt"), s("sideDelt", 0.45), s("triceps", 0.55)], alternatives: ["px_db_shoulder_press", "px_smith_press"] }),
  ex({ id: "px_smith_press", name: "史密斯推举", englishName: "Smith Machine Shoulder Press", aliases: ["smith shoulder press"], type: "push", equipment: "machine", movementPattern: "verticalPush", compound: true, category: "肩 · 推举", volumeContributions: [c("frontDelt"), s("sideDelt", 0.45), s("triceps", 0.5)], alternatives: ["px_shoulder_press", "px_barbell_ohp"] }),

  ex({ id: "pl_pullup", name: "引体向上", englishName: "Pull Up", aliases: ["pull-up", "引体"], type: "pull", equipment: "bodyweight", movementPattern: "verticalPull", compound: true, category: "背 · 下拉", volumeContributions: [c("lats"), s("upperBack", 0.5), s("biceps", 0.5)], alternatives: ["pl_assisted_pullup", "pl_lat_pulldown"] }),
  ex({ id: "pl_assisted_pullup", name: "辅助引体", englishName: "Assisted Pull Up", aliases: ["assisted pullup"], type: "pull", equipment: "machine", movementPattern: "verticalPull", compound: true, category: "背 · 下拉", volumeContributions: [c("lats"), s("upperBack", 0.45), s("biceps", 0.45)], alternatives: ["pl_pullup", "pl_lat_pulldown"] }),
  ex({ id: "pl_lat_pulldown", name: "宽握下拉", englishName: "Wide Grip Lat Pulldown", aliases: ["高位下拉", "lat pulldown", "下拉"], type: "pull", equipment: "cable", movementPattern: "verticalPull", compound: true, category: "背 · 下拉", volumeContributions: [c("lats"), s("upperBack", 0.4), s("biceps", 0.45)], alternatives: ["pl_pullup", "pl_close_pulldown"] }),
  ex({ id: "pl_close_pulldown", name: "窄握下拉", englishName: "Close Grip Lat Pulldown", aliases: ["close grip pulldown", "窄握高位下拉", "V 把下拉"], type: "pull", equipment: "cable", movementPattern: "verticalPull", compound: true, category: "背 · 下拉", volumeContributions: [c("lats"), s("upperBack", 0.35), s("biceps", 0.5)], alternatives: ["pl_lat_pulldown", "pl_reverse_pulldown"] }),
  ex({ id: "pl_reverse_pulldown", name: "反握下拉", englishName: "Reverse Grip Pulldown", aliases: ["反手下拉"], type: "pull", equipment: "cable", movementPattern: "verticalPull", compound: true, category: "背 · 下拉", volumeContributions: [c("lats"), s("biceps", 0.55), s("upperBack", 0.35)], alternatives: ["pl_close_pulldown", "pl_single_arm_pulldown"] }),
  ex({ id: "pl_single_arm_pulldown", name: "单臂下拉", englishName: "Single Arm Pulldown", aliases: ["单手下拉"], type: "pull", equipment: "cable", movementPattern: "verticalPull", category: "背 · 下拉", volumeContributions: [c("lats"), s("biceps", 0.3)], alternatives: ["pl_lat_pulldown", "pl_straight_arm"] }),
  ex({ id: "pl_barbell_row", name: "杠铃划船", englishName: "Barbell Row", aliases: ["barbell row"], type: "pull", equipment: "free", movementPattern: "horizontalPull", compound: true, category: "背 · 划船", volumeContributions: [c("upperBack"), s("lats", 0.6), s("rearDelt", 0.35), s("biceps", 0.4), s("lowerBack", 0.35)], alternatives: ["pl_seated_row", "pl_hammer_row"] }),
  ex({ id: "pl_db_row", name: "哑铃划船", englishName: "Dumbbell Row", aliases: ["db row"], type: "pull", equipment: "free", movementPattern: "horizontalPull", compound: true, category: "背 · 划船", volumeContributions: [c("upperBack"), s("lats", 0.65), s("biceps", 0.35)], alternatives: ["pl_single_arm_machine_row", "pl_seated_row"] }),
  ex({ id: "pl_seated_row", name: "坐姿划船", englishName: "Seated Cable Row", aliases: ["seated row"], type: "pull", equipment: "cable", movementPattern: "horizontalPull", compound: true, category: "背 · 划船", volumeContributions: [c("upperBack"), s("lats", 0.55), s("rearDelt", 0.35), s("biceps", 0.35)], alternatives: ["pl_barbell_row", "pl_hammer_row"] }),
  ex({ id: "pl_single_arm_machine_row", name: "单臂器械划船", englishName: "Single Arm Machine Row", aliases: ["单臂划船"], type: "pull", equipment: "machine", movementPattern: "horizontalPull", compound: true, category: "背 · 划船", volumeContributions: [c("upperBack"), s("lats", 0.6), s("biceps", 0.35)], alternatives: ["pl_db_row", "pl_hammer_row"] }),
  ex({ id: "pl_hammer_row", name: "悍马划船", englishName: "Hammer Strength Row", aliases: ["hammer row"], type: "pull", equipment: "machine", movementPattern: "horizontalPull", compound: true, category: "背 · 划船", volumeContributions: [c("upperBack"), s("lats", 0.6), s("rearDelt", 0.35), s("biceps", 0.35)], alternatives: ["pl_seated_row", "pl_high_row"] }),
  ex({ id: "pl_high_row", name: "高位划船", englishName: "High Row", aliases: ["high row"], type: "pull", equipment: "machine", movementPattern: "horizontalPull", compound: true, category: "背 · 划船", volumeContributions: [c("lats"), s("upperBack", 0.7), s("rearDelt", 0.35), s("biceps", 0.35)], alternatives: ["pl_hammer_row", "pl_lat_pulldown"] }),
  ex({ id: "pl_straight_arm", name: "直臂下拉", englishName: "Straight Arm Pulldown", aliases: ["straight arm pulldown"], type: "pull", equipment: "cable", movementPattern: "verticalPull", category: "背 · 孤立", volumeContributions: [c("lats")], alternatives: ["pl_single_arm_pulldown"] }),
  ex({ id: "pl_back_extension", name: "山羊挺身", englishName: "Back Extension", aliases: ["hyperextension", "背伸"], type: "pull", equipment: "bodyweight", movementPattern: "hipHinge", category: "下背/核心", volumeContributions: [c("lowerBack"), s("glutes", 0.45), s("hamstrings", 0.35)], alternatives: ["lg_rdl"] }),
  ex({ id: "pl_rear_delt_fly", name: "反向飞鸟", englishName: "Reverse Fly", aliases: ["rear delt fly"], type: "pull", equipment: "free", movementPattern: "rearDelt", category: "肩 · 后束", volumeContributions: [c("rearDelt"), s("upperBack", 0.3)], alternatives: ["pl_rear_delt", "pl_face_pull"] }),
  ex({ id: "pl_rear_delt", name: "反向蝴蝶机", englishName: "Reverse Pec Deck", aliases: ["反向飞鸟机", "reverse pec deck"], type: "pull", equipment: "machine", movementPattern: "rearDelt", category: "肩 · 后束", volumeContributions: [c("rearDelt"), s("upperBack", 0.25)], alternatives: ["pl_rear_delt_fly", "pl_face_pull"] }),
  ex({ id: "pl_face_pull", name: "面拉", englishName: "Face Pull", aliases: ["face pull"], type: "pull", equipment: "cable", movementPattern: "rearDelt", category: "肩 · 后束", volumeContributions: [c("rearDelt"), s("upperBack", 0.35), s("traps", 0.25)], alternatives: ["pl_rear_delt", "pl_rear_delt_row"] }),
  ex({ id: "pl_rear_delt_row", name: "后束划船", englishName: "Rear Delt Row", aliases: ["rear delt row"], type: "pull", equipment: "free", movementPattern: "horizontalPull", category: "肩 · 后束", volumeContributions: [c("rearDelt"), s("upperBack", 0.45), s("biceps", 0.25)], alternatives: ["pl_face_pull", "pl_rear_delt"] }),

  ex({ id: "pl_biceps_curl", name: "杠铃弯举", englishName: "Barbell Curl", aliases: ["二头弯举", "barbell curl"], type: "pull", equipment: "free", movementPattern: "armCurl", category: "手臂 · 二头", volumeContributions: [c("biceps"), s("forearms", 0.35)], alternatives: ["pl_db_curl", "pl_cable_curl"] }),
  ex({ id: "pl_db_curl", name: "哑铃弯举", englishName: "Dumbbell Curl", aliases: ["db curl"], type: "pull", equipment: "free", movementPattern: "armCurl", category: "手臂 · 二头", volumeContributions: [c("biceps"), s("forearms", 0.3)], alternatives: ["pl_biceps_curl", "pl_preacher_curl"] }),
  ex({ id: "pl_hammer_curl", name: "锤式弯举", englishName: "Hammer Curl", aliases: ["hammer curl"], type: "pull", equipment: "free", movementPattern: "armCurl", category: "手臂 · 二头", volumeContributions: [c("biceps"), s("forearms", 0.55)], alternatives: ["pl_db_curl", "pl_cable_curl"] }),
  ex({ id: "pl_cable_curl", name: "绳索弯举", englishName: "Cable Curl", aliases: ["cable curl"], type: "pull", equipment: "cable", movementPattern: "armCurl", category: "手臂 · 二头", volumeContributions: [c("biceps"), s("forearms", 0.3)], alternatives: ["pl_biceps_curl", "pl_preacher_curl"] }),
  ex({ id: "pl_preacher_curl", name: "牧师凳弯举", englishName: "Preacher Curl", aliases: ["preacher curl"], type: "pull", equipment: "machine", movementPattern: "armCurl", category: "手臂 · 二头", volumeContributions: [c("biceps"), s("forearms", 0.25)], alternatives: ["pl_db_curl", "pl_cable_curl"] }),
  ex({ id: "px_triceps_pushdown", name: "绳索下压", englishName: "Cable Triceps Pushdown", aliases: ["三头下压", "pushdown"], type: "push", equipment: "cable", movementPattern: "armExtension", category: "手臂 · 三头", volumeContributions: [c("triceps")], alternatives: ["px_overhead_ext"] }),
  ex({ id: "px_skullcrusher", name: "臂屈伸", englishName: "Skull Crusher", aliases: ["仰卧臂屈伸"], type: "push", equipment: "free", movementPattern: "armExtension", category: "手臂 · 三头", volumeContributions: [c("triceps")], alternatives: ["px_overhead_ext", "px_triceps_pushdown"] }),
  ex({ id: "px_close_grip_bench", name: "窄距卧推", englishName: "Close Grip Bench Press", aliases: ["close grip bench"], type: "push", equipment: "free", movementPattern: "horizontalPush", compound: true, category: "手臂 · 三头", volumeContributions: [c("triceps"), s("chest", 0.55), s("frontDelt", 0.35)], alternatives: ["px_dips", "px_triceps_pushdown"] }),
  ex({ id: "px_overhead_ext", name: "过顶臂屈伸", englishName: "Overhead Triceps Extension", aliases: ["overhead extension"], type: "push", equipment: "cable", movementPattern: "armExtension", category: "手臂 · 三头", volumeContributions: [c("triceps")], alternatives: ["px_triceps_pushdown", "px_skullcrusher"] }),

  ex({ id: "lg_squat", name: "深蹲", englishName: "Back Squat", aliases: ["squat", "杠铃深蹲"], type: "legs", equipment: "free", movementPattern: "squat", compound: true, category: "腿 · 蹲", volumeContributions: [c("quads"), s("glutes", 0.65), s("lowerBack", 0.25), s("hamstrings", 0.25)], alternatives: ["lg_front_squat", "lg_hack_squat"] }),
  ex({ id: "lg_front_squat", name: "前蹲", englishName: "Front Squat", aliases: ["front squat"], type: "legs", equipment: "free", movementPattern: "squat", compound: true, category: "腿 · 蹲", volumeContributions: [c("quads"), s("glutes", 0.45), s("lowerBack", 0.2)], alternatives: ["lg_squat", "lg_hack_squat"] }),
  ex({ id: "lg_leg_press", name: "腿举", englishName: "Leg Press", aliases: ["leg press"], type: "legs", equipment: "machine", movementPattern: "squat", compound: true, category: "腿 · 蹲", volumeContributions: [c("quads"), s("glutes", 0.55), s("hamstrings", 0.2)], alternatives: ["lg_hack_squat", "lg_squat"] }),
  ex({ id: "lg_hack_squat", name: "哈克深蹲", englishName: "Hack Squat", aliases: ["hack squat"], type: "legs", equipment: "machine", movementPattern: "squat", compound: true, category: "腿 · 蹲", volumeContributions: [c("quads"), s("glutes", 0.45)], alternatives: ["lg_leg_press", "lg_squat"] }),
  ex({ id: "lg_pendulum_squat", name: "海豹深蹲", englishName: "Pendulum Squat", aliases: ["pendulum squat", "摆动深蹲"], type: "legs", equipment: "machine", movementPattern: "squat", compound: true, category: "腿 · 蹲", volumeContributions: [c("quads"), s("glutes", 0.45)], alternatives: ["lg_hack_squat", "lg_leg_press"] }),
  ex({ id: "lg_leg_extension", name: "腿屈伸", englishName: "Leg Extension", aliases: ["坐姿腿屈伸", "leg extension"], type: "legs", equipment: "machine", movementPattern: "kneeExtension", category: "腿 · 股四头", volumeContributions: [c("quads")], alternatives: ["lg_squat", "lg_leg_press"] }),
  ex({ id: "lg_leg_curl", name: "腿弯举", englishName: "Leg Curl", aliases: ["俯卧腿弯举", "leg curl"], type: "legs", equipment: "machine", movementPattern: "kneeFlexion", category: "腿 · 腘绳", volumeContributions: [c("hamstrings")], alternatives: ["lg_seated_leg_curl", "lg_rdl"] }),
  ex({ id: "lg_seated_leg_curl", name: "坐姿腿弯举", englishName: "Seated Leg Curl", aliases: ["seated leg curl"], type: "legs", equipment: "machine", movementPattern: "kneeFlexion", category: "腿 · 腘绳", volumeContributions: [c("hamstrings")], alternatives: ["lg_leg_curl", "lg_rdl"] }),
  ex({ id: "lg_rdl", name: "罗马尼亚硬拉", englishName: "Romanian Deadlift", aliases: ["RDL", "romanian deadlift"], type: "legs", equipment: "free", movementPattern: "hipHinge", compound: true, category: "腿 · 髋铰链", volumeContributions: [c("hamstrings"), s("glutes", 0.65), s("lowerBack", 0.45)], alternatives: ["lg_deadlift", "lg_leg_curl"] }),
  ex({ id: "lg_hip_thrust", name: "臀推", englishName: "Hip Thrust", aliases: ["臀冲", "hip thrust"], type: "legs", equipment: "machine", movementPattern: "hipHinge", compound: true, category: "腿 · 臀", volumeContributions: [c("glutes"), s("hamstrings", 0.3)], alternatives: ["lg_rdl"] }),
  ex({ id: "lg_deadlift", name: "硬拉", englishName: "Deadlift", aliases: ["deadlift"], type: "legs", equipment: "free", movementPattern: "hipHinge", compound: true, category: "腿 · 髋铰链", volumeContributions: [c("lowerBack"), s("hamstrings", 0.65), s("glutes", 0.65), s("upperBack", 0.35)], alternatives: ["lg_rdl"] }),
  ex({ id: "lg_hip_abduction", name: "髋外展", englishName: "Hip Abduction", aliases: ["外展机"], type: "legs", equipment: "machine", movementPattern: "custom", category: "腿 · 外展", volumeContributions: [c("abductors"), s("glutes", 0.3)], alternatives: ["abd_cable"] }),
  ex({ id: "add_machine", name: "髋内收", englishName: "Hip Adduction", aliases: ["坐姿夹腿", "内收机"], type: "legs", equipment: "machine", movementPattern: "custom", category: "腿 · 内收", volumeContributions: [c("adductors")], alternatives: ["add_copenhagen"] }),
  ex({ id: "lg_calf_raise", name: "提踵", englishName: "Standing Calf Raise", aliases: ["calf raise"], type: "legs", equipment: "machine", movementPattern: "calfRaise", category: "腿 · 小腿", volumeContributions: [c("calves")], alternatives: ["lg_seated_calf_raise"] }),
  ex({ id: "lg_seated_calf_raise", name: "坐姿提踵", englishName: "Seated Calf Raise", aliases: ["seated calf raise"], type: "legs", equipment: "machine", movementPattern: "calfRaise", category: "腿 · 小腿", volumeContributions: [c("calves")], alternatives: ["lg_calf_raise"] }),

  ex({ id: "ab_crunch", name: "卷腹", englishName: "Crunch", aliases: ["crunch"], type: "custom", equipment: "bodyweight", movementPattern: "core", category: "核心", recordModes: ["reps"], volumeContributions: [c("abs")], alternatives: ["ab_cable_crunch"] } as PresetInput),
  ex({ id: "ab_cable_crunch", name: "绳索卷腹", englishName: "Cable Crunch", aliases: ["cable crunch"], type: "custom", equipment: "cable", movementPattern: "core", category: "核心", volumeContributions: [c("abs")], alternatives: ["ab_crunch"] }),
  ex({ id: "ab_hanging_leg", name: "悬垂举腿", englishName: "Hanging Leg Raise", aliases: ["hanging leg raise"], type: "custom", equipment: "bodyweight", movementPattern: "core", category: "核心", volumeContributions: [c("abs")], alternatives: ["ab_crunch"] }),
  ex({ id: "ab_dead_bug", name: "死虫", englishName: "Dead Bug", aliases: ["dead bug"], type: "custom", equipment: "bodyweight", movementPattern: "core", category: "核心", recordModes: ["reps"], volumeContributions: [c("abs", 0.7)], alternatives: ["ab_plank"] } as PresetInput),
  ex({ id: "ab_plank", name: "平板支撑", englishName: "Plank", aliases: ["plank"], type: "custom", equipment: "bodyweight", movementPattern: "core", category: "核心", recordModes: ["duration"], volumeContributions: [c("abs", 0.7)], alternatives: ["ab_dead_bug"] } as PresetInput),
  ex({ id: "tr_shrug", name: "耸肩", englishName: "Shrug", aliases: ["shrug"], type: "pull", equipment: "free", movementPattern: "carry", category: "斜方", volumeContributions: [c("traps"), s("forearms", 0.2)], alternatives: ["tr_machine_shrug"] }),
  ex({ id: "tr_machine_shrug", name: "器械耸肩", englishName: "Machine Shrug", aliases: ["machine shrug"], type: "pull", equipment: "machine", movementPattern: "carry", category: "斜方", volumeContributions: [c("traps")], alternatives: ["tr_shrug"] }),
  ex({ id: "fa_wrist_curl", name: "腕弯举", englishName: "Wrist Curl", aliases: ["wrist curl"], type: "pull", equipment: "free", movementPattern: "armCurl", category: "前臂", volumeContributions: [c("forearms")], alternatives: ["fa_rev_wrist_curl"] }),
  ex({ id: "fa_rev_wrist_curl", name: "反向腕弯举", englishName: "Reverse Wrist Curl", aliases: ["reverse wrist curl"], type: "pull", equipment: "free", movementPattern: "armCurl", category: "前臂", volumeContributions: [c("forearms")], alternatives: ["fa_wrist_curl"] }),
  ex({ id: "abd_cable", name: "绳索髋外展", englishName: "Cable Hip Abduction", aliases: ["cable hip abduction"], type: "legs", equipment: "cable", movementPattern: "custom", category: "腿 · 外展", volumeContributions: [c("abductors"), s("glutes", 0.25)], alternatives: ["lg_hip_abduction"] }),
  ex({ id: "add_copenhagen", name: "哥本哈根侧桥", englishName: "Copenhagen Plank", aliases: ["copenhagen plank"], type: "legs", equipment: "bodyweight", movementPattern: "core", category: "腿 · 内收", volumeContributions: [c("adductors"), s("abs", 0.35)], alternatives: ["add_machine"] }),
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

export function typeHasExercises(t: TrainingType): boolean {
  return t !== "rest";
}

export function makeCustomId(): string {
  return "cx_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function findPreset(id: string, custom: ExercisePreset[] = []) {
  return [...DEFAULT_EXERCISES, ...custom].find((item) => item.id === id);
}

export function presetForHistoricalExercise(exercise: Exercise, type: TrainingType, custom: ExercisePreset[] = []): ExercisePreset {
  return findPreset(exercise.id, custom) ?? {
    id: exercise.id,
    name: exercise.name,
    isMain: exercise.isMain,
    type,
    primaryMuscle: exercise.primaryMuscle,
    secondaryMuscles: exercise.secondaryMuscles,
    volumeContributions: exercise.volumeContributions,
    recordModes: exercise.recordModes,
  };
}

export function searchExercisePreset(preset: ExercisePreset, query: string) {
  const normalized = query.normalize("NFKC").trim().toLowerCase();
  if (!normalized) return true;
  const tokens = normalized.split(/[\s/,_-]+/).filter(Boolean);
  const fields = [preset.name, preset.englishName, preset.category, preset.region, ...(preset.aliases ?? [])]
    .filter(Boolean)
    .map((value) => String(value).normalize("NFKC").toLowerCase());
  return tokens.every((token) => {
    const compact = token.replace(/[\s/,_-]+/g, "");
    return fields.some((field) => field.includes(token) || field.replace(/[\s/,_-]+/g, "").includes(compact));
  });
}
