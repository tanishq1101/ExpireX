import { withImagePreviews } from "@/lib/storage";
import Link from "next/link";
import { Package, Clock, XCircle, Sparkles, PartyPopper, ScanLine } from "lucide-react";
import { createClient } from "@/services/supabase/server";
import { todayKolkata, addDays } from "@/lib/dates";
import { EXPIRING_WINDOW_DAYS, RECENT_WINDOW_DAYS } from "@/lib/status";
import { StatCard } from "@/components/stat-card";
import { ItemRow } from "@/components/item-row";
import { ScanHub } from "@/components/scan-hub";
import { EmptyState } from "@/components/ui/empty-state";
import type { Item } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ attention?: string }> }) {
  const params = await searchParams;
  const attention = ["today", "week", "expired"].includes(params.attention ?? "") ? params.attention! : "week";
  const supabase = await createClient();
  const today = todayKolkata();
  const soon = addDays(today, EXPIRING_WINDOW_DAYS);
  let urgentQuery = supabase.from("items").select("*", { count: "exact" });
  urgentQuery = attention === "expired" ? urgentQuery.lt("effective_expiry", today) : urgentQuery.gte("effective_expiry", today).lte("effective_expiry", attention === "today" ? today : addDays(today, 7));
  const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000).toISOString();

  const countQuery = () => supabase.from("items").select("*", { count: "exact", head: true });

  const [total, expired, expiring, recent, upcoming] = await Promise.all([
    countQuery(),
    countQuery().lt("effective_expiry", today),
    countQuery().gte("effective_expiry", today).lte("effective_expiry", soon),
    countQuery().gte("created_at", recentSince),
    urgentQuery.order("effective_expiry", { ascending: true }).order("id").limit(8),
  ]);

  const upcomingItems = await withImagePreviews(supabase, (upcoming.data ?? []) as Item[]);
  const loadError = [total, expired, expiring, recent, upcoming].some((result) => result.error);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Your inventory</h1>
      {/* Inventory overview */}
      {loadError ? (
        <div role="alert" className="glass space-y-2 p-5 text-sm">
          <p className="text-danger">Couldn’t load your inventory overview. Your items may still need attention.</p>
          <Link href="/dashboard" className="inline-flex min-h-10 items-center text-primary underline">Try again</Link>
        </div>
      ) : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total items" value={total.count ?? 0} icon={Package} />
        <StatCard
          label="Expiring soon"
          value={expiring.count ?? 0}
          tone="text-warning"
          icon={Clock}
          iconTone="text-warning bg-warning/10"
        />
        <StatCard
          label="Expired"
          value={expired.count ?? 0}
          tone="text-danger"
          icon={XCircle}
          iconTone="text-danger bg-danger/10"
        />
        <StatCard
          label="Added this week"
          value={recent.count ?? 0}
          tone="text-accent"
          icon={Sparkles}
          iconTone="text-accent bg-accent/10"
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">Needs attention</h2>
          <Link href={`/items?status=${attention}`} className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        <nav aria-label="Urgent inventory" className="flex flex-wrap gap-2 text-sm">{[["today", "Today"], ["week", "Next 7 days"], ["expired", "Overdue"]].map(([value, label]) => <Link key={value} aria-current={attention === value ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-xl border border-border px-3 ${attention === value ? "bg-primary/15 text-primary" : "text-muted"}`} href={`/dashboard?attention=${value}`}>{label}</Link>)}</nav>
        <p className="text-xs text-muted">{upcoming.count ?? 0} items · showing up to 8. Open an item to edit its date or add another batch.</p>
        {upcomingItems.length === 0 ? (
          <EmptyState
            icon={PartyPopper}
            title="No items in this view"
            description="Check the other views for today’s dates and overdue items."
          />
        ) : (
          <ul className="space-y-2">
            {upcomingItems.map((item) => (
              <ItemRow key={item.id} item={item} today={today} />
            ))}
          </ul>
        )}
      </section>
      </>}
      {/* Entry follows urgent inventory actions for returning users. */}
      <section className="glass p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_0_24px_-6px] shadow-primary/60">
            <ScanLine className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight">Add to your inventory</h2>
            <p className="text-sm text-muted">Snap a barcode or label — we’ll do the rest.</p>
          </div>
        </div>
        <ScanHub />
      </section>


    </div>
  );
}
