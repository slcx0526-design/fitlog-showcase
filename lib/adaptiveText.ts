import type { Locale } from "./i18n";

type Pair = { en: string; ja: string };

const EXACT: Record<string, Pair> = {
  "今日主观恢复偏低": { en: "Subjective recovery is low today", ja: "今日の主観的回復が低めです" },
  "近 7 天恢复持续偏低": { en: "Recovery has stayed low for 7 days", ja: "直近7日間の回復が低い状態です" },
  "训练压力与表现回退同时出现": { en: "Training pressure and performance regression appeared together", ja: "トレーニング負荷とパフォーマンス低下が同時に見られます" },
  "Apple Health 指标出现谨慎信号": { en: "Apple Health shows a caution signal", ja: "Apple Health に注意シグナルがあります" },
  "Apple Health 指标出现低恢复信号": { en: "Apple Health shows a low-recovery signal", ja: "Apple Health に回復低下シグナルがあります" },
  "近期供能多次低于减脂目标": { en: "Recent fueling was repeatedly below the cut target", ja: "直近の栄養摂取が減量目標を繰り返し下回っています" },
  "高强度有氧与力量训练压力叠加": { en: "High-intensity cardio is compounding strength-training pressure", ja: "高強度有酸素と筋力トレーニングの負荷が重なっています" },
  "减脂速度超过当前保护范围": { en: "The current rate of loss exceeds the protective range", ja: "現在の減量速度が保護範囲を超えています" },
  "当前短期证据支持按有效计划训练": { en: "Current short-term evidence supports the active plan", ja: "現在の短期データは有効なプランの継続を支持しています" },
  "有效恢复与训练样本不足，暂不自动改变处方": { en: "Not enough recovery and training evidence to change the prescription", ja: "回復とトレーニングのデータが不足しているため、処方は変更しません" },
  "跨周期模型只允许在下一周期审核中逐步加量，不会临时放大当次处方": { en: "Cross-cycle evidence can increase volume only during the next cycle review", ja: "周期間データによる増量は次周期レビュー時のみ行います" },
  "高难度训练占比下降": { en: "The share of hard sessions decreased", ja: "高難度セッションの割合が低下しました" },
  "高难度训练占比上升": { en: "The share of hard sessions increased", ja: "高難度セッションの割合が上昇しました" },
  "进阶目标兑现率提高": { en: "Progression acceptance improved", ja: "進行目標の達成率が改善しました" },
  "进阶目标兑现率下降": { en: "Progression acceptance declined", ja: "進行目標の達成率が低下しました" },
  "恢复评分改善": { en: "Recovery scores improved", ja: "回復スコアが改善しました" },
  "恢复评分下降": { en: "Recovery scores declined", ja: "回復スコアが低下しました" },
  "主要结果指标保持稳定": { en: "Primary outcome metrics stayed stable", ja: "主要な結果指標は安定しています" },
  "跨周期结果显示，当前对更高训练剂量的耐受偏低。": { en: "Cross-cycle outcomes indicate low tolerance for a higher training dose.", ja: "周期間の結果では、より高いトレーニング量への耐性が低めです。" },
  "跨周期结果显示，增加训练剂量后表现和恢复仍能改善。": { en: "Performance and recovery still improved after training dose increased.", ja: "トレーニング量を増やした後もパフォーマンスと回復が改善しています。" },
  "跨周期结果支持维持当前训练剂量，再用更多周期确认。": { en: "Cross-cycle outcomes support holding the current dose while gathering more cycles.", ja: "現在のトレーニング量を維持し、さらに周期を重ねて確認します。" },
  "至少需要两个可比较的完整构建周期才能建立个人反应模型。": { en: "Complete two comparable build cycles to establish a personal response model.", ja: "個人反応モデルの構築には、比較可能な構築周期が2つ必要です。" },
  "没有发现必须修改的模板。": { en: "No template changes are required.", ja: "変更が必要なテンプレートはありません。" },
  "当前模板已经满足已识别的动作、器械、肌群容量和单次时长约束。频率与分化结构仍需在计划页手动确认。": { en: "Current templates meet the selected exercise, equipment, volume, and duration constraints. Review frequency and split changes separately.", ja: "現在のテンプレートは種目・器具・ボリューム・時間の制約を満たしています。頻度と分割は別途確認してください。" },
  "没有可用于重排的非空训练模板": { en: "No non-empty training templates are available for scheduling", ja: "日程を組み直せる空でないテンプレートがありません" },
  "当前设置为连续 7 个训练日；请确认恢复能力与实际时间允许": { en: "Seven consecutive training days are selected; confirm recovery and time allow it", ja: "7日連続のトレーニング設定です。回復と時間を確認してください" },
  "近期多数训练被标记为偏难": { en: "Most recent sessions were marked hard", ja: "直近の多くのセッションが難しいと記録されています" },
};

const PATTERNS: Array<{
  pattern: RegExp;
  en: (...groups: string[]) => string;
  ja: (...groups: string[]) => string;
}> = [
  {
    pattern: /^减脂模式按 (\d+)% 容量保护主项$/,
    en: (percent) => `Cut mode protects main lifts at ${percent}% volume`,
    ja: (percent) => `減量モードではメイン種目のボリュームを ${percent}% に保ちます`,
  },
  {
    pattern: /^恢复样本：近 7 天 (\d+) 天(?:，平均 ([\d.]+))?$/,
    en: (days, average) => `Recovery samples: ${days} days in the last 7${average ? `, ${average} average` : ""}`,
    ja: (days, average) => `回復データ：直近7日で${days}日${average ? `、平均 ${average}` : ""}`,
  },
  {
    pattern: /^健康信号：(\d+) 项有效，(\d+) 项不利$/,
    en: (qualified, adverse) => `Health signals: ${qualified} qualified, ${adverse} adverse`,
    ja: (qualified, adverse) => `健康シグナル：有効 ${qualified}、注意 ${adverse}`,
  },
  {
    pattern: /^有氧压力：近 7 天 (\d+) 分钟，高强度近 3 天 (\d+) 分钟$/,
    en: (week, recentHigh) => `Cardio load: ${week} minutes in 7 days, ${recentHigh} high-intensity minutes in 3 days`,
    ja: (week, recentHigh) => `有酸素負荷：7日で${week}分、直近3日の高強度は${recentHigh}分`,
  },
  {
    pattern: /^跨周期模型：(\d+) 个周期，(\d+) 次比较，置信度 (low|building|ready)$/,
    en: (cycles, comparisons, confidence) => `Cross-cycle model: ${cycles} cycles, ${comparisons} comparisons, ${confidence} confidence`,
    ja: (cycles, comparisons, confidence) => `周期間モデル：${cycles}周期、${comparisons}比較、信頼度 ${confidence === "ready" ? "確立" : confidence === "building" ? "構築中" : "低"}`,
  },
  {
    pattern: /^减脂状态：(setup|collect|hold|slowDown|speedUp|guardrail)$/,
    en: (state) => `Cut state: ${{ setup: "setup", collect: "collecting", hold: "hold", slowDown: "slow down", speedUp: "speed up", guardrail: "recovery guardrail" }[state] ?? state}`,
    ja: (state) => `減量状態：${{ setup: "初期設定", collect: "収集中", hold: "維持", slowDown: "減速", speedUp: "加速", guardrail: "回復保護" }[state] ?? state}`,
  },
  {
    pattern: /^目标：(减脂保肌|力量|增肌\/体型塑造)$/,
    en: (goal) => `Goal: ${goal === "力量" ? "strength" : goal === "减脂保肌" ? "cut retention" : "hypertrophy"}`,
    ja: (goal) => `目標：${goal === "力量" ? "筋力" : goal === "减脂保肌" ? "減量・筋量維持" : "筋肥大"}`,
  },
  {
    pattern: /^计划调整：(安全自动|仅建议)$/,
    en: (mode) => `Plan adaptation: ${mode === "安全自动" ? "safe auto" : "suggest only"}`,
    ja: (mode) => `プラン調整：${mode === "安全自动" ? "安全な自動適用" : "提案のみ"}`,
  },
  {
    pattern: /^单次训练上限：(\d+) 分钟$/,
    en: (minutes) => `Session cap: ${minutes} minutes`,
    ja: (minutes) => `1回の上限：${minutes}分`,
  },
  {
    pattern: /^每 7 天训练目标：(\d+) 次$/,
    en: (days) => `Target: ${days} training sessions per 7 days`,
    ja: (days) => `目標：7日あたり${days}回トレーニング`,
  },
  {
    pattern: /^每周训练目标：(\d+) 天$/,
    en: (days) => `Weekly target: ${days} training days`,
    ja: (days) => `週間目標：トレーニング${days}日`,
  },
  {
    pattern: /^(.+)：(专项强化|增长|维持|降低优先级)$/,
    en: (muscle, priority) => `${muscle}: ${priority === "专项强化" ? "specialize" : priority === "增长" ? "grow" : priority === "维持" ? "maintain" : "deprioritize"}`,
    ja: (muscle, priority) => `${muscle}：${priority === "专项强化" ? "特化" : priority === "增长" ? "増量" : priority === "维持" ? "維持" : "優先度を下げる"}`,
  },
  {
    pattern: /^(.+)：(专项|增长|维持|降低)，按 (\d+) 天微周期(增加|减少) 1 组$/,
    en: (muscle, priority, days, direction) => `${muscle}: ${priority === "专项" ? "specialize" : priority === "增长" ? "grow" : priority === "维持" ? "maintain" : "deprioritize"}; ${direction === "增加" ? "+1" : "-1"} set for the ${days}-day microcycle`,
    ja: (muscle, priority, days, direction) => `${muscle}：${priority === "专项" ? "特化" : priority === "增长" ? "増量" : priority === "维持" ? "維持" : "優先度低下"}。${days}日マイクロサイクルで${direction === "增加" ? "+1" : "-1"}セット`,
  },
  {
    pattern: /^(.+)目标按 (\d+) 天微周期折算为 ([\d.]+) 组；受单次恢复和总时长边界限制，不把剩余缺口集中堆到一天。$/,
    en: (muscle, days, sets) => `${muscle} scales to ${sets} sets for a ${days}-day microcycle. Recovery and duration caps keep the remaining gap from being packed into one session.`,
    ja: (muscle, days, sets) => `${muscle}の目標は${days}日マイクロサイクルで${sets}セットです。回復と時間の上限により、不足分を1日に集中させません。`,
  },
  {
    pattern: /^处方按 (\d+) 天微周期折算，优先肌群不会把周期缺口集中堆到单次训练$/,
    en: (days) => `Prescription targets are scaled to the ${days}-day microcycle; priority volume is not packed into one session`,
    ja: (days) => `処方目標は${days}日マイクロサイクルに換算し、優先部位の不足分を1回に集中させません`,
  },
  {
    pattern: /^(排除动作|偏好动作|尽量避免)：(.+)$/,
    en: (mode, exercise) => `${mode === "排除动作" ? "Exclude" : mode === "偏好动作" ? "Prefer" : "Avoid"}: ${exercise}`,
    ja: (mode, exercise) => `${mode === "排除动作" ? "除外" : mode === "偏好动作" ? "優先" : "回避"}：${exercise}`,
  },
  {
    pattern: /^不可用器械：(free|machine|cable|bodyweight)$/,
    en: (equipment) => `Unavailable equipment: ${equipment}`,
    ja: (equipment) => `使用不可の器具：${equipment}`,
  },
  {
    pattern: /^已分析 (\d+) 个构建周期和 (\d+) 次相邻周期比较$/,
    en: (cycles, comparisons) => `Analyzed ${cycles} build cycles and ${comparisons} adjacent-cycle comparisons`,
    ja: (cycles, comparisons) => `構築周期 ${cycles} 件、隣接周期比較 ${comparisons} 件を分析`,
  },
  {
    pattern: /^建议调整 (\d+) 个模板：(\d+) 个动作替换，(\d+) 个动作移除，工作组净变化 ([+-]?\d+)。$/,
    en: (templates, replaced, removed, sets) => `${templates} templates: ${replaced} replacements, ${removed} removals, ${sets} net working sets.`,
    ja: (templates, replaced, removed, sets) => `${templates}テンプレート：種目置換 ${replaced}、削除 ${removed}、ワーキングセット差 ${sets}。`,
  },
  {
    pattern: /^(.+) 因(.+)替换为 (.+)$/,
    en: (from, reason, to) => `${from} → ${to} because ${translateConstraint(reason, "en")}`,
    ja: (from, reason, to) => `${translateConstraint(reason, "ja")}のため ${from} → ${to}`,
  },
  {
    pattern: /^动作数超过 (\d+)，移除低优先级动作 (.+)$/,
    en: (cap, exercise) => `Removed lower-priority ${exercise} to stay within ${cap} exercises`,
    ja: (cap, exercise) => `${cap}種目以内にするため、優先度の低い${exercise}を削除`,
  },
  {
    pattern: /^控制在 (\d+) 分钟 \/ (\d+) 组以内$/,
    en: (minutes, sets) => `Keep the session within ${minutes} minutes and ${sets} sets`,
    ja: (minutes, sets) => `${minutes}分・${sets}セット以内に調整`,
  },
  {
    pattern: /^单次上限仍超出，移除低优先级动作 (.+)，控制在 (\d+) 分钟 \/ (\d+) 组以内$/,
    en: (exercise, minutes, sets) => `Removed lower-priority ${exercise} to keep the session within ${minutes} minutes and ${sets} sets`,
    ja: (exercise, minutes, sets) => `${minutes}分・${sets}セット以内にするため、優先度の低い${exercise}を削除`,
  },
  {
    pattern: /^(.+)：(\d+) 天微周期 (\d+) 次刺激，单次上限按 ([\d.]+) 组分配$/,
    en: (muscles, days, exposures, cap) => `${muscles}: distribute ${exposures} exposures across the ${days}-day cycle with a ${cap}-set session cap`,
    ja: (muscles, days, exposures, cap) => `${muscles}：${days}日周期の${exposures}回に分散し、1回${cap}セットを上限にします`,
  },
  {
    pattern: /^(.+)：单次直接组上限 ([\d.]+)，(.+) -([\d.]+) 组$/,
    en: (muscles, cap, exercise, sets) => `${muscles}: ${exercise} -${sets} sets to stay within the ${cap}-set direct-work cap`,
    ja: (muscles, cap, exercise, sets) => `${muscles}：直接セット上限${cap}に収めるため、${exercise}を-${sets}セット`,
  },
  {
    pattern: /^(.+)：单次直接组上限 ([\d.]+)，移除低优先级动作 (.+)$/,
    en: (muscles, cap, exercise) => `${muscles}: removed lower-priority ${exercise} to stay within the ${cap}-set direct-work cap`,
    ja: (muscles, cap, exercise) => `${muscles}：直接セット上限${cap}に収めるため、優先度の低い${exercise}を削除`,
  },
  {
    pattern: /^(.+) 的(.+)直接组仍为 ([\d.]+)，高于单次恢复上限 ([\d.]+)；请人工确认动作结构。$/,
    en: (template, muscles, sets, cap) => `${template} still has ${sets} direct ${muscles} sets, above the ${cap}-set recovery cap; review the exercise structure.`,
    ja: (template, muscles, sets, cap) => `${template}の${muscles}直接セットは${sets}で、回復上限${cap}を超えています。種目構成を確認してください。`,
  },
  {
    pattern: /^每 7 天目标 ([\d.]+) 次，折算到 (\d+) 天微周期为 (\d+) 个训练日$/,
    en: (weekly, cycleDays, trainingDays) => `${weekly} sessions per 7 days scales to ${trainingDays} training days in this ${cycleDays}-day microcycle`,
    ja: (weekly, cycleDays, trainingDays) => `7日あたり${weekly}回を、${cycleDays}日マイクロサイクルの${trainingDays}トレーニング日に換算`,
  },
  {
    pattern: /^恢复与训练证据将每 7 天目标 ([\d.]+) → ([\d.]+)，折算到 (\d+) 天微周期为 (\d+) 个训练日$/,
    en: (before, after, cycleDays, trainingDays) => `Recovery evidence adjusts the target from ${before} to ${after} sessions per 7 days, or ${trainingDays} days in this ${cycleDays}-day microcycle`,
    ja: (before, after, cycleDays, trainingDays) => `回復データにより7日あたり${before}回から${after}回へ調整し、${cycleDays}日周期では${trainingDays}日に換算`,
  },
  {
    pattern: /^(\d+) 天微周期训练日 (\d+) → (\d+)（约每 7 天 ([\d.]+) → ([\d.]+) 次）$/,
    en: (cycleDays, before, after, weeklyBefore, weeklyAfter) => `${cycleDays}-day microcycle: ${before} → ${after} training days, about ${weeklyBefore} → ${weeklyAfter} sessions per 7 days`,
    ja: (cycleDays, before, after, weeklyBefore, weeklyAfter) => `${cycleDays}日マイクロサイクル：トレーニング日${before}→${after}、7日換算${weeklyBefore}→${weeklyAfter}回`,
  },
  {
    pattern: /^(\d+) 天微周期没有休息日；请确认恢复能力与实际时间允许$/,
    en: (cycleDays) => `This ${cycleDays}-day microcycle has no rest day; confirm recovery and time allow it`,
    ja: (cycleDays) => `この${cycleDays}日マイクロサイクルには休息日がありません。回復と時間を確認してください`,
  },
  {
    pattern: /^当前 (\d+) 天微周期含 (\d+) 个训练日（约每 7 天 ([\d.]+) 次），与设定的每 7 天 (\d+)–(\d+) 次不一致；分化只在日程提案中调整。$/,
    en: (cycleDays, trainingDays, equivalent, minimum, maximum) => `The ${cycleDays}-day microcycle has ${trainingDays} training days (${equivalent} per 7 days), outside the selected ${minimum}-${maximum}; only the schedule proposal can change the split.`,
    ja: (cycleDays, trainingDays, equivalent, minimum, maximum) => `${cycleDays}日周期は${trainingDays}トレーニング日（7日換算${equivalent}回）で、設定${minimum}-${maximum}回の範囲外です。分割の変更は日程提案でのみ行います。`,
  },
  {
    pattern: /^每周训练天数 (\d+) → (\d+)$/,
    en: (before, after) => `Weekly training days ${before} → ${after}`,
    ja: (before, after) => `週間トレーニング日数 ${before} → ${after}`,
  },
  {
    pattern: /^恢复与训练证据建议本周期训练天数 (\d+) → (\d+)$/,
    en: (before, after) => `Recovery and training evidence suggests ${before} → ${after} days this cycle`,
    ja: (before, after) => `回復とトレーニングのデータにより今周期は ${before} → ${after} 日を提案`,
  },
  {
    pattern: /^(push|pull|legs) 频率 (\d+) → (\d+)$/,
    en: (type, before, after) => `${type} frequency ${before} → ${after}`,
    ja: (type, before, after) => `${type} 頻度 ${before} → ${after}`,
  },
  {
    pattern: /^最近 (\d+) 次训练中有 (\d+) 次偏难$/,
    en: (sessions, hard) => `${hard} of the last ${sessions} sessions were hard`,
    ja: (sessions, hard) => `直近${sessions}回中${hard}回が難しい記録でした`,
  },
  {
    pattern: /^训练样本：近 7 天 (\d+) 次，近 28 天 (\d+) 次$/,
    en: (week, month) => `Training samples: ${week} in 7 days, ${month} in 28 days`,
    ja: (week, month) => `トレーニングデータ：7日 ${week}回、28日 ${month}回`,
  },
  {
    pattern: /^近期计划完成率：(样本不足|\d+%)$/,
    en: (value) => `Recent plan completion: ${value === "样本不足" ? "insufficient data" : value}`,
    ja: (value) => `直近のプラン完了率：${value === "样本不足" ? "データ不足" : value}`,
  },
];

function translateConstraint(source: string, locale: Exclude<Locale, "zh">) {
  const parts: Record<string, Pair> = {
    "动作已排除": { en: "the exercise is excluded", ja: "種目が除外されています" },
    "器械不可用": { en: "the equipment is unavailable", ja: "器具が使用できません" },
    "动作模式受限": { en: "the movement pattern is restricted", ja: "動作パターンが制限されています" },
  };
  return Object.entries(parts).reduce((text, [key, value]) => text.replaceAll(key, value[locale]), source);
}

export function adaptiveText(locale: Locale, source: string) {
  if (locale === "zh") return source;
  const exact = EXACT[source];
  if (exact) return exact[locale];
  for (const entry of PATTERNS) {
    const match = source.match(entry.pattern);
    if (match) return entry[locale](...match.slice(1));
  }
  return source;
}
