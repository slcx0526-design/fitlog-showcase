"use client";

import { usePathname } from "next/navigation";
import { useUIMode, type UIMode } from "@/lib/uiMode";
import { useI18n } from "@/lib/i18n";
import AppMotionLayer from "@/components/AppMotionLayer";

const MODES: Array<{ id: UIMode; name: string; tag: string; detail: string }> = [
  { id: "lite", name: "Lite", tag: "日常记录", detail: "默认界面：稳定、轻量、专注记录。" },
  { id: "pulse", name: "Pulse", tag: "行动主题", detail: "高对比、目标推进、快速反馈。" },
  { id: "midnight", name: "Midnight", tag: "月夜主题", detail: "月光、时间感、长期状态与恢复。" },
  { id: "survival", name: "Survival", tag: "野外主题", detail: "路线、补给、体征和行动日志。" },
];

export default function MidnightModeControl() {
  const pathname = usePathname();
  const { mode, setMode, loaded } = useUIMode();
  const { tr } = useI18n();
  const showSettings = loaded && pathname.startsWith("/settings");

  return <>
    <AppMotionLayer />
    {showSettings && <section className="mode-switchboard mb-4" aria-label={tr("界面主题")}>
      <div className="mode-switchboard__header"><div><p className="mode-switchboard__eyebrow">{tr("主题设定")}</p><h2>{tr("界面主题")}</h2><p>{tr("主题只改变视觉、动效和信息强调，不会改动训练、饮食、减脂或身体数据。")}</p></div><span className="mode-switchboard__active">{tr(MODES.find((item) => item.id === mode)?.tag ?? "日常记录")}</span></div>
      <div className="mode-switchboard__modes">{MODES.map((item) => <button key={item.id} type="button" onClick={() => setMode(item.id)} className={`press mode-switchboard__mode ${mode === item.id ? "is-active" : ""}`} aria-pressed={mode === item.id}><span className="mode-switchboard__mode-tag">{tr(item.tag)}</span><span className="mode-switchboard__mode-name">{item.name}</span><span className="mode-switchboard__mode-detail">{tr(item.detail)}</span><span className={`mode-switchboard__preview mode-switchboard__preview--${item.id}`} aria-hidden="true"><i /><i /><i /></span></button>)}</div>
    </section>}
  </>;
}
