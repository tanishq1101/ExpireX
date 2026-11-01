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

// "urgent" = overdue + the next 7 days, so an expired item can never hide behind a quiet default view.
const VIEWS = [
  ["urgent", "All"],
  ["today", "Today"],
  ["expired", "Overdue"],
] as const;
type View = (typeof VIEWS)[number][0];

const EMPTY_COPY: Record<View, { title: string; description: string }> = {
  urgent: { title: "Nothing needs attention", description: "Nothing is overdue or expires in the next 7 days." },
  today: { title: "Nothing expires today", description: "Check “All” to see what’s coming up this week." },
  expired: { title: "Nothing is overdue", description: "You have no expired items. Nice." },
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ attention?: string }> }) {
  const params = await searchParams;
  // "week" is the old name for the default view; keep old links and bookmarks working.
  const attention: View = params.attention === "today" || params.attention === "expired" ? params.attention : "urgent";
  const supabase = await createClient();
  const today = todayKolkata();
  const soon = addDays(today, EXPIRING_WINDOW_DAYS);
  let urgentQuery = supabase.from("items").select("*", { count: "exact" });
  urgentQuery =
    attention === "expired"
      ? urgentQuery.lt("effective_expiry", today)
      : attention === "today"
        ? urgentQuery.eq("effective_expiry", today)
        : urgentQuery.lte("effective_expiry", addDays(today, 7));
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

  // First visit: lead with adding an item instead of four zero counts and an empty list.
  if (!loadError && (total.count ?? 0) === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Welcome to Expire X</h1>
          <p className="mt-1 text-sm text-muted">
            Add your first item — it takes about 10 seconds. We’ll remind you before it expires.
          </p>
        </div>
        <section className="glass p-4 sm:p-6" aria-label="Add your first item">
          <ScanHub />
        </section>
      </div>
    );
  }

  const shown = upcomingItems.length;
  const matching = upcoming.count ?? 0;
  const empty = EMPTY_COPY[attention];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Your inventory</h1>
      {loadError ? (
        <div role="alert" className="glass space-y-2 p-5 text-sm">
          <p className="text-danger">Couldn’t load your inventory overview. Your items may still need attention.</p>
          <Link href="/dashboard" className="inline-flex min-h-11 items-center text-primary underline">Try again</Link>
        </div>
      ) : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total items" value={total.count ?? 0} icon={Package} href="/items" />
        <StatCard
          label="Expiring soon"
          value={expiring.count ?? 0}
          tone="text-warning"
          icon={Clock}
          iconTone="text-warning bg-warning/10"
          href="/items?status=expiring"
        />
        <StatCard
          label="Expired"
          value={expired.count ?? 0}
          tone="text-danger"
          icon={XCircle}
          iconTone="text-danger bg-danger/10"
          href="/items?status=expired"
        />
        <StatCard
          label="Added this week"
          value={recent.count ?? 0}
          tone="text-accent"
          icon={Sparkles}
          iconTone="text-accent bg-accent/10"
          href="/items?sort=newest"
        />
      </div>

      <section className="space-y-3" aria-labelledby="attention-heading">
        <div className="flex items-center justify-between">
          <h2 id="attention-heading" className="text-sm font-semibold text-muted">Needs attention</h2>
          <Link href={`/items?status=${attention}`} className="inline-flex min-h-11 items-center px-1 text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        <nav aria-label="Urgent inventory" className="flex flex-wrap gap-2 text-sm">
          {VIEWS.map(([value, label]) => (
            <Link
              key={value}
              aria-current={attention === value ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-xl border border-border px-4 ${attention === value ? "bg-primary/15 font-medium text-primary" : "text-muted"}`}
              href={`/dashboard?attention=${value}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        {shown === 0 ? (
          <EmptyState icon={PartyPopper} title={empty.title} description={empty.description} />
        ) : (
          <>
            <ul className="space-y-2">
              {upcomingItems.map((item) => (
                <ItemRow key={item.id} item={item} today={today} />
              ))}
            </ul>
            {matching > shown && (
              <p className="text-center text-xs text-muted">Showing the {shown} soonest of {matching}.</p>
            )}
          </>
        )}
      </section>
      </>}

      <section className="glass p-4 sm:p-6" aria-labelledby="add-heading">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_0_24px_-6px] shadow-primary/60">
            <ScanLine className="h-5 w-5" />
          </span>
          <div>
            <h2 id="add-heading" className="text-lg font-semibold leading-tight">Add an item</h2>
            <p className="text-sm text-muted">Scan a barcode or label, or type it in.</p>
          </div>
        </div>
        <ScanHub />
      </section>
    </div>
  );
}
