import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "@/lib/toast";
import { UIModeProvider } from "@/lib/uiMode";
import { I18nProvider } from "@/lib/i18n";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import ErrorBoundary from "@/components/ErrorBoundary";
import BootSignal from "@/components/BootSignal";

export const metadata: Metadata = {
  title: "FitLog 2.7",
  description: "本地优先的训练、进度与减脂控制台",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FitLog",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d0b" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-mode="lite" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+SC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* 在 React 接管前同步读取偏好，避免 UI Mode 切换闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=localStorage.getItem('fitlog:uiMode');document.documentElement.setAttribute('data-mode',m==='pulse'?'pulse':'lite');}catch(e){document.documentElement.setAttribute('data-mode','lite');}})();",
          }}
        />
        {/* 启动看门狗：纯计时、不依赖任何分块加载。若 8 秒内 React 仍未挂载
            （白屏，常因无代理时连 Vercel 半路加载失败），自动清缓存+注销SW+刷新一次，
            每次打开仅自愈一次，防止刷新循环。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var H='fl_boot_heal';setTimeout(function(){if(window.__flBooted)return;try{if(sessionStorage.getItem(H))return;sessionStorage.setItem(H,'1');}catch(e){return;}(async function(){try{if(navigator.serviceWorker){var rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(function(r){return r.unregister();}));}}catch(e){}try{if(window.caches){var ks=await caches.keys();await Promise.all(ks.map(function(k){return caches.delete(k);}));}}catch(e){}location.reload();})();},8000);})();",
          }}
        />
        {/* 进入页面即清掉上一次的自愈标记，使下次白屏仍可自愈一次 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('pageshow',function(){if(window.__flBooted){try{sessionStorage.removeItem('fl_boot_heal');}catch(e){}}});",
          }}
        />
      </head>
      <body>
        <BootSignal />
        <ErrorBoundary>
          <StoreProvider>
            <I18nProvider>
            <UIModeProvider>
              <ToastProvider>
                <div className="mx-auto flex min-h-[100dvh] max-w-app flex-col">
                  <main className="app-main">{children}</main>
                </div>
                <BottomNav />
                <ServiceWorkerRegistrar />
              </ToastProvider>
            </UIModeProvider>
            </I18nProvider>
          </StoreProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
