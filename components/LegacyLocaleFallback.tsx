"use client";

import { useEffect, useMemo, useRef } from "react";
import { DICT_EN, DICT_JA } from "@/lib/dict";
import { DICT_EN_SUPPLEMENT, DICT_JA_SUPPLEMENT } from "@/lib/dictSupplement";
import { useI18n } from "@/lib/i18n";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "OPTION"]);
type Dict = Record<string, string>;

const EXTRA_EN: Dict = {
  "覆盖同日记录，不会产生重复条目。": "Updates the same-day record without creating duplicates.", "保存测量": "Save measurements", "最近体重": "Recent weight", "最近腰围": "Recent waist", "直接组": "Direct sets", "有效组": "Effective sets", "训练日": "Training days", "当前微周期": "Current microcycle", "近7天": "Last 7 days", "近28天": "Last 28 days", "肌群容量处方": "Muscle volume prescription", "默认看当前训练微周期；有效组按动作库贡献计算。": "Defaults to the current microcycle; effective sets follow movement-library contributions.", "新周期": "New cycle", "本周期": "This cycle", "不足": "Below target", "偏高": "Above target", "合适": "On target", "当前范围暂无训练容量。": "No training volume in this range.", "近期训练": "Recent training", "训练计划只有主动开始后才会创建实际记录": "A real workout record is created only after you actively start training.", "尚无训练记录。先从训练页开始一场会话。": "No workout records yet. Start a session from Training.", "档案摘要": "Archive summary", "按真实日历窗口统计训练、饮食和有氧记录。": "Training, nutrition, and cardio are counted in actual calendar windows.", "动作档案": "Exercise archive", "搜索动作，查看最近记录和对应训练日。": "Search exercises to see recent records and workout days.", "搜索动作": "Search exercises", "记录次数": "Sessions", "总组数": "Total sets", "最佳组": "Best set", "下次做": "Do next: ", "没有匹配的动作。": "No matching exercises.", "近期动作表现": "Recent exercise performance", "展示最近出现的动作和上次同动作记录": "Shows recent exercises and their previous records.", "首次记录": "First record", "打开训练日": "Open workout day", "补记或修改某一天": "Backfill or edit a day", "选择日期": "Select date", "周工作组 ": "Weekly working sets ", "有效容量 ": "Effective volume ", "还有 ": "Still ", "组容量未覆盖": " volume sets uncovered", "目标 ": "Target ", "% / 周": "% / wk", "当前安排": "Planned", "已完成": "Completed", "待覆盖": "To cover", "间接": "Indirect", "组": "sets",
};
const EXTRA_JA: Dict = {
  "覆盖同日记录，不会产生重复条目。": "同日の記録を更新し、重複は作成しません。", "保存测量": "測定を保存", "最近体重": "最近の体重", "最近腰围": "最近のウエスト", "直接组": "直接セット", "有效组": "有効セット", "训练日": "トレーニング日", "当前微周期": "現在のマイクロサイクル", "近7天": "直近7日", "近28天": "直近28日", "肌群容量处方": "筋群ボリューム処方", "默认看当前训练微周期；有效组按动作库贡献计算。": "標準では現在のマイクロサイクルを表示し、有効セットは種目ライブラリの寄与で計算します。", "新周期": "新しいサイクル", "本周期": "このサイクル", "不足": "不足", "偏高": "高すぎ", "合适": "適正", "当前范围暂无训练容量。": "この範囲にはトレーニングボリュームがありません。", "近期训练": "最近のトレーニング", "训练计划只有主动开始后才会创建实际记录": "実際のトレーニング記録は、開始後にのみ作成されます。", "尚无训练记录。先从训练页开始一场会话。": "トレーニング記録はありません。トレーニング画面からセッションを開始してください。", "档案摘要": "アーカイブ概要", "按真实日历窗口统计训练、饮食和有氧记录。": "実際の暦期間でトレーニング・食事・有酸素の記録を集計します。", "动作档案": "種目アーカイブ", "搜索动作，查看最近记录和对应训练日。": "種目を検索して最近の記録とトレーニング日を確認します。", "搜索动作": "種目を検索", "记录次数": "記録回数", "总组数": "総セット数", "最佳组": "ベストセット", "下次做": "次回：", "没有匹配的动作。": "一致する種目はありません。", "近期动作表现": "最近の種目パフォーマンス", "展示最近出现的动作和上次同动作记录": "最近行った種目と前回の同種目記録を表示します。", "首次记录": "初回記録", "打开训练日": "トレーニング日を開く", "补记或修改某一天": "ある日の追加入力・修正", "选择日期": "日付を選択", "周工作组 ": "週間ワーキングセット ", "有效容量 ": "有効ボリューム ", "还有 ": "あと ", "组容量未覆盖": " セット分のボリュームが未充足", "目标 ": "目標 ", "% / 周": "% / 週", "当前安排": "現在の予定", "已完成": "完了", "待覆盖": "未充足", "间接": "間接", "组": "セット",
};

function translateText(source: string, dict: Dict, keys: string[]) {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  const core = source.slice(leading.length, source.length - trailing.length);
  if (!core || !/[\u4e00-\u9fff]/.test(core)) return source;
  if (dict[core]) return `${leading}${dict[core]}${trailing}`;
  let output = core;
  for (const key of keys) if (output.includes(key)) output = output.split(key).join(dict[key]);
  return `${leading}${output}${trailing}`;
}

/** Legacy safety net. New components must use tr(); this only replaces registered UI copy. */
export default function LegacyLocaleFallback() {
  const { locale } = useI18n();
  const sourceByNode = useRef(new WeakMap<Text, string>());
  const dict = useMemo<Dict | null>(() => locale === "ja" ? { ...DICT_JA, ...DICT_JA_SUPPLEMENT, ...EXTRA_JA } : locale === "en" ? { ...DICT_EN, ...DICT_EN_SUPPLEMENT, ...EXTRA_EN } : null, [locale]);
  const keys = useMemo(() => dict ? Object.keys(dict).filter((key) => /[\u4e00-\u9fff]/.test(key)).sort((a, b) => b.length - a.length) : [], [dict]);

  useEffect(() => {
    const source = sourceByNode.current;
    function apply(node: Text, forceStoredSource = false) {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName) || parent.closest("[data-no-auto-translate]")) return;
      const stored = source.get(node);
      const original = forceStoredSource && stored != null ? stored : stored ?? node.data;
      if (stored == null) source.set(node, original);
      const next = dict ? translateText(original, dict, keys) : original;
      if (node.data !== next) node.data = next;
    }
    function scan(root: ParentNode = document.body, forceStoredSource = false) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) { apply(node as Text, forceStoredSource); node = walker.nextNode(); }
    }
    scan(document.body, true);
    let queued = false;
    const observer = new MutationObserver((records) => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        for (const record of records) {
          if (record.type === "characterData") {
            const node = record.target as Text;
            const stored = source.get(node);
            const expected = stored == null ? null : (dict ? translateText(stored, dict, keys) : stored);
            if (expected !== node.data) source.set(node, node.data);
            apply(node);
          }
          for (const added of Array.from(record.addedNodes)) {
            if (added.nodeType === Node.TEXT_NODE) apply(added as Text);
            else if (added.nodeType === Node.ELEMENT_NODE) scan(added as Element);
          }
        }
      });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [dict, keys]);
  return null;
}