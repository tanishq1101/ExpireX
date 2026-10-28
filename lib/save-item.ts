import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadItemImage, removeUnreferencedImage } from './storage';

/** A stable form ID and staged upload survive uncertain network errors and retries. */
export async function saveItem(db: SupabaseClient, opts: {
  id: string; userId: string; mode: 'create' | 'edit'; payload: Record<string, unknown>;
  file: File | null; staged: { current: { file: File; path: string } | null }; oldImage: string | null;
}) {
  const { file, staged } = opts;
  if (file && staged.current?.file !== file) {
    if (staged.current) await removeUnreferencedImage(db, staged.current.path);
    staged.current = { file, path: await uploadItemImage(db, opts.userId, file) };
  }
  const path = staged.current?.path ?? opts.oldImage;
  const payload = { ...opts.payload, image_url: path };
  const query = opts.mode === 'create'
    ? db.from('items').upsert({ ...payload, id: opts.id, user_id: opts.userId }, { onConflict: 'id' })
    : db.from('items').update(payload).eq('id', opts.id).eq('user_id', opts.userId);
  const { data, error } = await query.select('id').maybeSingle();
  if (error || !data) {
    // An empty error code can represent an ambiguous transport failure: retain for retry.
    if (staged.current && (error?.code || !error)) {
      await removeUnreferencedImage(db, staged.current.path).catch(() => {});
      staged.current = null;
    }
    throw new Error(error?.message ?? 'This item is no longer available. Reload before saving.');
  }
  staged.current = null;
  if (opts.oldImage && opts.oldImage !== path) {
    try { await removeUnreferencedImage(db, opts.oldImage); }
    catch { return { cleanupWarning: true }; }
  }
  return { cleanupWarning: false };
}
