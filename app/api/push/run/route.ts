import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/services/supabase/admin';
import { todayKolkata } from '@/lib/dates';
import { isPushEndpoint } from '@/lib/push-subscription';
import { deliver, pages, reminderStage } from '@/supabase/functions/_shared/delivery';
export const runtime = 'nodejs';
export const maxDuration = 60;
const equal = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
type Item = { id: string; user_id: string; effective_expiry: string; expiry_revision: number };
type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !(equal(request.headers.get('authorization') ?? '', `Bearer ${secret}`) || equal(request.headers.get('x-cron-secret') ?? '', secret))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: 'Push is not configured' }, { status: 503 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:tks2005homes@gmail.com', pub, priv);
  const db = createAdminClient();
  const today = todayKolkata();
  let sent = 0;
  const errors: string[] = [];
  try {
    for await (const items of pages<Item>((after) => db.rpc('due_reminder_items', {
      p_today: today, p_channel: 'push', p_after: after ?? null, p_limit: 100,
    }))) {
      for (const item of items) {
        const stage = reminderStage(today, item.effective_expiry);
        if (!stage) continue;
        for await (const subs of pages<Sub>((after) => {
          let q = db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', item.user_id).order('id').limit(100);
          if (after) q = q.gt('id', after);
          return q;
        })) for (const sub of subs) {
          if (!isPushEndpoint(sub.endpoint)) { errors.push('Unsupported stored push endpoint'); continue; }
          try {
            if (await deliver(db, {
              key: `push/${item.id}/${item.expiry_revision}/${item.effective_expiry}/${stage}/${sub.id}`,
              user_id: item.user_id, item_id: item.id, channel: 'push',
              payload: { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, notification: { title: 'An item needs your attention', body: 'Open Expire X to review its expiry date.', url: `/items/${item.id}`, tag: item.id } },
            }, async (job) => {
              const p = job.payload;
              try { await webpush.sendNotification({ endpoint: String(p.endpoint), keys: { p256dh: String(p.p256dh), auth: String(p.auth) } }, JSON.stringify(p.notification), { timeout: 15000 }); }
              catch (error) {
                const code = (error as { statusCode?: number }).statusCode;
                if (code === 404 || code === 410) {
                  const { error: removeError } = await db.from('push_subscriptions').delete().eq('id', sub.id);
                  if (removeError) throw new Error('Could not remove revoked subscription');
                }
                throw error;
              }
            })) sent++;
          } catch { errors.push('A push delivery failed; inspect notification_deliveries before retrying.'); }
        }
      }
    }
  } catch { return NextResponse.json({ error: 'Could not finish push processing', sent, errors }, { status: 503 }); }
  return NextResponse.json({ today, sent, errors });
}
export const GET = handle;
export const POST = handle;
