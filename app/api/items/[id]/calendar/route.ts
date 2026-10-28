import { auth } from '@clerk/nextjs/server';
import { createClient } from '@/services/supabase/server';
import { itemCalendar } from '@/lib/calendar';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 });
  const db = await createClient();
  const { data, error } = await db.from('items').select('id,name,category,effective_expiry,updated_at,expiry_revision').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not export this reminder.' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  if (!['documents', 'warranty', 'subscription'].includes(data.category)) return NextResponse.json({ error: 'Calendar export supports documents, warranties and subscriptions.' }, { status: 400 });
  return new Response(itemCalendar(data), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="expirex-reminder.ics"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
