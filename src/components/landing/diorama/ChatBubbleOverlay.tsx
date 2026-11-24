"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck } from "lucide-react";
import type { DioramaSceneMeta } from "./dioramaConfig";

interface ChatBubbleOverlayProps {
  scene: DioramaSceneMeta;
  showRight: boolean;
  showBottom: boolean;
  reducedMotion: boolean;
}

export function ChatBubbleOverlay({
  scene,
  showRight,
  showBottom,
  reducedMotion,
}: ChatBubbleOverlayProps) {
  const springTransition = reducedMotion
    ? { duration: 0.16 }
    : { type: "spring" as const, stiffness: 360, damping: 28, mass: 0.85 };

  const exitTransition = { duration: 0.2, ease: "easeIn" as const };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
      aria-live="polite"
    >
      {/* Gelembung 1: Kanan Kubik (Notifikasi Masuk) */}
      <AnimatePresence mode="wait">
        {showRight && (
          <motion.div
            key={`right-${scene.id}`}
            initial={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 14, scale: 0.94 }
            }
            animate={{ opacity: 1, y: 0, scale: 1, transition: springTransition }}
            exit={
              reducedMotion
                ? { opacity: 0, transition: exitTransition }
                : { opacity: 0, y: -6, scale: 0.94, transition: exitTransition }
            }
            className="absolute right-0 top-3 max-w-[235px] sm:right-2 sm:top-6 sm:max-w-[260px]"
          >
            <div className="relative rounded-2xl rounded-tl-sm border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-[0_10px_28px_-10px_rgba(15,23,42,0.16)]">
              <span
                aria-hidden="true"
                className="absolute -left-1.5 top-2.5 h-3 w-3 rotate-45 border-b border-l border-slate-200/90 bg-white"
              />
              <div className="relative flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold tracking-tight text-[#0F766E]">
                  {scene.rightBubble.sender}
                </span>
                <span className="text-[10px] font-medium tabular-nums text-slate-500">
                  {scene.rightBubble.time}
                </span>
              </div>
              <p className="relative mt-1 text-xs leading-snug text-slate-800 sm:text-[13px]">
                {scene.rightBubble.text}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gelembung 2: Bawah Kubik (Konfirmasi Balasan) */}
      <AnimatePresence mode="wait">
        {showBottom && (
          <motion.div
            key={`bottom-${scene.id}`}
            initial={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 16, scale: 0.94 }
            }
            animate={{ opacity: 1, y: 0, scale: 1, transition: springTransition }}
            exit={
              reducedMotion
                ? { opacity: 0, transition: exitTransition }
                : { opacity: 0, y: 8, scale: 0.94, transition: exitTransition }
            }
            className="absolute bottom-3 left-0 max-w-[255px] sm:bottom-5 sm:left-3 sm:max-w-[290px]"
          >
            <div className="relative rounded-2xl rounded-br-sm border border-[#99F6E4] bg-[#F0FDFA] px-3.5 py-2.5 shadow-[0_10px_28px_-10px_rgba(15,118,110,0.18)]">
              <span
                aria-hidden="true"
                className="absolute -right-1.5 bottom-2.5 h-3 w-3 rotate-45 border-r border-t border-[#99F6E4] bg-[#F0FDFA]"
              />
              <div className="relative flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold tracking-tight text-[#0F766E]">
                  {scene.bottomBubble.sender}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium tabular-nums text-slate-600">
                  {scene.bottomBubble.time}
                  {scene.bottomBubble.hasDoubleCheck && (
                    <CheckCheck
                      className="h-3.5 w-3.5 text-[#0F766E]"
                      aria-label="Terkonfirmasi"
                    />
                  )}
                </span>
              </div>
              <p className="relative mt-1 text-xs leading-snug text-slate-800 sm:text-[13px]">
                {scene.bottomBubble.text}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
