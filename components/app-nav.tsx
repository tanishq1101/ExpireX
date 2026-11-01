"use client";
import { detachPush } from "@/lib/use-push";
import { toast } from "sonner";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { LayoutDashboard, Package, Plus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsDrawer } from "@/components/settings-drawer";

const links = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/items", label: "Items", icon: Package },
  { href: "/shopping", label: "Shopping", icon: ShoppingCart },
];

export function AppNav({ email }: { email: string }) {
  const pathname = usePathname();
  const { signOut } = useClerk();

  // /items/new belongs to "Add", not "Items", so only one tab is ever highlighted.
  const adding = pathname === "/items/new";
  const isActive = (href: string) =>
    href === "/items" ? pathname.startsWith("/items") && !adding : pathname.startsWith(href);

  async function handleSignOut() {
    try { await detachPush(); await signOut({ redirectUrl: "/" }); }
    catch { toast.error("Could not detach this device. Retry signing out."); }
  }

  return (
    <>
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <SettingsDrawer variant="app" onSignOut={handleSignOut} />
          <Link href="/dashboard" className="inline-flex min-h-11 items-center truncate text-lg font-bold tracking-tight">
            Expire <span className="text-primary">X</span>
          </Link>
        </div>
        {/* The address is in the menu on phones; here it only crowds the header. */}
        <span className="hidden min-w-0 max-w-[16rem] truncate text-xs text-muted sm:block">{email}</span>
      </header>

      {/* Desktop top nav */}
      <nav aria-label="Main" className="mb-6 hidden gap-1 sm:flex">
        {links.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm transition",
                active ? "bg-primary/15 text-primary" : "text-muted hover:bg-surface/[0.06]"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
        <Link
          href="/items/new"
          aria-current={adding ? "page" : undefined}
          className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add item
        </Link>
      </nav>

      {/* Mobile bottom tab bar: opaque so list content never shows through the labels. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur-md sm:hidden"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {links.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition active:scale-95",
                  active ? "bg-primary/10 text-primary" : "text-muted"
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
          <Link
            href="/items/new"
            aria-current={adding ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-primary text-[11px] font-semibold text-primary-foreground shadow-[0_6px_18px_-8px] shadow-primary/70 transition active:scale-95",
              adding && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
            )}
          >
            <Plus className="h-5 w-5" />
            Add
          </Link>
        </div>
      </nav>
    </>
  );
}
