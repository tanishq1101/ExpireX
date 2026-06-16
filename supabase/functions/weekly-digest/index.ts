// Supabase Edge Function (Deno). Invoked weekly by pg_cron via pg_net.
// Sends each user one digest: what's expiring this week + a short insight summary.
// Uses the service-role key (the one sanctioned RLS bypass). Cron-secret gated.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_URL = "https://expire-x-three.vercel.app";

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
function daysBetween(base: string, target: string): number {
  return Math.round(
    (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / 86_400_000
  );
}

type Row = {
  id: string;
  name: string;
  expiry_date: string;
  created_at: string;
  user_id: string;
  users?: { email?: string } | null;
};

function digestHtml(opts: {
  total: number;
  expiringThisWeek: Row[];
  expiredCount: number;
  recentCount: number;
  today: string;
}) {
  const { total, expiringThisWeek, expiredCount, recentCount } = opts;
  const rows = expiringThisWeek
    .map((it) => {
      const d = daysBetween(opts.today, it.expiry_date);
      const when = d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb">${it.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#1D4ED8;font-weight:600">${when}</td>
      </tr>`;
    })
    .join("");

  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:auto;color:#0f172a">
    <h2 style="color:#1D4ED8;margin:0 0 4px">Your weekly Expire X digest</h2>
    <p style="color:#64748b;margin:0 0 16px;font-size:14px">Here's what needs your attention this week.</p>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px;margin-bottom:16px;font-size:14px">
      <strong>${total}</strong> item${total === 1 ? "" : "s"} tracked ·
      <strong>${expiringThisWeek.length}</strong> expiring this week ·
      <strong>${expiredCount}</strong> expired ·
      <strong>${recentCount}</strong> added this week
    </div>

    ${
      expiringThisWeek.length
        ? `<h3 style="font-size:15px;margin:0 0 6px">Expiring within 7 days</h3>
           <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`
        : `<p style="font-size:14px">Nothing expires in the next 7 days — nice work. 🎉</p>`
    }

    ${
      expiredCount
        ? `<p style="font-size:14px;color:#b91c1c;margin-top:14px">${expiredCount} item${
            expiredCount === 1 ? " has" : "s have"
          } already expired — review and restock what you need.</p>`
        : ""
    }

    <a href="${APP_URL}/dashboard" style="display:inline-block;margin-top:18px;background:#1D4ED8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Open Expire X</a>

    <p style="color:#94a3b8;font-size:12px;margin-top:20px">You receive this weekly summary because you track items on Expire X.</p>
  </div>`;
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: cfgRows } = await supabase.from("app_config").select("key, value");
  const cfg = new Map((cfgRows ?? []).map((r) => [r.key as string, r.value as string]));
  const conf = (k: string, env: string) => Deno.env.get(env) ?? cfg.get(k);

  const secret = conf("cron_secret", "CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  const resendKey = conf("resend_api_key", "RESEND_API_KEY")!;
  const from = conf("resend_from", "RESEND_FROM") ?? "Expire X <onboarding@resend.dev>";

  const today = todayKolkata();
  const in7 = addDays(today, 7);
  const in30 = addDays(today, 30);
  const recentSince = new Date(Date.now() - 7 * 86_400_000).toISOString();

  // All items with the owner's email; grouped per user in memory.
  const { data: items, error } = await supabase
    .from("items")
    .select("id, name, expiry_date, created_at, user_id, users(email)")
    .order("expiry_date", { ascending: true });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const byUser = new Map<string, Row[]>();
  for (const it of (items ?? []) as Row[]) {
    const list = byUser.get(it.user_id) ?? [];
    list.push(it);
    byUser.set(it.user_id, list);
  }

  let sent = 0;
  const errors: string[] = [];

  for (const [, rows] of byUser) {
    const email = rows[0]?.users?.email;
    if (!email) continue;

    const expiringThisWeek = rows.filter((r) => r.expiry_date >= today && r.expiry_date <= in7);
    const expiringSoon = rows.filter((r) => r.expiry_date >= today && r.expiry_date <= in30);
    const expiredCount = rows.filter((r) => r.expiry_date < today).length;
    const recentCount = rows.filter((r) => r.created_at >= recentSince).length;

    // Only email when there's something actionable, to avoid noise.
    if (expiringSoon.length === 0 && expiredCount === 0) continue;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: email,
          subject: "🗓️ Your weekly Expire X digest",
          html: digestHtml({
            total: rows.length,
            expiringThisWeek,
            expiredCount,
            recentCount,
            today,
          }),
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      sent++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return new Response(JSON.stringify({ today, users: byUser.size, sent, errors }), {
    headers: { "Content-Type": "application/json" },
  });
});
