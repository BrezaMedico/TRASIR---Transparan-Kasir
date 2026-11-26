"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X, ArrowsClockwise } from "@phosphor-icons/react";
import { compressReceiptFileToDataUrl } from "@/lib/receipt-client";

export function CameraCaptureModal({
  isOpen,
  onClose,
  onCapture,
  title = "Ambil Foto Nota Fisik (Kamera Langsung)",
}: {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let stream: MediaStream | null = null;
    setErrorMsg(null);
    setCameraReady(false);

    async function startCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Browser ini tidak mendukung akses kamera langsung.");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        setErrorMsg(
          "Kamera perangkat tidak terdeteksi atau izin ditolak. Gunakan opsi pilih gambar kamera/berkas di bawah untuk perangkat desktop."
        );
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && cameraReady) {
      canvas.width = video.videoWidth || 800;
      canvas.height = video.videoHeight || 600;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(32, 37, 49, 0.82)";
        ctx.fillRect(0, canvas.height - 44, canvas.width, 44);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 14px monospace";
        ctx.fillText(
          `TRASIR LIVE CAPTURE • ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB`,
          16,
          canvas.height - 16
        );
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        onCapture(dataUrl);
        onClose();
      }
    }
  };

  const handleFallbackLiveReceipt = async (file: File | null) => {
    if (!file) return;
    try {
      const result = await compressReceiptFileToDataUrl(file);
      if (result.error || !result.dataUrl) {
        setErrorMsg(result.error || "Gagal memproses gambar dari perangkat.");
        return;
      }
      onCapture(result.dataUrl);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal memproses gambar dari perangkat.");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] !m-0 flex items-center justify-center p-4 bg-[#202531]/65 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full border border-[#202531]/15 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBEBEB]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#202531] text-[#01DAD7] flex items-center justify-center shrink-0">
              <Camera size={20} weight="duotone" aria-hidden="true" />
            </div>
            <div>
              <h3 id="camera-modal-title" className="text-sm font-extrabold text-[#202531]">
                {title}
              </h3>
              <p className="text-xs text-[#525866]">
                Menangkap nota fisik secara langsung dengan stempel waktu
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup kamera"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#525866] hover:text-[#202531] hover:bg-[#EBEBEB] cursor-pointer"
          >
            <X size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="relative bg-[#202531] rounded-xl overflow-hidden aspect-[4/3] flex items-center justify-center">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />
            {!cameraReady && !errorMsg && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-xs gap-2">
                <ArrowsClockwise size={24} className="animate-spin text-[#01DAD7]" aria-hidden="true" />
                <span>Mengaktifkan kamera perangkat...</span>
              </div>
            )}
            {errorMsg && (
              <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-[#202531] text-[#EBEBEB] text-xs gap-3">
                <p className="leading-relaxed">{errorMsg}</p>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#01DAD7] text-[#202531] font-extrabold cursor-pointer hover:opacity-90 min-h-[44px]">
                  <Camera size={18} weight="bold" aria-hidden="true" />
                  <span>Ambil dari Perangkat Kamera / File</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFallbackLiveReceipt(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#202531]/20 text-[#202531] text-sm font-bold hover:bg-[#EBEBEB] cursor-pointer"
            >
              Batal
            </button>
            {cameraReady && (
              <button
                type="button"
                onClick={handleCaptureFrame}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#01DAD7] text-[#202531] text-sm font-extrabold hover:opacity-95 cursor-pointer"
              >
                <Camera size={18} weight="bold" aria-hidden="true" />
                <span>Jepret Foto Nota</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
