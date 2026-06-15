import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail, ShieldCheck, FileText } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
import { ContactForm } from "@/components/contact-form";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: `Contact — ${APP_NAME}`,
  description: `Get in touch with the ${APP_NAME} team.`,
};

export default function ContactPage() {
  return (
    <div className="relative min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to {APP_NAME}
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Contact us</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Have a question, found a bug, or want to suggest a feature? We&apos;d love to hear from you.
          Send a message below or email us directly — we read everything.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <ContactForm />

          <aside className="space-y-3">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="glass flex items-center gap-3 p-4 transition hover:border-primary/40"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <Mail className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-medium">Email</span>
                <span className="block text-xs text-muted">{CONTACT_EMAIL}</span>
              </span>
            </a>
            <Link
              href="/privacy"
              className="glass flex items-center gap-3 p-4 transition hover:border-primary/40"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-medium">Privacy Policy</span>
                <span className="block text-xs text-muted">How we handle your data</span>
              </span>
            </Link>
            <Link
              href="/terms"
              className="glass flex items-center gap-3 p-4 transition hover:border-primary/40"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <FileText className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-medium">Terms &amp; Conditions</span>
                <span className="block text-xs text-muted">The rules of the road</span>
              </span>
            </Link>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
