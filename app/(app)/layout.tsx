import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";
import { getAccount } from "@/lib/account";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const { email, synced } = await getAccount(userId);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:pb-10">
      <AppNav email={email} />
      <main className="flex-1">
        {(!synced || !email) && (
          <p role="alert" className="mb-4 rounded-xl border border-danger/40 p-3 text-sm text-danger">
            {!synced
              ? "Account sync failed. Reload before adding items; email reminders may be unavailable."
              : "Verify your primary email address in your account to receive reminders."}
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
