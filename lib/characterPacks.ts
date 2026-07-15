import type { UIMode } from "./uiMode";

export type CharacterMode = Exclude<UIMode, "lite">;

export type CharacterId =
  | "joker"
  | "queen"
  | "oracle"
  | "violet"
  | "makoto"
  | "mitsuru"
  | "fuuka"
  | "aigis"
  | "joel"
  | "ellie"
  | "abby";

export type CharacterPack = {
  id: CharacterId;
  mode: CharacterMode;
  name: string;
  codename?: string;
  title: string;
  description: string;
  tone: string;
  accent: string;
  accentSoft: string;
  ink: string;
  prop: string;
  propDetail: string;
  heroKicker: string;
  homeFocus: string;
  trainFocus: string;
  portraitVariant: CharacterId;
};

export const CHARACTER_PACKS: Record<CharacterId, CharacterPack> = {
  joker: {
    id: "joker", mode: "pulse", name: "Joker", codename: "JOKER", title: "The Heist Lead",
    description: "目标、推进、把今天拿下。", tone: "直接行动，不给拖延留空间。",
    accent: "#ef2a2d", accentSoft: "#7e1519", ink: "#fff7e7", prop: "Mask & Cards", propDetail: "面具轮廓、扑克牌切片、夺取目标印记",
    heroKicker: "TODAY'S TARGET", homeFocus: "主任务 / 下一步行动", trainFocus: "主动作推进 / 完成结算", portraitVariant: "joker",
  },
  queen: {
    id: "queen", mode: "pulse", name: "Queen", codename: "QUEEN", title: "The Command Lead",
    description: "计划先行，节奏必须可控。", tone: "按顺序推进，把偏差压到最低。",
    accent: "#7fb7df", accentSoft: "#203d61", ink: "#f5fbff", prop: "Command Grid", propDetail: "战术网格、仪表环、指挥路径",
    heroKicker: "COMMAND ROUTE", homeFocus: "今日安排 / 周计划推进", trainFocus: "顺序 / 休息 / 执行率", portraitVariant: "queen",
  },
  oracle: {
    id: "oracle", mode: "pulse", name: "Oracle", codename: "ORACLE", title: "The Data Lead",
    description: "记录不是堆数据，是为了看清问题。", tone: "扫描已完成，下一项偏差正在等待解释。",
    accent: "#f07fcb", accentSoft: "#5d2152", ink: "#fff5fd", prop: "Scanner Array", propDetail: "雷达环、Debug 层、扫描网格",
    heroKicker: "LIVE DIAGNOSTIC", homeFocus: "今日数据摘要 / 异常提醒", trainFocus: "容量 / 完成率 / 强度信号", portraitVariant: "oracle",
  },
  violet: {
    id: "violet", mode: "pulse", name: "Violet", codename: "VIOLET", title: "The Rhythm Lead",
    description: "动作、节奏、连续性，都要漂亮地落在正确位置。", tone: "保持重心，下一次执行会更干净。",
    accent: "#e587aa", accentSoft: "#6a2343", ink: "#fff6fa", prop: "Ribbon Trace", propDetail: "丝带轨迹、菱形切面、姿态引导线",
    heroKicker: "RHYTHM CHECK", homeFocus: "连续性 / 节奏 / 技术执行", trainFocus: "动作质量 / 组间节奏", portraitVariant: "violet",
  },
  makoto: {
    id: "makoto", mode: "midnight", name: "Makoto", title: "The Moonlit Lead",
    description: "把今天安静地过好，长期自然会回答。", tone: "夜色还在，下一段时间仍由你决定。",
    accent: "#b6ecff", accentSoft: "#265c9e", ink: "#f4fdff", prop: "Moon Phase", propDetail: "月相、时间刻度、夜水波纹",
    heroKicker: "MOONLIGHT PERIOD", homeFocus: "今日状态 / 长期趋势", trainFocus: "安静执行 / 恢复节奏", portraitVariant: "makoto",
  },
  mitsuru: {
    id: "mitsuru", mode: "midnight", name: "Mitsuru", title: "The Discipline Lead",
    description: "目标必须被拆解、安排并完成。", tone: "按计划推进，偏差要有理由。",
    accent: "#e9a1ba", accentSoft: "#632039", ink: "#fff7fb", prop: "Rapier & Seal", propDetail: "细剑轨迹、封蜡、冰裂对称框",
    heroKicker: "DISCIPLINE PLAN", homeFocus: "阶段目标 / 周期纪律", trainFocus: "计划顺序 / 周内推进", portraitVariant: "mitsuru",
  },
  fuuka: {
    id: "fuuka", mode: "midnight", name: "Fuuka", title: "The Scan Lead",
    description: "数据本身不说话，解释才会帮你前进。", tone: "我会把今天的信号整理清楚。",
    accent: "#8ee8cc", accentSoft: "#21655c", ink: "#effffb", prop: "Radar Field", propDetail: "扫描波、导航节点、透明信息层",
    heroKicker: "GUIDANCE SCAN", homeFocus: "解释性摘要 / 数据提示", trainFocus: "状态提醒 / 负荷扫描", portraitVariant: "fuuka",
  },
  aigis: {
    id: "aigis", mode: "midnight", name: "Aigis", title: "The System Lead",
    description: "准确执行，剩下的交给累计。", tone: "当前协议清晰。请完成下一工作组。",
    accent: "#f5bc66", accentSoft: "#725324", ink: "#fff9ed", prop: "Core Module", propDetail: "机械环、琥珀提示灯、插槽模块",
    heroKicker: "SYSTEM PROTOCOL", homeFocus: "完成率 / 当前协议", trainFocus: "组数 / 休息 / 负荷精度", portraitVariant: "aigis",
  },
  joel: {
    id: "joel", mode: "survival", name: "Joel", title: "The Field Lead",
    description: "先把基础状态守住，再谈下一段路。", tone: "补给够不够，路线清不清楚，先确认这两件事。",
    accent: "#78946a", accentSoft: "#40583c", ink: "#f5f0df", prop: "Field Map", propDetail: "折叠地图、背包织带、手电光斑",
    heroKicker: "FIELD ROUTE", homeFocus: "体征 / 补给 / 行动", trainFocus: "最必要的训练信息", portraitVariant: "joel",
  },
  ellie: {
    id: "ellie", mode: "survival", name: "Ellie", title: "The Journal Lead",
    description: "这段路走过什么，要留下痕迹。", tone: "把今天写下来，之后你会看见它的意义。",
    accent: "#c7887f", accentSoft: "#66413a", ink: "#fff5e8", prop: "Journal & Strings", propDetail: "手写日记、涂写、琴弦与回忆痕迹",
    heroKicker: "JOURNEY ENTRY", homeFocus: "旅程节点 / 连续记录", trainFocus: "里程碑 / 个人痕迹", portraitVariant: "ellie",
  },
  abby: {
    id: "abby", mode: "survival", name: "Abby", title: "The Strength Lead",
    description: "力量不是情绪，是一次次负荷后的适应。", tone: "恢复够了就加码，没够就把基础守住。",
    accent: "#9fb8c2", accentSoft: "#41555f", ink: "#f4f7f5", prop: "Load & Wraps", propDetail: "训练绷带、配重片、工业绳索",
    heroKicker: "LOAD CHECK", homeFocus: "力量 / 恢复 / 负荷", trainFocus: "容量 / 强度 / 表现", portraitVariant: "abby",
  },
};

export const DEFAULT_CHARACTER_BY_MODE: Record<CharacterMode, CharacterId> = {
  pulse: "joker",
  midnight: "makoto",
  survival: "joel",
};

export function packsForMode(mode: CharacterMode) {
  return (Object.values(CHARACTER_PACKS) as CharacterPack[]).filter((pack) => pack.mode === mode);
}

export function getCharacterPack(id: CharacterId) {
  return CHARACTER_PACKS[id];
}
