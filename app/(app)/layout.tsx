import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createClient } from "@/services/supabase/server";
import { AppNav } from "@/components/app-nav";
import { sendWelcomeEmail } from "@/lib/email";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;

  // Keep public.users in sync with Clerk (the reminder cron needs the email).
  // RLS allows this because the Supabase client carries the Clerk token (id = sub).
  if (email) {
    const supabase = await createClient();

    // Check if this user already exists so we can detect first-time sign-up.
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    await supabase.from("users").upsert({ id: userId, email }, { onConflict: "id" });

    // Send a one-time welcome email to brand-new users (fire-and-forget).
    if (!existing) {
      const firstName = user?.firstName ?? undefined;
      sendWelcomeEmail(email, firstName).catch(() => {});
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-28 pt-6 sm:pb-10">
      <AppNav email={email ?? ""} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
