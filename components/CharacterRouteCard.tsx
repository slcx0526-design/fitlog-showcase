"use client";

import { usePathname } from "next/navigation";
import { useUIMode } from "@/lib/uiMode";
import CharacterPortrait from "@/components/CharacterPortrait";

const ROUTES: Array<[string, string]> = [
  ["/nutrition", "FUEL FOCUS"],
  ["/cut", "CONDITION FOCUS"],
  ["/progress", "PROGRESS FOCUS"],
  ["/history", "MEMORY FOCUS"],
  ["/cardio", "MOTION FOCUS"],
  ["/data", "CHECK-IN FOCUS"],
];

export default function CharacterRouteCard() {
  const pathname = usePathname();
  const { mode, activeCharacter, loaded } = useUIMode();
  const route = ROUTES.find(([prefix]) => pathname.startsWith(prefix));
  if (!loaded || mode === "lite" || !activeCharacter || !route) return null;
  const isProgress = route[0] === "/progress" || route[0] === "/history" || route[0] === "/data";
  const focus = isProgress ? activeCharacter.homeFocus : activeCharacter.trainFocus;

  return (
    <section
      className="mb-3 grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-[14px_4px_14px_4px] border px-2 py-2"
      style={{ borderColor: activeCharacter.accent, background: `linear-gradient(125deg, ${activeCharacter.accentSoft}, var(--surface))`, boxShadow: `3px 3px 0 ${activeCharacter.accent}33` }}
      aria-label={`${activeCharacter.name} 当前页面焦点`}
    >
      <CharacterPortrait character={activeCharacter.id} size="mini" className="rounded-md" />
      <div className="min-w-0">
        <p className="font-mono text-[9px] font-black tracking-[.1em]" style={{ color: activeCharacter.accent }}>{route[1]} // {activeCharacter.codename ?? activeCharacter.name}</p>
        <p className="mt-1 truncate text-[11px] font-bold text-fg">{focus}</p>
      </div>
      <span className="max-w-[66px] border-l pl-2 text-[9px] font-semibold leading-tight text-muted" style={{ borderColor: `${activeCharacter.accent}66` }}>{activeCharacter.tone}</span>
    </section>
  );
}
