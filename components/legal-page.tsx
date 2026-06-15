import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
import { APP_NAME, LEGAL_LAST_UPDATED } from "@/lib/site";

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to {APP_NAME}
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-xs text-muted">Last updated: {LEGAL_LAST_UPDATED}</p>
        {intro && <p className="mt-4 text-sm leading-relaxed text-muted">{intro}</p>}
        <div className="prose mt-6">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}
