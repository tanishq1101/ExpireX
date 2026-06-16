import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/services/supabase/admin";
import { todayKolkata, addDays } from "@/lib/dates";
import { REMINDER_OFFSETS } from "@/lib/status";

export const runtime = "nodejs";
export const maxDuration = 60;

// Triggered daily by Vercel Cron (which sends `Authorization: Bearer <CRON_SECRET>`).
// Sends a web push for every item hitting a reminder offset, to that user's devices.
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

type DueItem = { id: string; name: string; user_id: string; effective_expiry: string };
type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string };

async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "VAPID keys not set" }, { status: 500 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:tks2005homes@gmail.com", pub, priv);

  const supabase = createAdminClient();
  const today = todayKolkata();

  // expiry-date -> days-left, for the reminder offsets.
  const daysByDate = new Map<string, number>();
  for (const o of REMINDER_OFFSETS) daysByDate.set(addDays(today, o.days), o.days);
  const dueDates = [...daysByDate.keys()];

  const { data: itemsData, error } = await supabase
    .from("items")
    .select("id, name, user_id, effective_expiry")
    .in("effective_expiry", dueDates);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = (itemsData ?? []) as DueItem[];
  if (items.length === 0) return NextResponse.json({ today, due: 0, sent: 0 });

  const userIds = [...new Set(items.map((i) => i.user_id))];
  const { data: subsData } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_id")
    .in("user_id", userIds);
  const subsByUser = new Map<string, Sub[]>();
  for (const s of (subsData ?? []) as Sub[]) {
    const list = subsByUser.get(s.user_id) ?? [];
    list.push(s);
    subsByUser.set(s.user_id, list);
  }

  let sent = 0;
  let removed = 0;
  for (const item of items) {
    const subs = subsByUser.get(item.user_id) ?? [];
    const days = daysByDate.get(item.effective_expiry) ?? 0;
    const when = days === 1 ? "tomorrow" : days === 0 ? "today" : `in ${days} days`;
    const payload = JSON.stringify({
      title: `⏳ ${item.name} expires ${when}`,
      body: "Open Expire X to review or restock it.",
      url: `/items/${item.id}`,
      tag: item.id,
    });
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          removed++;
        }
      }
    }
  }

  return NextResponse.json({ today, due: items.length, sent, removed });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
