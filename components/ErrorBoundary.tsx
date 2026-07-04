"use client";

import React from "react";

// 全局错误兜底：任何渲染崩溃不再白屏，而是显示错误信息 + 恢复入口。
// 刻意不依赖任何 Provider / i18n（崩溃可能正出在它们里），全部静态文案。
type State = { error: Error | null };

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 记录到控制台，便于连真机调试时查看
    console.error("FitLog crashed:", error, info);
  }

  private reload = () => {
    this.setState({ error: null });
    if (typeof window !== "undefined") window.location.reload();
  };

  private exportData = async () => {
    try {
      const raw = window.localStorage.getItem("fitlog:v1") ?? "(empty)";
      await navigator.clipboard.writeText(raw);
      alert("数据已复制到剪贴板，请粘贴发给开发者。\nData copied to clipboard.");
    } catch {
      try {
        const raw = window.localStorage.getItem("fitlog:v1") ?? "(empty)";
        window.prompt("长按全选复制以下数据 / copy this:", raw);
      } catch {
        alert("无法读取数据 / cannot read data");
      }
    }
  };

  private hardReset = async () => {
    const ok = window.confirm(
      "这会清空本机所有 FitLog 数据并重启，确定？\nThis erases all local FitLog data. Continue?"
    );
    if (!ok) return;
    try {
      window.localStorage.removeItem("fitlog:v1");
    } catch {}
    try {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    try {
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {}
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // 错误界面已经渲染出来 = 不是白屏，阻止启动看门狗把它刷掉，让用户能看到错误信息
    if (typeof window !== "undefined") {
      (window as unknown as { __flBooted?: boolean }).__flBooted = true;
    }

    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 16,
          padding: "24px",
          background: "#f6f4ee",
          color: "#2a2724",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'IBM Plex Sans', sans-serif",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700 }}>
          应用出错了
          <span style={{ opacity: 0.5, fontWeight: 500 }}> · Something went wrong</span>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.75, margin: 0 }}>
          先点「重试」。若仍出错，把下面的错误信息截图发给开发者；或导出数据后清除重启。
        </p>

        <pre
          style={{
            fontSize: 11,
            lineHeight: 1.5,
            background: "rgba(42,39,36,0.06)",
            border: "1px solid rgba(42,39,36,0.12)",
            borderRadius: 8,
            padding: 12,
            margin: 0,
            maxHeight: 220,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "ui-monospace, 'IBM Plex Mono', monospace",
          }}
        >
          {String(error?.message || error)}
          {error?.stack ? "\n\n" + error.stack : ""}
        </pre>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={this.reload} style={btn(true)}>
            重试 Retry
          </button>
          <button onClick={this.exportData} style={btn(false)}>
            导出数据 Export
          </button>
          <button onClick={this.hardReset} style={btn(false)}>
            清除数据并重启 Reset
          </button>
        </div>
      </div>
    );
  }
}

function btn(primary: boolean): React.CSSProperties {
  return {
    appearance: "none",
    border: primary ? "none" : "1px solid rgba(42,39,36,0.2)",
    background: primary ? "#2a2724" : "transparent",
    color: primary ? "#f6f4ee" : "#2a2724",
    borderRadius: 10,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  };
}
