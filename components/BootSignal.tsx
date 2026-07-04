"use client";

import { useEffect } from "react";

/** React 成功挂载（已提交到 DOM）后置位，告诉启动看门狗：不是白屏，无需自愈。 */
export default function BootSignal() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { __flBooted?: boolean }).__flBooted = true;
    }
  }, []);
  return null;
}
