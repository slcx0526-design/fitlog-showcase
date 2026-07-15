"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

function inLiteMode() {
  return document.documentElement.dataset.mode === "lite";
}

/** Lite deliberately avoids theatrical overlays: a short paper-like route cue only. */
export default function LiteInteractionLayer() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!inLiteMode()) {
      previous.current = pathname;
      return;
    }
    if (previous.current !== pathname) {
      previous.current = pathname;
      setTick((value) => value + 1);
    }
  }, [pathname]);

  if (tick === 0) return null;
  return <span key={`${pathname}-${tick}`} className="lite-route-cue" aria-hidden="true" />;
}
