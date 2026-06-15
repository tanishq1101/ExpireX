import Link from "next/link";
import { APP_NAME } from "@/lib/site";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
  { href: "/login", label: "Sign in" },
];

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-3xl px-4 sm:px-6">
      <div className="flex flex-col items-center justify-between gap-4 border-t border-border py-8 text-sm text-muted sm:flex-row">
        <span className="inline-flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent text-xs font-black text-primary-foreground">
            X
          </span>
          {APP_NAME} · © {new Date().getFullYear()}
        </span>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
