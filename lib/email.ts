import 'server-only';
import { SITE_URL } from './site';
import { createAdminClient } from '@/services/supabase/admin';
import { deliver, escapeHtml, sendEmail } from '@/supabase/functions/_shared/delivery';

export async function sendWelcomeEmail(userId: string, to: string, firstName?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  await deliver(createAdminClient(), {
    key: `welcome/${userId}`, user_id: userId, item_id: null, channel: 'email',
    payload: {
      from: process.env.RESEND_FROM ?? 'Expire X <onboarding@resend.dev>', to, subject: 'Welcome to Expire X',
      html: `<div><h1>Welcome, ${escapeHtml(firstName?.trim() || 'there')}</h1><p>Track expiry dates, review upcoming items, and manage reminder preferences in Settings.</p><a href="${SITE_URL}/dashboard">Open Expire X</a></div>`,
    },
  }, (job) => sendEmail(job, key, process.env.RESEND_FROM ?? 'Expire X <onboarding@resend.dev>'));
}
