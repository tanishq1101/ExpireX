// Portable between Deno Edge Functions and the Next.js Node runtime.
import type { SupabaseClient } from '@supabase/supabase-js';

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Keyset pagination: do not treat a server-imposed short page as end-of-data. */
export async function* pages<T extends { id: string }>(query: (after?: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  let after: string | undefined;
  for (;;) {
    const { data, error } = await query(after);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    if (!rows.length) return;
    const next = rows.at(-1)!.id;
    if (next === after) throw new Error('Pagination did not advance');
    yield rows;
    after = next;
  }
}

export function reminderStage(today: string, expiry: string) {
  const days = Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (days > 30 || days < -7 || !Number.isFinite(days)) return null;
  return days < 0 ? 'overdue' : days === 0 ? 'd0' : days <= 1 ? 'd1' : days <= 3 ? 'd3' : days <= 7 ? 'd7' : days <= 15 ? 'd15' : 'd30';
}

export type Delivery = {
  key: string; user_id: string; item_id: string | null; channel: 'email' | 'push';
  payload: Record<string, unknown>; lease_token: string;
};

/** A claim freezes the payload so provider retries use identical content. */
export async function deliver(db: SupabaseClient, job: Omit<Delivery, 'lease_token'>, send: (job: Delivery) => Promise<void>) {
  const { data, error } = await db.rpc('claim_delivery', {
    p_key: job.key, p_user_id: job.user_id, p_item_id: job.item_id, p_channel: job.channel, p_payload: job.payload,
  });
  if (error) throw new Error(error.message);
  if (!data) return false;
  const claimed = data as Delivery;
  try {
    await send(claimed);
  } catch (error) {
    // Push has no provider idempotency guarantee. Ambiguous push failures need review.
    const status = job.channel === 'push' ? 'uncertain' : 'failed';
    const { error: updateError } = await db.from('notification_deliveries').update({ status, last_error: error instanceof Error ? error.message.slice(0, 300) : 'Delivery failed', lease_until: null })
      .eq('key', job.key).eq('lease_token', claimed.lease_token).eq('status', 'sending');
    if (updateError) throw new Error(updateError.message);
    throw error;
  }
  const { error: finishError } = await db.from('notification_deliveries').update({ status: 'sent', sent_at: new Date().toISOString(), lease_until: null, last_error: null })
    .eq('key', job.key).eq('lease_token', claimed.lease_token).eq('status', 'sending');
  if (finishError) throw new Error(finishError.message);
  return true;
}

export async function sendEmail(job: Delivery, apiKey: string, from: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': job.key },
    body: JSON.stringify({ from, ...job.payload }), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Email provider rejected delivery (${response.status})`);
}
