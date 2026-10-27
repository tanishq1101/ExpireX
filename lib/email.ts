import "server-only";
import { SITE_URL } from "./site";

const RESEND_API = "https://api.resend.com/emails";

function resendKey() {
  return process.env.RESEND_API_KEY ?? "";
}

function from() {
  return process.env.RESEND_FROM ?? "Expire X <onboarding@resend.dev>";
}

async function send(payload: {
  to: string;
  subject: string;
  html: string;
}) {
  const key = resendKey();
  if (!key) return; // silently skip if not configured
  await fetch(RESEND_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: from(), ...payload }),
  });
}

export async function sendWelcomeEmail(to: string, firstName?: string) {
  const name = firstName?.trim() || "there";
  await send({
    to,
    subject: "Welcome to Expire X 👋",
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:32px 24px;background:#f9fafb;border-radius:12px">
  <div style="text-align:center;margin-bottom:28px">
    <span style="display:inline-block;background:linear-gradient(135deg,#2563EB,#7C3AED);color:#fff;font-size:22px;font-weight:900;padding:10px 18px;border-radius:10px;letter-spacing:-0.5px">
      Expire <span style="opacity:.85">X</span>
    </span>
  </div>
  <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 12px">Hey ${name}, welcome aboard!</h1>
  <p style="color:#374151;line-height:1.6;margin:0 0 16px">
    Thanks for joining <strong>Expire X</strong> — your smart expiry tracker for groceries, medicines, documents, subscriptions, and more.
  </p>
  <p style="color:#374151;line-height:1.6;margin:0 0 24px">
    Here's what you can do right now:
  </p>
  <ul style="color:#374151;line-height:1.8;padding-left:20px;margin:0 0 28px">
    <li>📦 Add items by scanning a barcode or receipt</li>
    <li>📅 Get email reminders at 30, 15, 7, 3, and 1 days before expiry</li>
    <li>🛒 Auto-generate a shopping list for soon-to-expire items</li>
  </ul>
  <a href="${SITE_URL}/dashboard"
     style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">
    Open Expire X →
  </a>
  <p style="color:#9CA3AF;font-size:12px;margin-top:32px;line-height:1.5">
    You're receiving this because you created an account on Expire X.<br>
    © 2026 Expire X
  </p>
</div>`,
  });
}
