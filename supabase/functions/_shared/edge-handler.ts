import type { SupabaseClient } from '@supabase/supabase-js';

export function edgeHandler(db: SupabaseClient, env: (key: string) => string | undefined, run: (db: SupabaseClient, today: string, key: string, from: string) => Promise<unknown>) {
  return async (request: Request) => {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    // Prefer function secrets; retain the existing service-only config fallback.
    const { data, error } = await db.from('app_config').select('key,value');
    if (error && !env('CRON_SECRET')) return new Response('Configuration unavailable', { status: 503 });
    const config = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
    const secret = env('CRON_SECRET') ?? config.get('cron_secret');
    if (!secret || request.headers.get('x-cron-secret') !== secret) return new Response('Forbidden', { status: 403 });
    const apiKey = env('RESEND_API_KEY') ?? config.get('resend_api_key');
    if (!apiKey) return new Response('Email is not configured', { status: 503 });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    try {
      const result = await run(db, today, apiKey, env('RESEND_FROM') ?? config.get('resend_from') ?? 'Expire X <onboarding@resend.dev>');
      const failed = (result as { errors?: unknown[] })?.errors?.length;
      return Response.json(result, { status: failed ? 503 : 200 });
    } catch {
      return Response.json({ error: 'Scheduled job failed; inspect delivery status and retry.' }, { status: 500 });
    }
  };
}
