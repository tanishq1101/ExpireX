import Link from "next/link";
import {
  ScanLine,
  BellRing,
  LayoutDashboard,
  ShieldCheck,
  Search,
  Tags,
  Camera,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const CATEGORIES = ["Food", "Medicine", "Cosmetics", "Documents", "Warranty", "Subscriptions"];

const FEATURES = [
  { icon: ScanLine, title: "Scan, don’t type", body: "Snap a label — OCR + AI pre-fill the name, expiry date and category. You just confirm." },
  { icon: BellRing, title: "Timed reminders", body: "Email nudges at 30, 15, 7, 3 and 1 days before expiry, on India time. Never get surprised." },
  { icon: LayoutDashboard, title: "Clear dashboard", body: "Totals, expiring soon, expired and recently added — your whole inventory at a glance." },
  { icon: Search, title: "Search & filter", body: "Find anything instantly by name, category or status across all seven categories." },
  { icon: Tags, title: "7 categories", body: "Food, medicine, cosmetics, documents, warranties, subscriptions and more in one place." },
  { icon: ShieldCheck, title: "Private by design", body: "Row-level security means your items are yours alone — enforced at the database." },
];

const STEPS = [
  { icon: Camera, title: "Snap", body: "Photograph the product or its expiry label." },
  { icon: CheckCircle2, title: "Confirm", body: "Review the auto-filled details and save — nothing is stored until you do." },
  { icon: BellRing, title: "Relax", body: "We email you before anything expires." },
];

export function Landing() {
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-5">
      {/* Nav */}
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-bold tracking-tight">
          Expire <span className="text-primary">X</span>
        </span>
        <Link href="/login">
          <Button variant="outline" size="sm">
            Sign in
          </Button>
        </Link>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center py-16 text-center sm:py-24">
        <span className="glass mb-6 inline-flex items-center gap-2 px-3 py-1 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          OCR + AI-assisted expiry tracking
        </span>
        <h1 className="max-w-2xl text-balance text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Never let anything{" "}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            expire
          </span>{" "}
          again.
        </h1>
        <p className="mt-5 max-w-xl text-balance text-base text-muted sm:text-lg">
          Track expiry dates for food, medicine, cosmetics, documents and more. Scan a label,
          confirm the details, and get reminded before it’s too late.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/login">
            <Button size="md" className="h-11 px-6">
              Get started free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="#features">
            <Button variant="outline" size="md" className="h-11 px-6">
              See how it works
            </Button>
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((c) => (
            <span key={c} className="glass px-3 py-1 text-xs text-muted">
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-8 py-12">
        <h2 className="mb-2 text-center text-2xl font-semibold sm:text-3xl">
          Everything you need to stay ahead of expiry
        </h2>
        <p className="mx-auto mb-10 max-w-md text-center text-sm text-muted">
          Built for the way you actually shop and stock — fast capture, zero spreadsheets.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass p-5 transition hover:border-primary/40">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1 font-semibold">{title}</h3>
              <p className="text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-12">
        <h2 className="mb-10 text-center text-2xl font-semibold sm:text-3xl">Three steps. That’s it.</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="glass relative p-6">
              <span className="absolute right-4 top-4 text-3xl font-bold text-white/10">{i + 1}</span>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1 font-semibold">{title}</h3>
              <p className="text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-12">
        <div className="glass flex flex-col items-center gap-4 p-10 text-center">
          <h2 className="max-w-lg text-2xl font-semibold sm:text-3xl">
            Start tracking in under a minute.
          </h2>
          <p className="max-w-md text-sm text-muted">
            Free to use. Your first scan is the only setup you need.
          </p>
          <Link href="/login">
            <Button size="md" className="h-11 px-6">
              Get started free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto flex flex-col items-center justify-between gap-3 border-t border-border py-8 text-xs text-muted sm:flex-row">
        <span>
          Expire <span className="text-primary">X</span> · Track. Confirm. Relax.
        </span>
        <Link href="/login" className="hover:text-foreground">
          Sign in
        </Link>
      </footer>
    </div>
  );
}
