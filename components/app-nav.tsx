"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { LayoutDashboard, Package, Plus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SettingsDrawer } from "@/components/settings-drawer";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/items", label: "Items", icon: Package },
  { href: "/shopping", label: "Shopping", icon: ShoppingCart },
];

export function AppNav({ email }: { email: string }) {
  const pathname = usePathname();
  const { signOut } = useClerk();

  function handleSignOut() {
    signOut({ redirectUrl: "/" });
  }

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SettingsDrawer variant="app" onSignOut={handleSignOut} />
          <Link href="/dashboard" className="text-lg font-bold tracking-tight">
            Expire <span className="text-primary">X</span>
          </Link>
        </div>
        <span className="text-xs text-muted">{email}</span>
      </header>

      {/* Desktop top nav */}
      <nav className="mb-6 hidden gap-1 sm:flex">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                active ? "bg-primary/15 text-primary" : "text-muted hover:bg-surface/[0.06]"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
        <Link href="/items/new" className="ml-auto">
          <Button size="sm">
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </Link>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="glass fixed inset-x-0 bottom-0 z-20 flex items-center justify-around rounded-none rounded-t-2xl py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:hidden">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 text-[11px]",
                active ? "text-primary" : "text-muted"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        <Link
          href="/items/new"
          className="flex flex-col items-center gap-0.5 px-3 text-[11px] text-primary"
        >
          <Plus className="h-5 w-5" />
          Add
        </Link>
      </nav>
    </>
  );
}
