import type { SupabaseClient } from '@supabase/supabase-js';
import { deliver, escapeHtml, pages, reminderStage, sendEmail } from './delivery.ts';

import { SITE_URL as APP_URL } from './site.ts';
type User = { id: string; email: string; email_reminders_enabled: boolean };
type Item = { id: string; name: string; user_id: string; effective_expiry: string; expiry_source: string; expiry_revision: number; created_at: string };
const dateAdd = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const when = (today: string, expiry: string) => {
  const d = Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return d < 0 ? 'has expired' : d === 0 ? 'expires today' : d === 1 ? 'expires tomorrow' : `expires in ${d} days`;
};

export async function runReminders(db: SupabaseClient, today: string, apiKey: string, from: string) {
  let sent = 0;
  const errors: string[] = [];
  for await (const batch of pages<Item>((after) => db.rpc('due_reminder_items', {
    p_today: today, p_channel: 'email', p_after: after ?? null, p_limit: 200,
  }))) {
    for (const item of batch) {
      try {
        const { data: user, error } = await db.from('users').select('email,email_reminders_enabled').eq('id', item.user_id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!user?.email || !user.email_reminders_enabled) continue;
        const stage = reminderStage(today, item.effective_expiry);
        if (!stage) continue;
        const message = when(today, item.effective_expiry);
        const estimated = item.expiry_source === 'estimated' ? 'Estimated date — confirm against the packaging.' : '';
        // Respect historical sends for the original revision during rollout.
        if (item.expiry_revision === 1 && /^d(30|15|7|3|1)$/.test(stage)) {
          const { data: old, error: logError } = await db.from('notification_log').select('id').eq('item_id', item.id).eq('reminder_type', stage).limit(1);
          if (logError) throw new Error(logError.message);
          if (old?.length) continue;
        }
        const didSend = await deliver(db, {
          key: `reminder/${item.id}/${item.expiry_revision}/${item.effective_expiry}/${stage}`,
          user_id: item.user_id, item_id: item.id, channel: 'email',
          payload: {
            from, to: user.email, subject: `${item.name} ${message}${estimated ? ' (estimated)' : ''}`,
            html: `<div><h2>Expire X reminder</h2><p><strong>${escapeHtml(item.name)}</strong> ${message} (${escapeHtml(item.effective_expiry)}).</p><p>${estimated}</p><a href="${APP_URL}/items/${item.id}">Review item</a></div>`,
          },
        }, (job) => sendEmail(job, apiKey, from));
        if (didSend) sent++;
      } catch (error) { errors.push(error instanceof Error ? error.message : 'Reminder failed'); }
    }
  }
  return { today, sent, errors };
}

export async function runDigest(db: SupabaseClient, today: string, apiKey: string, from: string) {
  let sent = 0;
  const errors: string[] = [];
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const week = dateAdd(today, -((day + 6) % 7));
  for await (const users of pages<User>((after) => db.rpc('due_digest_users', {
    p_today: today, p_week: week, p_after: after ?? null,
  }))) {
    for (const user of users) {
      try {
        let total = 0, expired = 0, weekCount = 0;
        const upcoming: Item[] = [];
        for await (const items of pages<Item>((after) => {
          let q = db.from('items').select('id,name,user_id,effective_expiry,expiry_source,expiry_revision,created_at').eq('user_id', user.id).order('id').limit(200);
          if (after) q = q.gt('id', after);
          return q;
        })) {
          for (const item of items) {
            total++;
            if (item.effective_expiry < today) expired++;
            else if (item.effective_expiry <= dateAdd(today, 7)) {
              weekCount++;
              upcoming.push(item);
              upcoming.sort((a, b) => a.effective_expiry.localeCompare(b.effective_expiry) || a.id.localeCompare(b.id));
              if (upcoming.length > 50) upcoming.pop();
            }
          }
        }
        if (!weekCount && !expired) continue;
        // Recheck consent immediately before claiming a send.
        const { data: current, error } = await db.from('users').select('email,email_reminders_enabled').eq('id', user.id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!current?.email || !current.email_reminders_enabled) continue;
        const html = `<div><h2>Your weekly Expire X digest</h2><p>${total} tracked · ${weekCount} expiring within 7 days · ${expired} expired</p><ul>${upcoming.map((it) => `<li>${escapeHtml(it.name)}: ${when(today, it.effective_expiry)}${it.expiry_source === 'estimated' ? ' (estimated)' : ''}</li>`).join('')}</ul>${weekCount > 50 ? '<p>Showing the earliest 50 items. Open your inventory for the rest.</p>' : ''}<a href="${APP_URL}/dashboard">Open Expire X</a><p>Manage email reminders in Settings.</p></div>`;
        if (await deliver(db, { key: `digest/${user.id}/${week}`, user_id: user.id, item_id: null, channel: 'email', payload: { from, to: current.email, subject: 'Your weekly Expire X digest', html } }, (job) => sendEmail(job, apiKey, from))) sent++;
      } catch (error) { errors.push(error instanceof Error ? error.message : 'Digest failed'); }
    }
  }
  return { today, sent, errors };
}
