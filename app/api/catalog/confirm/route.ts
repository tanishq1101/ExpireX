import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createAdminClient } from '@/services/supabase/admin';
import { createClient } from '@/services/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { readJson } from '@/lib/request-body';
import { z } from 'zod';
export const runtime = 'nodejs';
const schema = z.object({ item_id: z.string().uuid() }).strict();

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await rateLimit(`catalog:${userId}`, 30, 60000)) return NextResponse.json({ error: 'Please try again later.' }, { status: 429 });
  let body: unknown;
  try { body = await readJson(request); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Provide a saved item ID.' }, { status: 400 });
  const db = await createClient();
  const { data: item, error } = await db.from('items').select('id,barcode').eq('id', parsed.data.item_id).eq('user_id', userId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not verify item.' }, { status: 503 });
  if (!item?.barcode) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  const { error: confirmError } = await createAdminClient().rpc('confirm_catalog_item', { p_barcode: item.barcode, p_user_id: userId });
  if (confirmError) return NextResponse.json({ error: 'Catalog confirmation failed.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
