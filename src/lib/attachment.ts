/**
 * Validasi lampiran bukti pendukung (gambar / PDF dalam format Data URL base64).
 * Mencegah file berbahaya (HTML/SVG/JS) maupun ukuran melebihi batas aman.
 */

export const ALLOWED_PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const MAX_PROOF_BYTES = 2 * 1024 * 1024; // 2 MB

export interface ProofValidationResult {
  valid: boolean;
  mimeType: string | null;
  byteLength: number;
  error?: string;
}

export function validateProofAttachment(dataUrl: string | null | undefined): ProofValidationResult {
  if (!dataUrl || !dataUrl.trim()) {
    return { valid: true, mimeType: null, byteLength: 0 };
  }

  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return {
      valid: false,
      mimeType: null,
      byteLength: 0,
      error: "Format lampiran bukti tidak valid. Gunakan file JPG, PNG, WEBP, atau PDF.",
    };
  }

  const mimeType = match[1].toLowerCase();
  if (!(ALLOWED_PROOF_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return {
      valid: false,
      mimeType,
      byteLength: 0,
      error: `Tipe file "${mimeType}" tidak diizinkan. Hanya JPG, PNG, WEBP, dan PDF yang diterima.`,
    };
  }

  const base64Body = match[2].replace(/\s+/g, "");
  const padding = base64Body.endsWith("==") ? 2 : base64Body.endsWith("=") ? 1 : 0;
  const byteLength = Math.floor((base64Body.length * 3) / 4) - padding;

  if (byteLength <= 0) {
    return {
      valid: false,
      mimeType,
      byteLength: 0,
      error: "File lampiran kosong atau rusak.",
    };
  }

  if (byteLength > MAX_PROOF_BYTES) {
    return {
      valid: false,
      mimeType,
      byteLength,
      error: "Ukuran lampiran melebihi batas maksimal 2 MB.",
    };
  }

  return {
    valid: true,
    mimeType,
    byteLength,
  };
}

