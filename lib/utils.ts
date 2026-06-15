import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * item.image_url holds either a private storage path (needs a signed URL) or a public
 * external URL (e.g. Open Food Facts). Only external URLs are directly displayable.
 */
export function externalImageUrl(url?: string | null): string | null {
  return url && /^https?:\/\//.test(url) ? url : null;
}
