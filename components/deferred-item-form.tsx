'use client';
import dynamic from 'next/dynamic';
export const DeferredItemForm = dynamic(() => import('./item-form').then((module) => module.ItemForm), {
  loading: () => <p role="status" className="py-6 text-center text-sm text-muted">Loading item entry…</p>,
});
