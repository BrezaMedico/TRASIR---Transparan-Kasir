"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/layout/AppShell";
import { fetchJsonCached, getCachedData, invalidateCache } from "@/lib/client-cache";
import { getJakartaDateKey } from "@/lib/date-jakarta";
import { compressReceiptFileToDataUrl } from "@/lib/receipt-client";
import {
  ALLOWED_PROOF_MIME,
  MAX_PROOF_BYTES,
  SALES_PAGE_SIZE,
  type AmendmentRecord,
  type CashierSummary,
  type SaleRecord,
} from "./types";

interface SalesApiPayload {
  items?: SaleRecord[];
  sales?: SaleRecord[];
  nextCursor?: string | null;
  amendments?: AmendmentRecord[];
  cashiers?: CashierSummary[];
  error?: string;
}

export function usePenjualanData() {
  const { showToast } = useToast();
  const cachedSales = getCachedData<SalesApiPayload>("/api/sales?limit=50");

  const [sales, setSales] = useState<SaleRecord[]>(cachedSales?.items || cachedSales?.sales || []);
  const [nextCursor, setNextCursor] = useState<string | null>(cachedSales?.nextCursor ?? null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [amendments, setAmendments] = useState<AmendmentRecord[]>(cachedSales?.amendments || []);
  const [cashiers, setCashiers] = useState<CashierSummary[]>(cachedSales?.cashiers || []);

  const [searchQuery, setSearchQuery] = useState("");
  const [cashierFilter, setCashierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(!cachedSales);

  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [amendmentType, setAmendmentType] = useState<"PEMBATALAN" | "RETUR" | "PERUBAHAN">(
    "PEMBATALAN"
  );
  const [amendmentReason, setAmendmentReason] = useState("");
  const [amendmentProof, setAmendmentProof] = useState<string | null>(null);
  const [amendmentProofName, setAmendmentProofName] = useState<string | null>(null);
  const [submittingAmendment, setSubmittingAmendment] = useState(false);

  const [reviewNotesMap, setReviewNotesMap] = useState<Record<string, string>>({});
  const [confirmReview, setConfirmReview] = useState<{
    item: AmendmentRecord;
    decision: "DISETUJUI" | "DITOLAK";
  } | null>(null);
  const [processingReviewId, setProcessingReviewId] = useState<string | null>(null);

  const buildSalesUrl = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (cashierFilter) params.set("cashierId", cashierFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (dateFilter) params.set("date", dateFilter);
      if (cursor) params.set("cursor", cursor);
      return `/api/sales?${params.toString()}`;
    },
    [cashierFilter, statusFilter, dateFilter]
  );

  const loadAll = useCallback(async () => {
    const salesUrl = buildSalesUrl();
    const hasCached = Boolean(getCachedData(salesUrl));
    if (!hasCached) setLoading(true);
    try {
      const salesRes = await fetchJsonCached<SalesApiPayload>(salesUrl, { force: true });
      if (salesRes.ok) {
        setSales(salesRes.data.items || salesRes.data.sales || []);
        setNextCursor(salesRes.data.nextCursor ?? null);
        setAmendments(salesRes.data.amendments || []);
        setCashiers(salesRes.data.cashiers || []);
      }
    } catch {
      if (!hasCached) showToast("Gagal memuat riwayat transaksi.", "error");
    } finally {
      setLoading(false);
    }
  }, [buildSalesUrl, showToast]);

  const loadMoreSales = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildSalesUrl(nextCursor), { cache: "no-store" });
      const data = (await res.json()) as SalesApiPayload;
      if (!res.ok) {
        showToast(data.error || "Gagal memuat transaksi berikutnya.", "error");
        return;
      }
      const incoming = data.items || data.sales || [];
      setSales((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...incoming.filter((s) => !seen.has(s.id))];
      });
      setNextCursor(data.nextCursor ?? null);
    } catch {
      showToast("Gagal memuat transaksi berikutnya.", "error");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, cashierFilter]);

  const handleProofUpload = async (file: File | null) => {
    if (!file) return;
    if (!ALLOWED_PROOF_MIME.includes(file.type)) {
      showToast("Format bukti hanya mendukung JPG, PNG, WEBP, atau PDF.", "error");
      return;
    }
    if (file.type === "application/pdf") {
      if (file.size > MAX_PROOF_BYTES) {
        showToast("Ukuran file bukti maksimal 2 MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setAmendmentProof(reader.result);
          setAmendmentProofName(file.name);
        }
      };
      reader.onerror = () => showToast("Gagal membaca berkas PDF.", "error");
      reader.readAsDataURL(file);
      return;
    }
    try {
      const result = await compressReceiptFileToDataUrl(file);
      if (result.error || !result.dataUrl) {
        showToast(result.error || "Gagal memproses foto bukti.", "error");
        return;
      }
      setAmendmentProof(result.dataUrl);
      setAmendmentProofName(file.name);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memproses foto bukti.", "error");
    }
  };

  const handleRequestAmendment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;
    if (amendmentReason.trim().length < 5) {
      showToast("Alasan pembatalan wajib diisi minimal 5 karakter.", "error");
      return;
    }
    setSubmittingAmendment(true);
    try {
      const res = await fetch("/api/sales/amendments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REQUEST",
          saleId: selectedSale.id,
          amendmentType,
          reason: amendmentReason.trim(),
          proofImageData: amendmentProof,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal mengirim pengajuan pembatalan.", "error");
        return;
      }
      showToast(
        `Pengajuan ${amendmentType} struk #${selectedSale.receiptNumber} berhasil dikirim (Menunggu Persetujuan).`,
        "success"
      );
      setAmendmentReason("");
      setAmendmentProof(null);
      setAmendmentProofName(null);
      setShowCancelForm(false);
      setSelectedSale(null);
      invalidateCache("/api/dashboard");
      await loadAll();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setSubmittingAmendment(false);
    }
  };

  const executeReviewAmendment = async (
    amendmentId: string,
    decision: "DISETUJUI" | "DITOLAK"
  ) => {
    setProcessingReviewId(amendmentId);
    try {
      const notes = (reviewNotesMap[amendmentId] || "").trim();
      const res = await fetch("/api/sales/amendments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVIEW",
          amendmentId,
          decision,
          reviewNotes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal memproses keputusan pembatalan.", "error");
        return;
      }
      showToast(
        decision === "DISETUJUI"
          ? "Pembatalan transaksi disetujui. Status diperbarui dan stok otomatis dikembalikan."
          : "Pengajuan pembatalan ditolak. Transaksi tetap aktif.",
        decision === "DISETUJUI" ? "success" : "info"
      );
      setConfirmReview(null);
      invalidateCache("/api/dashboard");
      invalidateCache("/api/reports");
      invalidateCache("/api/products");
      await loadAll();
    } catch {
      showToast("Gagal menghubungi server.", "error");
    } finally {
      setProcessingReviewId(null);
    }
  };

  const filteredSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sales.filter((s) => {
      if (dateFilter && getJakartaDateKey(s.createdAt) !== dateFilter) return false;
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.receiptNumber.toLowerCase().includes(q) ||
        s.cashier.name.toLowerCase().includes(q) ||
        s.items.some((it) => it.productName.toLowerCase().includes(q))
      );
    });
  }, [sales, dateFilter, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / SALES_PAGE_SIZE));
  const paginatedSales = filteredSales.slice(
    (currentPage - 1) * SALES_PAGE_SIZE,
    currentPage * SALES_PAGE_SIZE
  );

  return {
    amendments,
    cashiers,
    searchQuery,
    setSearchQuery,
    cashierFilter,
    setCashierFilter,
    statusFilter,
    setStatusFilter,
    dateFilter,
    setDateFilter,
    currentPage,
    setCurrentPage,
    totalPages,
    filteredSales,
    paginatedSales,
    nextCursor,
    loading,
    loadingMore,
    loadMoreSales,
    selectedSale,
    setSelectedSale,
    showCancelForm,
    setShowCancelForm,
    amendmentType,
    setAmendmentType,
    amendmentReason,
    setAmendmentReason,
    amendmentProofName,
    submittingAmendment,
    reviewNotesMap,
    setReviewNotesMap,
    confirmReview,
    setConfirmReview,
    processingReviewId,
    handleProofUpload,
    handleRequestAmendment,
    executeReviewAmendment,
  };
}

