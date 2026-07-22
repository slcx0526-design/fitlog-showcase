import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./pulse.css";
import "./midnight.css";
import "./survival.css";
import "./midnight-ambient.css";
import "./survival-field.css";
import "./mode-switchboard.css";
import "./ui-safety.css";
import "./motion-tuning.css";
import "./visual-final.css";
import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "@/lib/toast";
import { UIModeProvider } from "@/lib/uiMode";
import { I18nProvider } from "@/lib/i18n";
import { RestTimerProvider } from "@/lib/restTimer";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import ErrorBoundary from "@/components/ErrorBoundary";
import BootSignal from "@/components/BootSignal";
import MidnightModeControl from "@/components/MidnightModeControl";

export const metadata: Metadata = { title: "FitLog 9.1.0", description: "本地优先的训练、进度与减脂控制台", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, statusBarStyle: "default", title: "FitLog" }, icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }], apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }] } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f4ee" }, { media: "(prefers-color-scheme: dark)", color: "#0e0d0b" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN" data-mode="lite" suppressHydrationWarning><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet" /><script dangerouslySetInnerHTML={{ __html: "(function(){try{var m=localStorage.getItem('fitlog:uiMode'),mode=(m==='pulse'||m==='midnight'||m==='survival')?m:'lite';document.documentElement.setAttribute('data-mode',mode);}catch(e){document.documentElement.setAttribute('data-mode','lite');}})();" }} /></head><body><BootSignal /><ErrorBoundary><StoreProvider><I18nProvider><UIModeProvider><RestTimerProvider><ToastProvider><div className="mx-auto flex min-h-[100dvh] max-w-app flex-col"><main className="app-main"><MidnightModeControl />{children}</main></div><BottomNav /><ServiceWorkerRegistrar /></ToastProvider></RestTimerProvider></UIModeProvider></I18nProvider></StoreProvider></ErrorBoundary></body></html>;
}
