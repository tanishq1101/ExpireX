import 'server-only';
import { createAdminClient } from '@/services/supabase/admin';

/** Account-wide atomic quota; fail closed when the backing store is unavailable. */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc('take_quota', { p_key: key, p_limit: limit, p_window_ms: windowMs });
    return !error && data === true;
  } catch { return false; }
}
