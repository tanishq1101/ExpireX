// Supabase Edge Function (Deno). Invoked daily by pg_cron via pg_net.
// Uses the service-role key (bypasses RLS) — this is the one sanctioned RLS bypass.
// Idempotent: dedup against notification_log; log row written ONLY after a confirmed send.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const REMINDER_OFFSETS: { days: number; type: string }[] = [
  { days: 30, type: "d30" },
  { days: 15, type: "d15" },
  { days: 7, type: "d7" },
  { days: 3, type: "d3" },
  { days: 1, type: "d1" },
];

// Calendar date in Asia/Kolkata as YYYY-MM-DD.
function todayKolkata(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function sendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  itemName: string;
  expiry: string;
  daysLeft: number;
}) {
  const when =
    opts.daysLeft === 1 ? "tomorrow" : opts.daysLeft === 0 ? "today" : `in ${opts.daysLeft} days`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: `⏳ "${opts.itemName}" expires ${when}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1D4ED8">Expire X reminder</h2>
        <p><strong>${opts.itemName}</strong> expires <strong>${when}</strong> (${opts.expiry}).</p>
        <p style="color:#666;font-size:13px">Open Expire X to review or update this item.</p>
      </div>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  // SUPABASE_URL + SERVICE_ROLE_KEY are auto-injected into every function.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Config is stored in the RLS-locked public.app_config table (service-role only),
  // with Deno.env taking precedence if real function secrets are ever set.
  const { data: cfgRows } = await supabase.from("app_config").select("key, value");
  const cfg = new Map((cfgRows ?? []).map((r) => [r.key as string, r.value as string]));
  const conf = (k: string, env: string) => Deno.env.get(env) ?? cfg.get(k);

  // Shared-secret gate so the function endpoint can't be triggered by anyone.
  const secret = conf("cron_secret", "CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  const resendKey = conf("resend_api_key", "RESEND_API_KEY")!;
  const from = conf("resend_from", "RESEND_FROM") ?? "Expire X <onboarding@resend.dev>";

  const today = todayKolkata();
  const dueByDate = new Map<string, string>(); // expiry_date -> reminder_type
  for (const o of REMINDER_OFFSETS) dueByDate.set(addDays(today, o.days), o.type);
  const dueDates = [...dueByDate.keys()];

  // Items expiring on exactly one of the reminder offset dates, with the owner's email.
  const { data: items, error } = await supabase
    .from("items")
    .select("id, name, expiry_date, user_id, users(email)")
    .in("expiry_date", dueDates);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Pre-fetch existing logs to dedup without N queries.
  const ids = (items ?? []).map((i) => i.id);
  const sent = new Set<string>();
  if (ids.length) {
    const { data: logs } = await supabase
      .from("notification_log")
      .select("item_id, reminder_type")
      .in("item_id", ids);
    for (const l of logs ?? []) sent.add(`${l.item_id}:${l.reminder_type}`);
  }

  let sentCount = 0;
  const errors: string[] = [];

  for (const item of items ?? []) {
    const type = dueByDate.get(item.expiry_date as string)!;
    if (sent.has(`${item.id}:${type}`)) continue;

    // deno-lint-ignore no-explicit-any
    const email = (item as any).users?.email as string | undefined;
    if (!email) continue;

    const daysLeft = REMINDER_OFFSETS.find((o) => o.type === type)!.days;
    try {
      await sendEmail({
        apiKey: resendKey,
        from,
        to: email,
        itemName: item.name as string,
        expiry: item.expiry_date as string,
        daysLeft,
      });
      // Write log only after a confirmed send. Unique(item_id,reminder_type) blocks dupes.
      const { error: logErr } = await supabase.from("notification_log").insert({
        item_id: item.id,
        user_id: item.user_id,
        reminder_type: type,
      });
      if (logErr && !logErr.message.includes("duplicate")) errors.push(logErr.message);
      sentCount++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return new Response(
    JSON.stringify({ today, candidates: items?.length ?? 0, sent: sentCount, errors }),
    { headers: { "Content-Type": "application/json" } }
  );
});
