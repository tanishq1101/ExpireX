'use client';
import { Button } from '@/components/ui/button';
export default function AppError({ reset }: { reset: () => void }) {
  return <div role="alert" className="glass space-y-3 p-5"><h1 className="font-semibold">Couldn’t load this page</h1><p className="text-sm text-muted">Your data may still be available. Try again in a moment.</p><Button onClick={reset}>Try again</Button></div>;
}
