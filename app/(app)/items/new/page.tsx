import { ScanHub } from '@/components/scan-hub';
import { DeferredItemForm as ItemForm } from '@/components/deferred-item-form';
import { createClient } from '@/services/supabase/server';
import { anotherBatch } from '@/lib/batch';
import { notFound } from 'next/navigation';
import type { Item } from '@/types/database';

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const { batch } = await searchParams;
  let initial;
  if (batch) {
    if (!/^[0-9a-f-]{36}$/i.test(batch)) notFound();
    const db = await createClient();
    const { data, error } = await db.from('items').select('*').eq('id', batch).maybeSingle();
    if (error) throw new Error('Could not load the original item.');
    if (!data) notFound();
    initial = anotherBatch(data as Item);
  }
  return <div className="space-y-5"><div><h1 className="text-xl font-semibold">{initial ? 'Add another batch' : 'Add item'}</h1><p className="text-sm text-muted">{initial ? 'Enter the expiry printed on this batch. Previous dates have been cleared.' : 'Scan a barcode, a label, a receipt — or type it in.'}</p></div><div className="glass p-5">{initial ? <ItemForm mode="create" initial={initial} /> : <ScanHub />}</div></div>;
}
