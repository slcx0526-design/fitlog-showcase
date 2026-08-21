"use client";

import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useUIMode, type UIMode } from "@/lib/uiMode";

const MODES: Array<{ id: UIMode; name: string; tag: string }> = [
  { id: "lite", name: "Lite", tag: "清晰明快" },
  { id: "pulse", name: "Pulse", tag: "高对比" },
  { id: "midnight", name: "Midnight", tag: "深色专注" },
  { id: "survival", name: "Survival", tag: "低饱和" },
];

export default function ThemeModeSelector() {
  const { mode, setMode, loaded } = useUIMode();
  const { tr } = useI18n();

  if (!loaded) return null;

  const active = MODES.find((item) => item.id === mode) ?? MODES[0];

  return <section className="mode-switchboard mb-6" aria-labelledby="theme-mode-title" data-theme-selector>
    <div className="mode-switchboard__header">
      <div>
        <h2 id="theme-mode-title">{tr("界面主题")}</h2>
      </div>
      <span className="mode-switchboard__active" aria-live="polite">{active.name}</span>
    </div>
    <div className="mode-switchboard__modes">
      {MODES.map((item) => {
        const selected = mode === item.id;
        return <button
          key={item.id}
          type="button"
          onClick={() => setMode(item.id)}
          className={`press mode-switchboard__mode ${selected ? "is-active" : ""}`}
          aria-label={`${item.name} · ${tr(item.tag)}`}
          aria-pressed={selected}
          data-mode-id={item.id}
        >
          <span className={`mode-switchboard__preview mode-switchboard__preview--${item.id}`} aria-hidden="true"><i /><i /><i /></span>
          <span className="mode-switchboard__mode-copy">
            <span className="mode-switchboard__mode-name">{item.name}</span>
            <span className="mode-switchboard__mode-tag">{tr(item.tag)}</span>
          </span>
          <span className="mode-switchboard__check" aria-hidden="true"><Check size={13} strokeWidth={2.4} /></span>
        </button>;
      })}
    </div>
  </section>;
}
