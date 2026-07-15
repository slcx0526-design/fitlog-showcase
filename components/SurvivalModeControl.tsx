"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useUIMode } from "@/lib/uiMode";
import {
  pulseHapticsEnabled,
  pulseSoundEnabled,
  setPulseHapticsEnabled,
  setPulseSoundEnabled,
} from "@/lib/feedback";

/** Settings entry for the original post-disaster field journal interface. */
export default function SurvivalModeControl() {
  const pathname = usePathname();
  const { mode, setMode, loaded } = useUIMode();
  const [sound, setSound] = useState(true);
  const [haptics, setHaptics] = useState(true);

  useEffect(() => {
    setSound(pulseSoundEnabled());
    setHaptics(pulseHapticsEnabled());
  }, []);

  if (!loaded || !pathname.startsWith("/settings")) return null;
  const active = mode === "survival";

  return (
    <section className="survival-mode-control mb-4" aria-label="Survival Journal Mode">
      <div className="survival-mode-control__header">
        <div>
          <p className="survival-mode-control__eyebrow">FIELD JOURNAL</p>
          <h2>生存手账</h2>
          <p>旧纸张、地形笔记、每日补给状态与克制的野外记录反馈。</p>
        </div>
        <span className={active ? "survival-mode-control__state is-active" : "survival-mode-control__state"}>{active ? "IN FIELD" : "PACKED"}</span>
      </div>
      <div className="survival-mode-control__actions">
        <button
          type="button"
          onClick={() => setMode(active ? "lite" : "survival")}
          className="press survival-mode-control__switch"
          aria-pressed={active}
        >
          <span>{active ? "收起生存手账" : "启用生存手账"}</span>
          <span aria-hidden="true">{active ? "×" : "↗"}</span>
        </button>
        {active && (
          <div className="survival-mode-control__toggles">
            <Toggle label="环境音效" value={sound} onChange={(next) => { setSound(next); setPulseSoundEnabled(next); }} />
            <Toggle label="触感反馈" value={haptics} onChange={(next) => { setHaptics(next); setPulseHapticsEnabled(next); }} />
          </div>
        )}
      </div>
      <p className="survival-mode-control__note">只改变界面与交互语言，不使用任何现成游戏素材，也不影响你的真实数据。</p>
    </section>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="press survival-mode-control__toggle" aria-pressed={value}>
      <span>{label}</span>
      <span className={value ? "is-on" : ""}>{value ? "ON" : "OFF"}</span>
    </button>
  );
}
