"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { ZONES, maxHR, methodNote, zoneBpm } from "@/lib/hr";
import type { Zone } from "@/lib/types";

/** 强度强弱用 accent 的不透明度阶梯表示（不引入彩虹色，保持工业单色感） */
const INTENSITY: Record<Zone, number> = { 1: 0.28, 2: 0.45, 3: 0.62, 4: 0.8, 5: 1 };

export default function ZoneReferenceCard({
  selected,
  onPick,
}: {
  selected?: Zone | null;
  onPick?: (z: Zone) => void;
}) {
  const { data } = useStore();
  const { tr } = useI18n();
  const profile = data.profile;
  const hasMax = !!maxHR(profile);
  const interactive = !!onPick;

  return (
    <div className="control-card p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-fg">
          {tr("心率区间")} {interactive ? tr("· 选强度") : null}
        </h3>
        {!hasMax && (
          <Link href="/settings" className="press text-[12px] font-medium text-accent">
            {tr("填身体数据 →")}
          </Link>
        )}
      </div>

      <div className="space-y-1">
        {ZONES.map((z) => {
          const bpm = zoneBpm(z.zone, profile);
          const active = selected === z.zone;
          const Row = interactive ? "button" : "div";
          return (
            <Row
              key={z.zone}
              {...(interactive
                ? { onClick: () => onPick?.(z.zone), type: "button" as const }
                : {})}
              className={
                "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left " +
                (interactive ? "press " : "") +
                (active ? "bg-accent-soft ring-1 ring-accent" : "")
              }
            >
              {/* 强度色块 + 区号 */}
              <span
                className="tnum grid h-7 w-9 shrink-0 place-items-center rounded text-[12px] font-bold"
                style={{
                  backgroundColor: "var(--accent)",
                  opacity: INTENSITY[z.zone],
                  color: "var(--accent-fg)",
                }}
              >
                Z{z.zone}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[13px] font-medium text-fg">{tr(z.zh)}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-faint">
                    {z.en}
                  </span>
                </div>
                <div className="truncate text-[11px] text-muted">{tr(z.talk)}</div>
              </div>

              {/* bpm 区间（有最大心率才显示） */}
              {bpm ? (
                <span className="tnum shrink-0 text-[12px] font-semibold text-fg">
                  {bpm.low}–{bpm.high}
                  <span className="ml-0.5 text-[10px] font-normal text-faint">bpm</span>
                </span>
              ) : (
                <span className="shrink-0 text-[10px] text-faint">
                  {z.zone === 2 ? tr("凭感觉") : ""}
                </span>
              )}
            </Row>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-faint">
        {methodNote(profile, tr)} · {tr("区间为参考，非医疗建议")}
      </p>
    </div>
  );
}
