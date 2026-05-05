"use client";

import { useEffect, useRef, useState } from "react";
import { PILL_TRADES } from "@/lib/domain/landing-trades";

const ITEM_HEIGHT_PX = 38;
const CYCLE_INTERVAL_MS = 2400;

export const CyclingPill = (): React.ReactElement => {
  const [index, setIndex] = useState(0);
  const reduced = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = mq.matches;
    if (mq.matches) return;
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % PILL_TRADES.length);
    }, CYCLE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 mb-8 text-sm text-[color:var(--muted)] tracking-[0.02em]">
      <span className="font-medium uppercase tracking-[0.12em] text-[11px]">Built for</span>
      <div
        className="relative h-[38px] overflow-hidden bg-[color:var(--orange)] text-white rounded-full px-[22px] inline-flex items-center min-w-[160px] shadow-[0_4px_14px_rgba(232,90,31,0.25)] font-medium text-sm tracking-[0.01em]"
        aria-live="polite"
        aria-label="cycling through trade types"
      >
        <div
          className="flex flex-col motion-safe:transition-transform motion-safe:duration-[550ms] motion-safe:ease-[cubic-bezier(0.7,0,0.3,1)]"
          style={{ transform: `translateY(-${index * ITEM_HEIGHT_PX}px)` }}
        >
          {PILL_TRADES.map((t) => (
            <div
              key={t}
              className="h-[38px] flex items-center justify-center flex-shrink-0 whitespace-nowrap"
            >
              {t}
            </div>
          ))}
        </div>
      </div>
      <span className="font-medium uppercase tracking-[0.12em] text-[11px]">— and growing</span>
    </div>
  );
};
