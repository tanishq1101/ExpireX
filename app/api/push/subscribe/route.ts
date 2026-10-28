import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@/services/supabase/server';
import { readJson } from '@/lib/request-body';
import { endpointSchema, subscriptionSchema } from '@/lib/push-subscription';
import { pages } from '@/supabase/functions/_shared/delivery';
export const runtime = 'nodejs';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await createClient();
  const endpoints: string[] = [];
  try {
    for await (const batch of pages<{ id: string; endpoint: string }>((after) => {
      let q = db.from('push_subscriptions').select('id,endpoint').eq('user_id', userId).order('id').limit(100);
      if (after) q = q.gt('id', after);
      return q;
    })) endpoints.push(...batch.map((s) => s.endpoint));
    return NextResponse.json({ endpoints }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Could not load notification settings.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await readJson(request, 8192); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (!await rateLimit(`push-subscribe:${userId}`, 30, 60000)) return NextResponse.json({ error: 'Please retry later.' }, { status: 429 });
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 });
  const db = await createClient();
  const { error } = await db.from('push_subscriptions').upsert({ user_id: userId, ...parsed.data }, { onConflict: 'endpoint' });
  if (error) return NextResponse.json({ error: 'Could not save this device. Turn notifications off and retry.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let endpoint: unknown;
  try { endpoint = (await readJson(request, 8192) as { endpoint?: unknown })?.endpoint; } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
  const db = await createClient();
  const { error } = await db.from('push_subscriptions').delete().eq('endpoint', parsed.data).eq('user_id', userId);
  if (error) return NextResponse.json({ error: 'Could not remove this subscription.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
