"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

export default function ServiceWorkerRegistrar() {
  const { tr } = useI18n();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  // A production worker can remain attached after the same origin is later
  // opened with `next dev`, where un-hashed chunk names would otherwise look stale.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).catch(() => undefined);
    if (typeof window !== "undefined" && window.caches) {
      void window.caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("fitlog-")).map((key) => window.caches.delete(key)))).catch(() => undefined);
    }
  }, []);

  // 分块加载失败自愈：挂 VPN / 部署后旧外壳引用了失效的 JS 分块时，
  // 表现为白屏。检测到这类错误就清掉 SW + 缓存并刷新一次（每会话仅一次，防循环）。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const looksLikeChunkError = (msg: string) =>
      /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(
        msg
      );
    const heal = async () => {
      try {
        if (sessionStorage.getItem("fl_healed")) return;
        sessionStorage.setItem("fl_healed", "1");
      } catch {
        return;
      }
      try {
        if (navigator.serviceWorker) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch {}
      try {
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {}
      window.location.reload();
    };
    const onError = (e: ErrorEvent) => {
      const msg = e?.message || (e?.error && String(e.error)) || "";
      if (looksLikeChunkError(msg)) heal();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e?.reason;
      const msg = (r && (r.message || String(r))) || "";
      if (looksLikeChunkError(msg)) heal();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    const tid = window.setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          const track = (worker: ServiceWorker | null) => {
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setWaiting(worker);
              }
            });
          };
          // 已经有等待中的新版本
          if (reg.waiting && navigator.serviceWorker.controller) {
            setWaiting(reg.waiting);
          }
          reg.addEventListener("updatefound", () => track(reg.installing));
        })
        .catch(() => {
          /* 静默失败：不影响主流程 */
        });
    }, 1200);

    return () => {
      window.clearTimeout(tid);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
    >
      <div className="flex items-center gap-3 rounded-full border border-border bg-fg px-4 py-2 text-[13px] font-medium text-bg shadow-lg">
        <span>{tr("有新版本")}</span>
        <button type="button"
          onClick={() => waiting.postMessage("SKIP_WAITING")}
          className="press rounded-full bg-bg px-3 py-1 text-[12px] font-semibold text-fg"
        >
          {tr("刷新")}
        </button>
      </div>
    </div>
  );
}
