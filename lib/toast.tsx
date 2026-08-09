"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type ToastTone = "success" | "info" | "warning" | "error";

interface ToastOptions {
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastApi {
  show: (content: React.ReactNode, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{
    id: number;
    content: React.ReactNode;
    tone: ToastTone;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((content: React.ReactNode, options?: ToastOptions) => {
    const id = Date.now();
    const tone = options?.tone ?? "success";
    setToast({ id, content, tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setToast(null),
      options?.durationMs ?? (tone === "error" || tone === "warning" ? 2800 : 1900),
    );
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="toast-layer pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4"
        aria-live={toast?.tone === "error" ? "assertive" : "polite"}
      >
        {toast && (
          <div
            key={toast.id}
            className="toast-pop flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold shadow-lg"
            data-tone={toast.tone}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <ToastIcon tone={toast.tone} />
            <span className="tnum">{toast.content}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") {
    return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (tone === "error") {
    return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
  }
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" /><path d={tone === "warning" ? "M12 7V13M12 17H12.01" : "M12 10V17M12 7H12.01"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx;
}
