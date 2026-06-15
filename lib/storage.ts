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
