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

function decodeBase64Prefix(base64Body: string): Uint8Array {
  const chunk = base64Body.slice(0, 24);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(chunk, "base64");
  }
  const binary = atob(chunk);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function matchesMagicBytes(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  if (mimeType === "application/pdf") {
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    );
  }
  return false;
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

  const headerBytes = decodeBase64Prefix(base64Body);
  if (!matchesMagicBytes(mimeType, headerBytes)) {
    return {
      valid: false,
      mimeType,
      byteLength,
      error: "Isi berkas tidak cocok dengan tipe file yang dideklarasikan.",
    };
  }

  return {
    valid: true,
    mimeType,
    byteLength,
  };
}

