export const APPLE_HEALTH_NATIVE_READY_EVENT = "fitlog:native-ready";
export const APPLE_HEALTH_SNAPSHOT_EVENT = "fitlog:health-snapshot";
export const APPLE_HEALTH_ERROR_EVENT = "fitlog:health-error";

interface FitLogNativeHost {
  platform?: string;
  healthKit?: boolean;
  bridgeVersion?: number;
}

interface NativeMessageHandler {
  postMessage: (message: unknown) => void;
}

declare global {
  interface Window {
    fitlogNative?: FitLogNativeHost;
    webkit?: {
      messageHandlers?: {
        fitlogHealth?: NativeMessageHandler;
      };
    };
  }
}

export function isAppleHealthBridgeAvailable() {
  if (typeof window === "undefined") return false;
  return window.fitlogNative?.platform === "ios"
    && window.fitlogNative.healthKit === true
    && typeof window.webkit?.messageHandlers?.fitlogHealth?.postMessage === "function";
}

export function requestAppleHealthSync(days = 90) {
  if (!isAppleHealthBridgeAvailable()) return false;
  window.webkit!.messageHandlers!.fitlogHealth!.postMessage({
    action: "sync",
    days: Math.min(365, Math.max(7, Math.round(days))),
  });
  return true;
}
