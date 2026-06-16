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

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = todayKolkata();
  const soon = addDays(today, EXPIRING_WINDOW_DAYS);
  const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000).toISOString();

  const countQuery = () => supabase.from("items").select("*", { count: "exact", head: true });

  const [total, expired, expiring, recent, upcoming] = await Promise.all([
    countQuery(),
    countQuery().lt("effective_expiry", today),
    countQuery().gte("effective_expiry", today).lte("effective_expiry", soon),
    countQuery().gte("created_at", recentSince),
    supabase
      .from("items")
      .select("*")
      .gte("effective_expiry", today)
      .lte("effective_expiry", soon)
      .order("effective_expiry", { ascending: true })
      .limit(5),
  ]);

  const upcomingItems = (upcoming.data ?? []) as Item[];

  return (
    <div className="space-y-6">
      {/* Scan-first hero — the primary action the moment you land here */}
      <section className="glass p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_0_24px_-6px] shadow-primary/60">
            <ScanLine className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Add to your inventory</h1>
            <p className="text-sm text-muted">Snap a barcode or label — we’ll do the rest.</p>
          </div>
        </div>
        <ScanHub />
      </section>

      {/* Inventory overview */}
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
          <h2 className="text-sm font-semibold text-muted">Expiring within {EXPIRING_WINDOW_DAYS} days</h2>
          <Link href="/items?status=expiring" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        {upcomingItems.length === 0 ? (
          <EmptyState
            icon={PartyPopper}
            title="Nothing expiring soon"
            description="You're all caught up. New items you add will show here as they approach expiry."
          />
        ) : (
          <ul className="space-y-2">
            {upcomingItems.map((item) => (
              <ItemRow key={item.id} item={item} today={today} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
