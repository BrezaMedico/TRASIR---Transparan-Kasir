import { ALLOWED_PROOF_MIME_TYPES, MAX_PROOF_BYTES } from "./attachment";

const MAX_IMAGE_DIMENSION = 1600;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file lampiran nota."));
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(file);
  });
}

function estimateBase64Bytes(dataUrl: string): number {
  const idx = dataUrl.indexOf("base64,");
  if (idx === -1) return dataUrl.length;
  const body = dataUrl.slice(idx + 7).replace(/\s+/g, "");
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
}

function renderCompressedJpeg(dataUrl: string, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(dataUrl);
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        if (width >= height) {
          height = Math.round((height / width) * MAX_IMAGE_DIMENSION);
          width = MAX_IMAGE_DIMENSION;
        } else {
          width = Math.round((width / height) * MAX_IMAGE_DIMENSION);
          height = MAX_IMAGE_DIMENSION;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

/**
 * Validasi dan kompresi berkas nota (JPG, PNG, WEBP, PDF) agar tajam dibaca
 * sekaligus tetap di bawah batas maksimal 2 MB.
 */
export async function compressReceiptFileToDataUrl(
  file: File
): Promise<{ dataUrl: string; error?: string }> {
  const mime = (file.type || "").toLowerCase();
  if (!(ALLOWED_PROOF_MIME_TYPES as readonly string[]).includes(mime)) {
    return {
      dataUrl: "",
      error: "Format file tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF.",
    };
  }

  if (mime === "application/pdf") {
    if (file.size > MAX_PROOF_BYTES) {
      return {
        dataUrl: "",
        error: "Ukuran file PDF maksimal 2 MB.",
      };
    }
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl || estimateBase64Bytes(dataUrl) > MAX_PROOF_BYTES) {
      return {
        dataUrl: "",
        error: "Ukuran file PDF melebihi batas maksimal 2 MB.",
      };
    }
    return { dataUrl };
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  if (!rawDataUrl) {
    return { dataUrl: "", error: "Gagal membaca berkas gambar nota." };
  }

  let processed = await renderCompressedJpeg(rawDataUrl, 0.85);
  if (estimateBase64Bytes(processed) > MAX_PROOF_BYTES) {
    processed = await renderCompressedJpeg(rawDataUrl, 0.72);
  }
  if (estimateBase64Bytes(processed) > MAX_PROOF_BYTES) {
    return {
      dataUrl: "",
      error: "Ukuran gambar nota masih melebihi 2 MB setelah diproses. Pilih gambar dengan ukuran lebih kecil.",
    };
  }

  return { dataUrl: processed };
}

/**
 * Mengubah Data URL base64 (termasuk PDF) menjadi Blob URL aman agar mudah dibuka di tab baru atau pratinjau.
 */
export function dataUrlToBlobUrl(dataUrl: string): string | null {
  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mime = match[1];
    const binary = atob(match[2].replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
