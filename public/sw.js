// FitLog Service Worker —— 不可变资源缓存优先 + 其余网络优先 + 缓存兜底
// 目的：地铁 / 没信号 / 弱网也能开 app；带哈希的 JS/CSS 分块命中缓存即秒开，
//       不再因弱网下分块请求失败而白屏；HTML 等仍网络优先，线上不偏离最新代码
const CACHE = "fitlog-runtime-v6";

self.addEventListener("install", () => {
  // 不在此 skipWaiting —— 让新版本等待，由页面提示用户后再激活
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 带哈希的不可变静态资源：缓存优先（命中即秒开，避免弱网下分块加载失败导致白屏）
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          return new Response("", { status: 504, statusText: "offline" });
        }
      })()
    );
    return;
  }

  // 其余（含 HTML 文档）：网络优先 + 缓存兜底
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const root = await caches.match("/");
          if (root) return root;
        }
        return new Response("offline", { status: 503, statusText: "offline" });
      }
    })()
  );
});
