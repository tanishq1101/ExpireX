import "server-only";
import { unstable_cache } from "next/cache";
import { accountTag } from "@/lib/account-cache";
import { createClerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/services/supabase/admin";
import { sendWelcomeEmail } from "@/lib/email";

export type AccountState = { email: string; synced: boolean };

// `clerkClient()` reads request headers, which Next forbids inside a cached function (every sync
// failed that way); a backend client built from the secret key needs no request context.
let backend: ReturnType<typeof createClerkClient> | null = null;
const clerk = () => (backend ??= createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }));

async function syncAccount(userId: string): Promise<AccountState> {
  const user = await clerk().users.getUser(userId);
  const primary = user.primaryEmailAddress;
  const email = primary?.verification?.status === "verified" ? primary.emailAddress : "";
  const { data, error } = await createAdminClient().rpc("sync_account", {
    p_user_id: userId,
    p_email: email,
    p_updated_at: user.updatedAt,
  });
  // Throwing keeps a failed sync out of the cache, so the next page load tries again.
  if (error || data !== true) throw new Error(`Account sync failed: ${error?.message ?? `returned ${String(data)}`}`);
  if (email) {
    // Deduplicated by the delivery key, so a repeat after cache expiry never sends twice.
    try { await sendWelcomeEmail(userId, email, user.firstName ?? undefined); }
    catch { console.error("Welcome email delivery failed; inspect notification_deliveries."); }
  }
  return { email, synced: true };
}

/**
 * Account sync used to run on every page view (a Clerk API call plus two database round trips
 * before anything rendered). Profile changes already arrive through the Clerk webhook, so the
 * result is cached per user and refreshed every few hours or when the webhook clears the tag.
 */
export async function getAccount(userId: string): Promise<AccountState> {
  try {
    return await unstable_cache(() => syncAccount(userId), ["account-sync-v1", userId], {
      revalidate: 6 * 60 * 60,
      tags: [accountTag(userId)],
    })();
  } catch (err) {
    console.error("[account] sync failed for", userId, err instanceof Error ? err.message : err);
    return { email: "", synced: false };
  }
}
