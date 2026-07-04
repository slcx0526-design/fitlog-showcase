/**
 * Original, generated interaction feedback. No third-party sound files or
 * borrowed game audio are used. iOS Safari may ignore navigator.vibrate();
 * in that case the action still completes normally.
 */
export type PulseFeedbackKind = "nav" | "tap" | "confirm" | "start" | "finish";

const SOUND_KEY = "fitlog:pulseSound";
const HAPTIC_KEY = "fitlog:pulseHaptics";
let audioContext: AudioContext | null = null;
let lastFeedbackAt = 0;

function inPulseMode() {
  return typeof document !== "undefined" && document.documentElement.dataset.mode === "pulse";
}

function readBool(key: string, fallback: boolean) {
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* Ignore private-mode / storage failures. */
  }
}

export function pulseSoundEnabled() {
  return typeof window === "undefined" ? true : readBool(SOUND_KEY, true);
}

export function pulseHapticsEnabled() {
  return typeof window === "undefined" ? true : readBool(HAPTIC_KEY, true);
}

export function setPulseSoundEnabled(value: boolean) {
  writeBool(SOUND_KEY, value);
}

export function setPulseHapticsEnabled(value: boolean) {
  writeBool(HAPTIC_KEY, value);
}

/** Minimal tactile feedback for supported mobile browsers. */
export function haptic(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* iOS Safari generally ignores this; no fallback is possible on the web. */
  }
}

function oscillatorTone(
  ctx: AudioContext,
  at: number,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = "triangle",
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

function playGeneratedTone(kind: PulseFeedbackKind) {
  if (!inPulseMode() || !pulseSoundEnabled() || typeof window === "undefined") return;
  try {
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    audioContext ??= new Context();
    const ctx = audioContext;
    if (ctx.state === "suspended") void ctx.resume();
    const at = ctx.currentTime + 0.004;
    const notes: Record<PulseFeedbackKind, Array<[number, number, number, OscillatorType]>> = {
      nav: [[320, 0.035, 0.018, "triangle"]],
      tap: [[250, 0.028, 0.012, "triangle"]],
      confirm: [[392, 0.045, 0.026, "square"], [523, 0.07, 0.018, "triangle"]],
      start: [[196, 0.045, 0.026, "square"], [294, 0.07, 0.024, "square"], [440, 0.09, 0.018, "triangle"]],
      finish: [[392, 0.05, 0.024, "triangle"], [523, 0.07, 0.022, "triangle"], [659, 0.1, 0.02, "triangle"]],
    };
    notes[kind].forEach(([frequency, duration, volume, type], index) => {
      oscillatorTone(ctx, at + index * 0.045, frequency, duration, volume, type);
    });
  } catch {
    /* Audio is optional and must never affect logging. */
  }
}

export function pulseFeedback(kind: PulseFeedbackKind) {
  if (!inPulseMode()) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const cooldown: Record<PulseFeedbackKind, number> = {
    nav: 120,
    tap: 90,
    confirm: 120,
    start: 160,
    finish: 180,
  };
  if (now - lastFeedbackAt < cooldown[kind]) return;
  lastFeedbackAt = now;
  if (pulseHapticsEnabled()) {
    const patterns: Record<PulseFeedbackKind, number | number[]> = {
      nav: 7,
      tap: 6,
      confirm: 13,
      start: [10, 20, 15],
      finish: [12, 24, 12, 24, 18],
    };
    haptic(patterns[kind]);
  }
  playGeneratedTone(kind);
}
