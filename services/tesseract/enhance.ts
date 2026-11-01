import "server-only";

/** Variants of a label photo that make faint or awkwardly oriented print legible to Tesseract. */
export type Enhancement = "contrast" | "local" | "invert";

const TARGET_EDGE = 2200;
const MIN_EDGE = 1500;

/**
 * Prepare a photo for OCR: honour EXIF rotation, flatten to grey, stretch contrast, sharpen and
 * scale so characters are ~30px tall (Tesseract's sweet spot). `rotate` handles sideways packs.
 * Returns the original bytes when sharp is unavailable or the image cannot be decoded, so
 * enhancement can only ever help.
 */
export async function enhanceForOcr(image: Buffer, kind: Enhancement, rotate: 0 | 90 | 180 | 270 = 0): Promise<Buffer> {
  try {
    const { default: sharp } = await import("sharp");
    const meta = await sharp(image, { failOn: "none" }).metadata();
    const sideways = (meta.orientation ?? 1) >= 5;
    const w = (sideways ? meta.height : meta.width) ?? 0;
    const h = (sideways ? meta.width : meta.height) ?? 0;
    const longEdge = Math.max(w, h);
    // Shrink huge photos (speed) and enlarge small ones (legibility); never distort.
    const edge = longEdge > TARGET_EDGE ? TARGET_EDGE : longEdge > 0 && longEdge < MIN_EDGE ? MIN_EDGE : 0;
    let pipeline = sharp(image, { failOn: "none" }).autoOrient();
    if (rotate) pipeline = pipeline.rotate(rotate);
    if (edge) pipeline = pipeline.resize({ width: edge, height: edge, fit: "inside", kernel: "lanczos3" });
    pipeline = pipeline.flatten({ background: "#ffffff" }).grayscale();
    pipeline = kind === "local"
      // Evens out glare and shadows across foil/plastic before stretching contrast.
      ? pipeline.clahe({ width: 48, height: 48, maxSlope: 3 }).normalise({ lower: 1, upper: 99 })
      : pipeline.normalise({ lower: 1, upper: 99 });
    if (kind === "invert") pipeline = pipeline.negate();
    return await pipeline.sharpen({ sigma: 1 }).png({ compressionLevel: 1 }).toBuffer();
  } catch {
    return image;
  }
}
