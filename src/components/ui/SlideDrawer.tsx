"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

export function SlideDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  widthClass = "max-w-xl",
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  widthClass?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 !m-0 z-50 flex justify-end bg-[#202531]/55 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        className={`relative z-10 flex flex-col w-full ${widthClass} bg-white h-full shadow-2xl border-l border-[#202531]/15 overflow-hidden`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#202531]/10 bg-white">
          <div>
            <h2 id="drawer-title" className="text-lg font-extrabold text-[#202531]">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[#525866] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel detail"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#525866] hover:text-[#202531] hover:bg-[#EBEBEB] transition-colors cursor-pointer"
          >
            <X size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );

  if (mounted && typeof document !== "undefined") {
    return createPortal(content, document.body);
  }
  return content;
}
