"use client";

import React, { useEffect, useRef, useState } from "react";
import { Barcode, X } from "@phosphor-icons/react";

export function BarcodeScannerModal({
  isOpen,
  onClose,
  onDetected,
  products,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  products: { id: string; sku: string; barcode: string | null; name: string }[];
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let stream: MediaStream | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    setManualCode("");

    async function initScanner() {
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setCameraActive(true);
          }

          // Use native BarcodeDetector API when available in browser
          const WinWithBarcode = window as unknown as {
            BarcodeDetector?: new () => {
              detect: (el: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
            };
          };
          if (WinWithBarcode.BarcodeDetector && videoRef.current) {
            const detector = new WinWithBarcode.BarcodeDetector();
            let detecting = false;
            let detected = false;
            intervalId = setInterval(async () => {
              if (!videoRef.current || detecting || detected) return;
              detecting = true;
              try {
                const barcodes = await detector.detect(videoRef.current);
                if (!detected && barcodes.length > 0 && barcodes[0].rawValue) {
                  detected = true;
                  onDetected(barcodes[0].rawValue);
                  onClose();
                }
              } catch {
                // ignore frame errors
              } finally {
                detecting = false;
              }
            }, 500);
          }
        }
      } catch {
        setCameraActive(false);
      }
    }

    initScanner();

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [isOpen, onClose, onDetected]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    onDetected(manualCode.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="barcode-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8EEF4] text-[#334E6B] flex items-center justify-center">
              <Barcode size={20} weight="duotone" aria-hidden="true" />
            </div>
            <div>
              <h3 id="barcode-modal-title" className="text-sm font-bold text-slate-900">
                Pindai Barcode / SKU Produk
              </h3>
              <p className="text-xs text-slate-600">
                Arahkan kamera ke barcode atau masukkan kode SKU
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pemindai barcode"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-[#3DC2CA] shadow-[0_0_8px_#3DC2CA]" />
            {!cameraActive && (
              <p className="absolute text-xs text-slate-300 px-4 text-center">
                Kamera pemindai aktif atau gunakan input pemindai USB/kode di bawah
              </p>
            )}
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label htmlFor="barcode-input" className="block text-xs font-semibold text-slate-700">
              Kode Barcode / SKU
            </label>
            <div className="flex gap-2">
              <input
                id="barcode-input"
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Ketik atau scan kode SKU / Barcode..."
                autoFocus
                className="flex-1 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#334E6B]"
              />
              <button
                type="submit"
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-sm font-semibold hover:bg-[#24384E] cursor-pointer"
              >
                Pilih
              </button>
            </div>
          </form>

          {products.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-600">Pilih Cepat Kode Terdaftar:</p>
              <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {products.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onDetected(p.barcode || p.sku);
                      onClose();
                    }}
                    className="w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-50 cursor-pointer min-h-[44px]"
                  >
                    <span className="font-medium text-slate-800">{p.name}</span>
                    <span className="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                      {p.barcode || p.sku}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

