"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Indikator progres navigasi global di tepi atas layar.
 * Muncul dalam <16ms saat pengguna menekan tautan internal agar tidak terasa diam/lag.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const safetyRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (safetyRef.current !== null) {
      window.clearTimeout(safetyRef.current);
      safetyRef.current = null;
    }
  };

  useEffect(() => {
    clearTimers();
    if (visible) {
      setProgress(100);
      const hideId = window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 220);
      return () => window.clearTimeout(hideId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const startProgress = () => {
      clearTimers();
      setVisible(true);
      setProgress(22);
      timerRef.current = window.setInterval(() => {
        setProgress((prev) => (prev >= 88 ? prev : prev + (90 - prev) * 0.18));
      }, 260);
      safetyRef.current = window.setTimeout(() => {
        clearTimers();
        setVisible(false);
        setProgress(0);
      }, 12000);
    };

    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const rawHref = anchor.getAttribute("href");
      if (
        !rawHref ||
        rawHref.startsWith("#") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:")
      ) {
        return;
      }

      try {
        const dest = new URL(anchor.href, window.location.origin);
        if (dest.origin !== window.location.origin) return;
        if (dest.pathname === window.location.pathname && dest.search === window.location.search) {
          return;
        }
        startProgress();
      } catch {
        // ignore invalid URL
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      clearTimers();
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] bg-transparent"
    >
      <div
        className="h-full bg-gradient-to-r from-[#2563EB] via-[#3DC2CA] to-[#2563EB] shadow-[0_0_10px_rgba(37,99,235,0.6)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

