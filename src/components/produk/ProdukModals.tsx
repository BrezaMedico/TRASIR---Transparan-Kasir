"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ClipboardText, Trash, Warning } from "@phosphor-icons/react";
import type { GroupedProductRequestBatch } from "@/lib/product-request-batch";
import type { ProductItem, ProductRequestItem, ProposalCartItem } from "./types";

interface ProdukModalsProps {
  portalMounted: boolean;
  isAdmin: boolean;
  canCreate: boolean;
  canEdit: boolean;
  products: ProductItem[];
  proposalCart: ProposalCartItem[];
  onOpenCartDrawer: () => void;
  deletingTarget: ProductItem | null;
  deletingBusy: boolean;
  onCloseDeleteTarget: () => void;
  onConfirmDelete: () => void;
  deletingBatch: GroupedProductRequestBatch<ProductRequestItem> | null;
  deletingBatchScope: "FOR_ME" | "FOR_ALL" | null;
  onCloseDeleteBatch: () => void;
  onConfirmDeleteBatch: (scope: "FOR_ME" | "FOR_ALL") => void;
}

export function ProdukModals({
  portalMounted,
  isAdmin,
  canCreate,
  canEdit,
  products,
  proposalCart,
  onOpenCartDrawer,
  deletingTarget,
  deletingBusy,
  onCloseDeleteTarget,
  onConfirmDelete,
  deletingBatch,
  deletingBatchScope,
  onCloseDeleteBatch,
  onConfirmDeleteBatch,
}: ProdukModalsProps) {
  const deleteBatchDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteDialogPressedOutsideRef = useRef(false);

  useEffect(() => {
    const dialog = deleteBatchDialogRef.current;
    if (!dialog) return;
    if (deletingBatch) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [deletingBatch]);

  useEffect(() => {
    if (!deletingTarget || deletingBusy) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseDeleteTarget();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deletingTarget, deletingBusy, onCloseDeleteTarget]);

  const dependentMenus =
    deletingTarget && deletingTarget.isRawMaterial
      ? products.filter(
          (p) =>
            !p.isRawMaterial &&
            p.variants.some((v) =>
              v.ingredients.some((ing) => ing.materialId === deletingTarget.id)
            )
        )
      : [];
  const targetKindLabel = deletingTarget
    ? deletingTarget.isRawMaterial
      ? "bahan baku"
      : deletingTarget.stockMethod === "RESEP"
      ? "produk dan resep"
      : "produk"
    : "";

  return (
    <>
      {portalMounted &&
        !isAdmin &&
        (canCreate || canEdit) &&
        proposalCart.length > 0 &&
        createPortal(
          <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 z-40 !m-0 flex justify-end pointer-events-none">
            <div className="pointer-events-auto w-full md:w-auto max-w-xl rounded-2xl bg-[#202531] text-white px-4 py-3 shadow-2xl border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#01DAD7] text-[#202531] flex items-center justify-center font-extrabold shrink-0">
                  <ClipboardText size={20} weight="bold" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-white">
                    Daftar Pengajuan: {proposalCart.length} Item Siap Kirim
                  </p>
                  <p className="text-[11px] text-[#EBEBEB]/80 truncate max-w-[260px]">
                    {proposalCart.map((c) => c.name).join(", ")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenCartDrawer}
                className="px-4 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-xs font-extrabold hover:opacity-95 shrink-0 cursor-pointer"
              >
                Lihat Daftar &amp; Kirim
              </button>
            </div>
          </div>,
          document.body
        )}

      {portalMounted &&
        deletingTarget &&
        createPortal(
          <div className="fixed inset-0 z-[70] !m-0 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-[#202531]/55 backdrop-blur-[1px]"
              onClick={() => {
                if (!deletingBusy) onCloseDeleteTarget();
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-product-title"
              className="relative z-10 w-full max-w-md rounded-2xl bg-white border border-[#EBEBEB] shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/30 text-[#D41448] flex items-center justify-center shrink-0">
                  <Warning size={22} weight="bold" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="delete-product-title" className="text-base font-bold text-[#202531] leading-snug">
                    Apakah Anda yakin ingin menghapus {targetKindLabel} &quot;{deletingTarget.name}&quot;?
                  </h2>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {deletingTarget.stockMethod === "RESEP"
                      ? "Menu ini beserta daftar takaran resepnya akan dihapus dari kasir. Stok bahan baku yang tersisa tidak ikut terhapus."
                      : deletingTarget.isRawMaterial
                      ? "Bahan baku ini akan dihapus dari daftar stok dapur/gudang."
                      : "Produk ini akan dihapus dari daftar kasir dan katalog."}
                  </p>
                </div>
              </div>

              {dependentMenus.length > 0 && (
                <div className="rounded-xl border border-[#FF2A63]/30 bg-[#FFF0F4] p-3 text-xs text-[#D41448] space-y-1">
                  <p className="font-bold">
                    Bahan baku ini masih dipakai di {dependentMenus.length} resep aktif:
                  </p>
                  <p className="font-semibold">
                    {dependentMenus.slice(0, 4).map((m) => m.name).join(", ")}
                    {dependentMenus.length > 4 ? `, dan ${dependentMenus.length - 4} lainnya` : ""}
                  </p>
                  <p>
                    Hapus atau ubah resep menu tersebut terlebih dahulu sebelum menghapus bahan baku ini.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={deletingBusy}
                  onClick={onCloseDeleteTarget}
                  className="px-4 min-h-[44px] rounded-xl border border-[#EBEBEB] bg-white hover:bg-[#F7F8FA] text-sm font-bold text-[#202531] disabled:opacity-50 cursor-pointer transition-colors"
                >
                  Batal
                </button>
                {dependentMenus.length === 0 && (
                  <button
                    type="button"
                    disabled={deletingBusy}
                    aria-busy={deletingBusy}
                    onClick={onConfirmDelete}
                    className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#D41448] hover:bg-[#b8103d] text-white text-sm font-bold disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    <Trash size={16} weight="bold" aria-hidden="true" />
                    <span>{deletingBusy ? "Menghapus..." : "Ya, Hapus"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      <dialog
        ref={deleteBatchDialogRef}
        aria-labelledby="delete-batch-title"
        {...({ closedby: deletingBatchScope ? "none" : "any" } as Record<string, string>)}
        onCancel={(e) => {
          if (deletingBatchScope) e.preventDefault();
        }}
        onClose={() => {
          if (deleteBatchDialogRef.current) deleteBatchDialogRef.current.returnValue = "";
          if (!deletingBatchScope) onCloseDeleteBatch();
        }}
        onPointerDown={(e) => {
          const dialog = deleteBatchDialogRef.current;
          if (!dialog) return;
          const r = dialog.getBoundingClientRect();
          deleteDialogPressedOutsideRef.current =
            e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        }}
        onPointerUp={(e) => {
          const dialog = deleteBatchDialogRef.current;
          if (!dialog || deletingBatchScope) return;
          const r = dialog.getBoundingClientRect();
          const releasedOutside =
            e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
          if (deleteDialogPressedOutsideRef.current && releasedOutside) onCloseDeleteBatch();
          deleteDialogPressedOutsideRef.current = false;
        }}
        className="trasir-modal w-full max-w-md rounded-2xl bg-white border border-[#EBEBEB] shadow-2xl p-6 m-auto"
      >
        {deletingBatch && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#FFF0F4] border border-[#FF2A63]/30 text-[#D41448] flex items-center justify-center shrink-0">
                <Trash size={22} weight="bold" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 id="delete-batch-title" className="text-base font-bold text-[#202531] leading-snug">
                  {isAdmin
                    ? `Hapus pengajuan "${deletingBatch.batchTitle}"?`
                    : `Hapus pengajuan "${deletingBatch.batchTitle}" untuk saya?`}
                </h1>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  {isAdmin
                    ? 'Pilih "Hapus untuk Saya" untuk menyembunyikan dari tampilan Anda saja, atau "Hapus untuk Semua" untuk menghapus permanen bagi seluruh tim. Produk yang sudah disetujui tetap aman di katalog.'
                    : "Pengajuan ini hanya akan dihapus dari daftar tampilan Anda agar tidak menumpuk. Data untuk Pemilik/Manajer tetap aman."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                autoFocus
                disabled={Boolean(deletingBatchScope)}
                onClick={onCloseDeleteBatch}
                className="px-4 min-h-[44px] rounded-xl border border-[#EBEBEB] bg-white hover:bg-[#F7F8FA] text-xs font-bold text-[#202531] disabled:opacity-50 cursor-pointer transition-colors"
              >
                Batal
              </button>
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    disabled={Boolean(deletingBatchScope)}
                    aria-busy={deletingBatchScope === "FOR_ME"}
                    onClick={() => onConfirmDeleteBatch("FOR_ME")}
                    className="px-4 min-h-[44px] rounded-xl bg-[#EBEBEB] hover:bg-[#DFDFE2] text-xs font-bold text-[#202531] disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    {deletingBatchScope === "FOR_ME" ? "Memproses..." : "Hapus untuk Saya"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(deletingBatchScope)}
                    aria-busy={deletingBatchScope === "FOR_ALL"}
                    onClick={() => onConfirmDeleteBatch("FOR_ALL")}
                    className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-[#D41448] hover:bg-[#b8103d] text-white text-xs font-bold disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    <Trash size={15} weight="bold" aria-hidden="true" />
                    <span>{deletingBatchScope === "FOR_ALL" ? "Menghapus..." : "Hapus untuk Semua"}</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(deletingBatchScope)}
                  aria-busy={deletingBatchScope === "FOR_ME"}
                  onClick={() => onConfirmDeleteBatch("FOR_ME")}
                  className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-xl bg-[#D41448] hover:bg-[#b8103d] text-white text-xs font-bold disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <Trash size={15} weight="bold" aria-hidden="true" />
                  <span>{deletingBatchScope === "FOR_ME" ? "Menghapus..." : "Ya, Hapus untuk Saya"}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

