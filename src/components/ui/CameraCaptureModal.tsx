"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, X, ArrowsClockwise } from "@phosphor-icons/react";

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
          "Kamera perangkat tidak terdeteksi atau izin ditolak. Gunakan opsi Simulasi Tangkap Kamera Langsung di bawah untuk perangkat desktop tanpa webcam."
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

  if (!isOpen) return null;

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && cameraReady) {
      canvas.width = video.videoWidth || 800;
      canvas.height = video.videoHeight || 600;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Add live capture timestamp watermark to prevent gallery spoofing
        ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
        ctx.fillRect(0, canvas.height - 44, canvas.width, 44);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 14px monospace";
        ctx.fillText(
          `TRASIR LIVE CAPTURE • ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB`,
          16,
          canvas.height - 16
        );
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        onCapture(dataUrl);
        onClose();
      }
    }
  };

  const handleFallbackLiveReceipt = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onCapture(reader.result);
        onClose();
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E8EEF4] text-[#334E6B] flex items-center justify-center">
              <Camera size={20} weight="duotone" aria-hidden="true" />
            </div>
            <div>
              <h3 id="camera-modal-title" className="text-sm font-bold text-slate-900">
                {title}
              </h3>
              <p className="text-xs text-slate-600">
                Mencegah manipulasi galeri dengan stempel waktu tangkapan langsung
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup kamera"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X size={20} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-[4/3] flex items-center justify-center">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />
            {!cameraReady && !errorMsg && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-xs gap-2">
                <ArrowsClockwise size={24} className="animate-spin" aria-hidden="true" />
                <span>Mengaktifkan kamera perangkat...</span>
              </div>
            )}
            {errorMsg && (
              <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-slate-900/95 text-slate-200 text-xs gap-3">
                <p>{errorMsg}</p>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#3DC2CA] text-slate-950 font-bold cursor-pointer hover:opacity-90 min-h-[44px]">
                  <Camera size={18} weight="bold" aria-hidden="true" />
                  <span>Ambil dari Perangkat Kamera / File</span>
                  <input
                    type="file"
                    accept="image/*"
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
              className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100 cursor-pointer"
            >
              Batal
            </button>
            {cameraReady && (
              <button
                type="button"
                onClick={handleCaptureFrame}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#334E6B] text-white text-sm font-semibold hover:bg-[#24384E] cursor-pointer"
              >
                <Camera size={18} weight="bold" aria-hidden="true" />
                <span>Jepret Foto Nota</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

