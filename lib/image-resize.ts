/** Longest edge sent for reading: small ink-jet dates need real pixels, but stay mobile-friendly. */
export const MAX_IMAGE_EDGE = 2400;
/** Photos larger than this are refused before decoding (a phone photo is usually 2–8 MB). */
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
/** Serverless hosts reject request bodies near 4.5 MB, so stay safely under it. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const KEEP_AS_IS_BYTES = 1400 * 1024;
/** Highest quality first; step down only when a photo would not fit the upload limit. */
const JPEG_QUALITIES = [0.92, 0.85, 0.75, 0.65];

export function fitWithin(width: number, height: number, maxEdge = MAX_IMAGE_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: scale < 1,
  };
}

/**
 * Shrink a camera/gallery photo in the browser before upload. Returns the original file if the
 * browser cannot decode it, so a failure here never blocks the user.
 */
export async function prepareImage(file: File): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height, scaled } = fitWithin(bitmap.width, bitmap.height);
    if (!scaled && file.type === "image/jpeg" && file.size <= KEEP_AS_IS_BYTES) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    // Flatten transparency onto white; JPEG would otherwise turn it black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    let blob: Blob | null = null;
    for (const quality of JPEG_QUALITIES) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob || blob.size <= MAX_UPLOAD_BYTES) break;
    }
    if (!blob || (!scaled && file.type === "image/jpeg" && blob.size >= file.size)) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
