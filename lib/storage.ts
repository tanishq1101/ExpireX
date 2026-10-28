import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "item-images";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

/** Upload an item image to <uid>/<uuid>.<ext>. Returns the storage path (stored in image_url). */
export async function uploadItemImage(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("File must be an image.");
  if (file.size > MAX_BYTES) throw new Error("Image must be under 8MB.");

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return path;
}

export async function removeItemImage(supabase: SupabaseClient, path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Delete only unreferenced private objects; keep them when the database is unavailable. */
export async function removeUnreferencedImage(supabase: SupabaseClient, path: string) {
  if (/^https?:\/\//i.test(path)) return;
  const { data, error } = await supabase.from('items').select('id').eq('image_url', path).limit(1);
  if (error || !data || data.length) return;
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
  if (removeError) throw new Error('The image could not be removed.');
}

export async function withImagePreviews<T extends { image_url: string | null }>(supabase: SupabaseClient, items: T[]): Promise<(T & { image_preview_url?: string })[]> {
  const paths = [...new Set(items.map((i) => i.image_url).filter((p): p is string => !!p && !/^https?:\/\//i.test(p)))];
  if (!paths.length) return items;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 900);
  const urls = new Map((data ?? []).filter((r) => !r.error && r.path).map((r) => [r.path, r.signedUrl]));
  return items.map((item) => ({ ...item, image_preview_url: urls.get(item.image_url ?? '') ?? undefined }));
}
