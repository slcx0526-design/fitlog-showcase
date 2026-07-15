/**
 * FitLog interaction feedback is silent by default. The three themed modes
 * use a compact tactile pulse where the browser exposes vibration support.
 * iOS web apps do not expose the native keyboard-haptic API, so this remains
 * best-effort and never blocks the underlying action.
 */
export type PulseFeedbackKind = "nav" | "tap" | "confirm" | "start" | "finish";

function currentMode() {
  if (typeof document === "undefined") return "lite";
  const value = document.documentElement.dataset.mode;
  return value === "pulse" || value === "midnight" || value === "survival" ? value : "lite";
}

function hasThemedFeedback() {
  return currentMode() !== "lite";
}

/** Compatibility exports for existing callers. Audio is intentionally disabled. */
export function pulseSoundEnabled() { return false; }
export function pulseHapticsEnabled() { return hasThemedFeedback(); }
export function setPulseSoundEnabled(_value: boolean) {}
export function setPulseHapticsEnabled(_value: boolean) {}
export function unlockPulseAudio() {}
export function previewPulseSound(_kind: PulseFeedbackKind = "finish") {}

export function haptic(pattern: number | number[] = 8) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* Unsupported browsers ignore tactile feedback. */
  }
}

export function pulseFeedback(kind: PulseFeedbackKind) {
  if (!hasThemedFeedback()) return;
  const patterns: Record<PulseFeedbackKind, number | number[]> = {
    nav: 6,
    tap: 6,
    confirm: 10,
    start: [7, 18, 8],
    finish: [9, 22, 9],
  };
  haptic(patterns[kind]);
}
