"use client";

import { usePathname } from "next/navigation";
import { useUIMode } from "@/lib/uiMode";
import CharacterPortrait from "@/components/CharacterPortrait";

type RouteKey = "nutrition" | "cut" | "progress" | "cardio" | "data";

type GuideCopy = { label: string; focus: string; action: string };

const ROUTES: Array<{ key: RouteKey; match: (pathname: string) => boolean }> = [
  { key: "nutrition", match: (pathname) => pathname.startsWith("/nutrition") },
  { key: "cut", match: (pathname) => pathname.startsWith("/cut") },
  { key: "progress", match: (pathname) => pathname.startsWith("/progress") || pathname.startsWith("/history") },
  { key: "cardio", match: (pathname) => pathname.startsWith("/cardio") },
  { key: "data", match: (pathname) => pathname.startsWith("/data") },
];

const CHARACTER_GUIDES: Record<string, Record<RouteKey, GuideCopy>> = {
  joker: {
    nutrition: { label: "FUEL TARGET", focus: "先把今天的补给拿下来。", action: "记录真实摄入" },
    cut: { label: "EDGE CHECK", focus: "赤字要有策略，不要用情绪硬扛。", action: "查看今日偏差" },
    progress: { label: "PROOF FILE", focus: "结果已经留下，下一次要做得更干净。", action: "查看训练证据" },
    cardio: { label: "MOVE LINE", focus: "保持移动，别让节奏断掉。", action: "记录有氧" },
    data: { label: "STATUS BOARD", focus: "用数据确认今天该抢哪一步。", action: "更新晨重" },
  },
  queen: {
    nutrition: { label: "RATION PLAN", focus: "补给是计划的一部分，不是训练后的补救。", action: "核对目标" },
    cut: { label: "CONTROL GAP", focus: "只处理真正的偏差，不制造额外压力。", action: "检查执行率" },
    progress: { label: "WEEKLY REVIEW", focus: "用结果校正下一周的安排。", action: "复盘趋势" },
    cardio: { label: "PACE CONTROL", focus: "速度并不重要，稳定完成才重要。", action: "查看有氧计划" },
    data: { label: "CHECK-IN", focus: "记录越稳定，决策越准确。", action: "录入体重" },
  },
  oracle: {
    nutrition: { label: "FUEL SCAN", focus: "先录数据，解释会自己浮出来。", action: "同步热量" },
    cut: { label: "TREND SCAN", focus: "看 7 天趋势，不被单日波动带走。", action: "读取趋势" },
    progress: { label: "DATA TRACE", focus: "容量、体重、表现正在形成同一条线。", action: "打开图表" },
    cardio: { label: "MOTION SIGNAL", focus: "把有氧当作可分析的输入。", action: "记录时长" },
    data: { label: "LIVE INPUT", focus: "每一条真实数据都会减少误判。", action: "添加记录" },
  },
  violet: {
    nutrition: { label: "BALANCE", focus: "节奏顺了，饮食也会更容易稳定。", action: "完成补给" },
    cut: { label: "FLOW CHECK", focus: "别急着修正，让连续性先保持住。", action: "查看节奏" },
    progress: { label: "FORM TRACE", focus: "稳定的细节，会变成长期的曲线。", action: "回看进度" },
    cardio: { label: "RHYTHM", focus: "找到能持续的步频和呼吸。", action: "记录路线" },
    data: { label: "DAILY LINE", focus: "轻一点，但每天都留下准确痕迹。", action: "记录晨重" },
  },
  makoto: {
    nutrition: { label: "NIGHT FUEL", focus: "今天的补给已经是明天状态的一部分。", action: "记录饮食" },
    cut: { label: "TIME WINDOW", focus: "把判断交给时间，而不是一瞬间的焦虑。", action: "查看周趋势" },
    progress: { label: "LONG VIEW", focus: "慢一点没关系，只要方向没有停。", action: "查看长期曲线" },
    cardio: { label: "QUIET MOTION", focus: "安静完成今天的移动时段。", action: "记录有氧" },
    data: { label: "MORNING MARK", focus: "留下一条今天的身体坐标。", action: "记录晨重" },
  },
  mitsuru: {
    nutrition: { label: "STANDARD FUEL", focus: "把饮食执行到位，训练才有依据。", action: "核对营养" },
    cut: { label: "PHASE CONTROL", focus: "目标、过程、调整，缺一不可。", action: "检查阶段" },
    progress: { label: "DISCIPLINE REVIEW", focus: "用数据判断计划是否值得继续。", action: "复盘目标" },
    cardio: { label: "CARDIO ORDER", focus: "按强度和时间窗口完成即可。", action: "开始记录" },
    data: { label: "DAILY STANDARD", focus: "每日记录是纪律的一部分。", action: "录入数据" },
  },
  fuuka: {
    nutrition: { label: "SUPPORT READ", focus: "补给信息已准备好，下一步更清楚。", action: "更新摄入" },
    cut: { label: "CONDITION READ", focus: "我会优先提示需要注意的趋势。", action: "查看信号" },
    progress: { label: "GUIDANCE TRACE", focus: "趋势不是结论，解释才是。", action: "打开分析" },
    cardio: { label: "MOTION READ", focus: "把完成的有氧变成下一次的参考。", action: "记录数据" },
    data: { label: "SCAN INPUT", focus: "再增加一条记录，图景会更完整。", action: "添加输入" },
  },
  aigis: {
    nutrition: { label: "FUEL MODULE", focus: "输入稳定，执行参数才可靠。", action: "登记补给" },
    cut: { label: "DEFICIT MODULE", focus: "偏差已识别，请按规则调整。", action: "打开控制台" },
    progress: { label: "OUTPUT LOG", focus: "完成率与负荷趋势已准备复核。", action: "检查输出" },
    cardio: { label: "MOTION MODULE", focus: "时长、强度、恢复，全部计入系统。", action: "登记有氧" },
    data: { label: "BODY INPUT", focus: "请更新身体数据以完成状态校准。", action: "录入晨重" },
  },
  joel: {
    nutrition: { label: "RATIONS", focus: "补给先到位，后面才走得动。", action: "清点补给" },
    cut: { label: "CONDITION", focus: "别把身体耗空，留出明天的余地。", action: "检查状态" },
    progress: { label: "ROUTE LOG", focus: "看清已经走了多远，再选下一段路。", action: "查看路线" },
    cardio: { label: "DISTANCE", focus: "路线不必漂亮，完成就行。", action: "记录行程" },
    data: { label: "VITALS", focus: "先确认身体状态。", action: "记录体征" },
  },
  ellie: {
    nutrition: { label: "SUPPLY NOTE", focus: "把今天吃下的东西记下来，别让它消失。", action: "写入日记" },
    cut: { label: "JOURNEY NOTE", focus: "这不是单日成绩，是一段路的痕迹。", action: "查看旅程" },
    progress: { label: "MEMORY TRACE", focus: "每一次记录，都在证明你没有停。", action: "翻看痕迹" },
    cardio: { label: "PATH NOTE", focus: "走过的路线也值得被记住。", action: "记录路线" },
    data: { label: "MORNING NOTE", focus: "留下一条今天的坐标。", action: "写下体重" },
  },
  abby: {
    nutrition: { label: "RECOVERY FUEL", focus: "补给够不够，决定下一次能不能扛住。", action: "核对蛋白" },
    cut: { label: "LOAD BALANCE", focus: "赤字不能吞掉恢复和训练质量。", action: "检查恢复" },
    progress: { label: "STRENGTH TRACE", focus: "看负荷、看表现、看身体有没有适应。", action: "复核力量" },
    cardio: { label: "WORK CAPACITY", focus: "有氧是能力的一部分，不是惩罚。", action: "记录完成" },
    data: { label: "LOAD BASELINE", focus: "身体数据是调整负荷的基础。", action: "更新体重" },
  },
};

export default function CharacterRouteGuide() {
  const pathname = usePathname();
  const { mode, activeCharacter, loaded } = useUIMode();
  const route = ROUTES.find((item) => item.match(pathname));

  if (!loaded || mode === "lite" || !activeCharacter || !route) return null;
  const guide = CHARACTER_GUIDES[activeCharacter.id][route.key];

  return (
    <section className={`character-route-guide character-route-guide--${activeCharacter.id}`} aria-label={`${activeCharacter.name} 页面指引`}>
      <CharacterPortrait character={activeCharacter.id} size="mini" />
      <div className="min-w-0">
        <p>{guide.label} // {activeCharacter.codename ?? activeCharacter.name}</p>
        <strong>{guide.focus}</strong>
      </div>
      <span>{guide.action}</span>
    </section>
  );
}
