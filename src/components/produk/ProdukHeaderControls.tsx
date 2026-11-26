"use client";

import React, { useRef } from "react";
import {
  Plus,
  MagnifyingGlass,
  Package,
  CookingPot,
  ClockCounterClockwise,
  ClipboardText,
  Info,
} from "@phosphor-icons/react";

export type ProdukTabKey = "catalog" | "materials" | "requests";

interface ProdukHeaderControlsProps {
  effectiveTab: ProdukTabKey;
  isAdmin: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canAccessRequests: boolean;
  sellableCount: number;
  materialsCount: number;
  pendingRequestsCount: number;
  proposalCartCount: number;
  search: string;
  onSearchChange: (val: string) => void;
  methodFilter: string;
  onMethodFilterChange: (val: string) => void;
  reqStatusFilter: string;
  onReqStatusFilterChange: (val: string) => void;
  onOpenAddMaterial: () => void;
  onOpenAddProduct: () => void;
  onOpenCartDrawer: () => void;
  onActivateTab: (tab: ProdukTabKey) => void;
}

export function ProdukHeaderControls({
  effectiveTab,
  isAdmin,
  canCreate,
  canEdit,
  canAccessRequests,
  sellableCount,
  materialsCount,
  pendingRequestsCount,
  proposalCartCount,
  search,
  onSearchChange,
  methodFilter,
  onMethodFilterChange,
  reqStatusFilter,
  onReqStatusFilterChange,
  onOpenAddMaterial,
  onOpenAddProduct,
  onOpenCartDrawer,
  onActivateTab,
}: ProdukHeaderControlsProps) {
  const tabButtonRefs = useRef<Partial<Record<ProdukTabKey, HTMLButtonElement | null>>>({});

  const visibleTabs: Array<{
    key: ProdukTabKey;
    id: string;
    label: string;
    badgeCount?: number;
  }> = [
    {
      key: "catalog",
      id: "produk-tab-catalog",
      label: `Menu & Produk Jual (${sellableCount})`,
    },
    {
      key: "materials",
      id: "produk-tab-materials",
      label: `Bahan Baku (${materialsCount})`,
    },
    ...(canAccessRequests
      ? [
          {
            key: "requests" as const,
            id: "produk-tab-requests",
            label: isAdmin ? "Persetujuan" : "Pengajuan Saya",
            badgeCount: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
          },
        ]
      : []),
  ];

  const activateAndScroll = (tabKey: ProdukTabKey) => {
    onActivateTab(tabKey);
    tabButtonRefs.current[tabKey]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIdx = visibleTabs.findIndex((t) => t.key === effectiveTab);
    if (currentIdx === -1) return;
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (currentIdx + 1) % visibleTabs.length;
    else if (e.key === "ArrowLeft")
      nextIdx = (currentIdx - 1 + visibleTabs.length) % visibleTabs.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = visibleTabs.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const nextTab = visibleTabs[nextIdx];
    activateAndScroll(nextTab.key);
    tabButtonRefs.current[nextTab.key]?.focus();
  };

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Produk &amp; Bahan Baku</h1>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl">
              Masukkan bahan baku terlebih dahulu (misalnya Susu Ultra Milk 1000 ml dan harga aslinya), lalu pecah takarannya dengan mudah saat membuat menu resep.
            </p>
          </div>

          {canCreate || canEdit ? (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {canCreate && (
                <>
                  <button
                    type="button"
                    onClick={onOpenAddMaterial}
                    className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-90 transition-opacity duration-150 cursor-pointer"
                  >
                    <CookingPot size={17} weight="bold" aria-hidden="true" />
                    <span>Tambah Bahan Baku</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenAddProduct}
                    className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#202531] text-white text-xs font-extrabold hover:bg-[#2a3140] transition-colors duration-150 cursor-pointer"
                  >
                    <Plus size={17} weight="bold" aria-hidden="true" />
                    <span>{isAdmin ? "Tambah Menu / Produk" : "Ajukan Menu / Produk"}</span>
                  </button>
                </>
              )}
              {!isAdmin && (
                <button
                  type="button"
                  onClick={onOpenCartDrawer}
                  className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl border border-[#202531]/25 bg-white text-[#202531] text-xs font-extrabold hover:bg-[#EBEBEB] transition-colors cursor-pointer"
                >
                  <ClipboardText size={17} weight="bold" aria-hidden="true" />
                  <span>Daftar Pengajuan ({proposalCartCount})</span>
                </button>
              )}
            </div>
          ) : (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#EBEBEB] border border-[#202531]/15 text-xs text-[#202531] flex items-center gap-2">
              <Info size={16} weight="bold" className="shrink-0" aria-hidden="true" />
              <span>
                Mode Lihat Saja: Penambahan produk dikelola oleh bagian Gudang, Manajer, atau Pemilik.
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3.5 border-t border-[#202531]/10">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlass
              size={16}
              weight="bold"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={
                effectiveTab === "materials"
                  ? "Cari nama bahan baku (misal: Susu, Gula, Teh)..."
                  : effectiveTab === "requests"
                  ? "Cari nama produk atau pengaju..."
                  : "Cari nama menu atau produk..."
              }
              aria-label="Cari di daftar"
              className="w-full pl-9 pr-3.5 h-10 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-slate-50 focus:bg-white"
            />
          </div>

          {effectiveTab === "catalog" && (
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "ALL", label: "Semua" },
                  { id: "RESEP", label: "Menu Resep" },
                  { id: "READY", label: "Langsung Jual" },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onMethodFilterChange(f.id)}
                  className={`px-3 min-h-[38px] rounded-xl text-xs font-bold cursor-pointer ${
                    methodFilter === f.id
                      ? "bg-[#202531] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {effectiveTab === "requests" && (
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "ALL", label: "Semua" },
                  { id: "MENUNGGU_PERSETUJUAN", label: "Menunggu" },
                  { id: "DISETUJUI", label: "Disetujui" },
                  { id: "DITOLAK", label: "Ditolak" },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onReqStatusFilterChange(st.id)}
                  className={`px-3 min-h-[38px] rounded-xl text-xs font-bold cursor-pointer ${
                    reqStatusFilter === st.id
                      ? "bg-[#202531] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#202531]/12 p-1.5 shadow-sm">
        <div
          role="tablist"
          aria-label="Kategori daftar produk dan bahan baku"
          {...({ focusgroup: "tablist nomemory" } as Record<string, string>)}
          className={`produk-tablist ${visibleTabs.length === 3 ? "produk-tablist-cols-3" : "produk-tablist-cols-2"}`}
          onKeyDown={handleTabKeyDown}
        >
          {visibleTabs.map((tab) => {
            const isActive = effectiveTab === tab.key;
            const IconComp =
              tab.key === "catalog"
                ? Package
                : tab.key === "materials"
                ? CookingPot
                : ClockCounterClockwise;

            return (
              <button
                key={tab.key}
                ref={(el) => {
                  tabButtonRefs.current[tab.key] = el;
                }}
                type="button"
                role="tab"
                id={tab.id}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                {...(isActive ? ({ focusgroupstart: "" } as Record<string, string>) : {})}
                onClick={() => activateAndScroll(tab.key)}
                className="produk-tab inline-flex items-center justify-center gap-2 px-4 min-h-[46px] rounded-xl text-xs font-bold transition-colors duration-150 cursor-pointer"
              >
                <IconComp
                  size={16}
                  weight="bold"
                  className={isActive ? "text-[#01DAD7] shrink-0" : "text-[#525866] shrink-0"}
                  aria-hidden="true"
                />
                <span>{tab.label}</span>
                {tab.badgeCount !== undefined && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                      isActive ? "bg-[#01DAD7] text-[#202531]" : "bg-[#D41448] text-white"
                    }`}
                  >
                    {tab.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

