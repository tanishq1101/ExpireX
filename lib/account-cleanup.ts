import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKET } from './storage';

/** Idempotent: webhook retries resume cleanup; tombstones prevent stale-session writes. */
export async function cleanupAccount(db: SupabaseClient, userId: string) {
  const { error: tombstoneError } = await db.rpc('begin_account_deletion', { p_user_id: userId });
  if (tombstoneError) throw new Error('Could not block deleted account');
  // Explicit deletes also cover tables whose historic schema has no user FK.
  for (const table of ['notification_deliveries', 'barcode_confirmations', 'push_subscriptions', 'shopping_list', 'notification_log', 'items']) {
    const { error } = await db.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`Could not clean ${table}`);
  }
  const { error: userError } = await db.from('users').delete().eq('id', userId);
  if (userError) throw new Error('Could not remove account record');
  async function removeFolder(prefix: string) {
    for (;;) {
      const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw new Error('Could not list account images');
      if (!data?.length) return;
      const files = data.filter((entry) => entry.id).map((entry) => `${prefix}/${entry.name}`);
      if (files.length) {
        const { error: removeError } = await db.storage.from(BUCKET).remove(files);
        if (removeError) throw new Error('Could not delete account images');
      }
      for (const folder of data.filter((entry) => !entry.id)) await removeFolder(`${prefix}/${folder.name}`);
    }
  }
  await removeFolder(userId);
  const { error } = await db.from('deleted_accounts').update({ cleaned_at: new Date().toISOString() }).eq('user_id', userId);
  if (error) throw new Error('Could not record completed cleanup');
}
