"use client";

import { useEffect, useRef } from "react";
import { pulseFeedback, unlockPulseAudio, type PulseFeedbackKind } from "@/lib/feedback";

function inFeedbackMode() {
  const mode = document.documentElement.dataset.mode;
  return mode === "lite" || mode === "pulse" || mode === "midnight" || mode === "survival";
}

function feedbackKind(target: HTMLElement): PulseFeedbackKind | null {
  const control = target.closest<HTMLElement>("button, a, [role='button']");
  if (!control || control.matches("[disabled], [aria-disabled='true']") || control.closest("[data-no-pulse]")) return null;

  const explicit = control.dataset.pulseFeedback as PulseFeedbackKind | undefined;
  if (explicit === "nav" || explicit === "tap" || explicit === "confirm" || explicit === "start" || explicit === "finish") return explicit;
  if (control.closest(".app-nav")) return "nav";

  const label = `${control.getAttribute("aria-label") ?? ""} ${control.textContent ?? ""}`.trim();
  if (/结束训练|finish training|保存|确认|完成|导出|导入/i.test(label)) return "finish";
  if (/开始|套用|应用|继续|记录|add set|沿用/i.test(label)) return "start";
  return "tap";
}

/**
 * Audio must start from pointerdown, not only click. iOS home-screen PWAs can
 * otherwise silently reject the first Web Audio sound after installation.
 */
export default function PulseInteractionLayer() {
  const lastPointerFeedbackAt = useRef(0);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!inFeedbackMode()) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const kind = feedbackKind(target);
      if (!kind) return;
      unlockPulseAudio();
      pulseFeedback(kind);
      lastPointerFeedbackAt.current = performance.now();
    };

    const onClick = (event: MouseEvent) => {
      if (!inFeedbackMode()) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      // Pointer interactions were already handled in the direct gesture. Keep
      // click feedback for keyboard activation and non-pointer environments.
      const now = performance.now();
      if (event.detail !== 0 && now - lastPointerFeedbackAt.current < 520) return;
      const kind = feedbackKind(target);
      if (kind) {
        unlockPulseAudio();
        pulseFeedback(kind);
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
