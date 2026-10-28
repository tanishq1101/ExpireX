import { NextRequest } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { createAdminClient } from '@/services/supabase/admin';
import { cleanupAccount } from '@/lib/account-cleanup';
import { boundedBody } from '@/lib/request-body';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) return new Response('Webhook is not configured', { status: 503 });
  let event;
  try {
    const body = await boundedBody(request, 262144);
    event = await verifyWebhook(new NextRequest(request.url, { method: 'POST', headers: request.headers, body }));
  } catch { return new Response('Invalid webhook', { status: 400 }); }
  if (event.type === 'user.deleted' && event.data.id) {
    try { await cleanupAccount(createAdminClient(), event.data.id); }
    catch { return new Response('Cleanup incomplete. Retry this event.', { status: 503 }); }
  }
  if ((event.type === 'user.created' || event.type === 'user.updated') && event.data.id) {
    try {
      // Read current Clerk state so replayed/out-of-order webhook payloads cannot restore an old email.
      const user = await (await clerkClient()).users.getUser(event.data.id);
      const primary = user.primaryEmailAddress;
      const email = primary?.verification?.status === 'verified' ? primary.emailAddress : '';
      const { error } = await createAdminClient().rpc('sync_account', { p_user_id: user.id, p_email: email, p_updated_at: user.updatedAt });
      if (error) return new Response('Sync failed. Retry this event.', { status: 503 });
    } catch { return new Response('Sync unavailable. Retry this event.', { status: 503 }); }
  }
  return new Response('OK');
}
