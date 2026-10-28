import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/services/supabase/admin";
import type { Metadata } from "next";
export const metadata: Metadata = { robots: { index: false, follow: false } };

import { AppNav } from "@/components/app-nav";
import { sendWelcomeEmail } from "@/lib/email";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const user = await currentUser();
  const primary = user?.primaryEmailAddress;
  const email = primary?.verification?.status === "verified" ? primary.emailAddress : undefined;
  let syncFailed = false;
  if (user) {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("sync_account", { p_user_id: userId, p_email: email ?? "", p_updated_at: user.updatedAt });
    syncFailed = !!error || data !== true;
    if (!syncFailed && email) {
      // Await completion: serverless runtimes can stop unawaited network work.
      try { await sendWelcomeEmail(userId, email, user?.firstName ?? undefined); }
      catch { console.error("Welcome email delivery failed; inspect notification_deliveries."); }
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-28 pt-6 sm:pb-10">
      <AppNav email={email ?? ""} />
      <main className="flex-1">{(syncFailed || !email) && <p role="alert" className="mb-4 rounded-xl border border-danger/40 p-3 text-sm text-danger">{syncFailed ? "Account sync failed. Reload before adding items; email reminders may be unavailable." : "Verify your primary email address in your account to receive reminders."}</p>}{children}</main>
    </div>
  );
}
