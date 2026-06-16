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
  Sparkles,
  Clock,
  Leaf,
  Pill,
  FileText,
  ScanBarcode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingNav } from "@/components/landing-nav";

const CATEGORIES = ["Food", "Medicine", "Cosmetics", "Documents", "Warranty", "Subscriptions", "Other"];

const STATS = [
  { value: "7", label: "Categories tracked" },
  { value: "5", label: "Reminder windows" },
  { value: "<1 min", label: "To add an item" },
  { value: "100%", label: "Private by RLS" },
];

const FEATURES = [
  {
    icon: ScanBarcode,
    title: "Barcode scanning",
    body: "Scan a product barcode like a shop till — we identify it and AI estimates a likely expiry you can confirm.",
  },
  {
    icon: ScanLine,
    title: "Scan, don’t type",
    body: "Snap a label — OCR + AI pre-fill the name, expiry date and category. You just confirm.",
  },
  {
    icon: BellRing,
    title: "Timed reminders",
    body: "Email nudges at 30, 15, 7, 3 and 1 days before expiry, on India time. Never get surprised.",
  },
  {
    icon: LayoutDashboard,
    title: "Clear dashboard",
    body: "Totals, expiring soon, expired and recently added — your whole inventory at a glance.",
  },
  {
    icon: Search,
    title: "Search & filter",
    body: "Find anything instantly by name, category or status across all seven categories.",
  },
  {
    icon: Tags,
    title: "7 smart categories",
    body: "Food, medicine, cosmetics, documents, warranties, subscriptions and more in one place.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "Row-level security means your items are yours alone — enforced at the database.",
  },
];

const STEPS = [
  { icon: Camera, title: "Snap", body: "Photograph the product or its expiry label with your camera." },
  { icon: CheckCircle2, title: "Confirm", body: "Review the auto-filled details and save — nothing is stored until you do." },
  { icon: BellRing, title: "Relax", body: "We email you on time, before anything expires." },
];

const FAQS = [
  {
    q: "What exactly does Expire X track?",
    a: "Anything with an expiry or renewal date — groceries and food, medicines, cosmetics and skincare, official documents like passports and licences, product warranties, and recurring subscriptions. Seven categories, one organised place.",
  },
  {
    q: "How does the scanning work?",
    a: "Point your camera at a product label and Expire X uses on-device OCR plus AI to read the name, expiry date and likely category. It pre-fills the form so you only confirm — no manual typing of dates.",
  },
  {
    q: "When will I be reminded?",
    a: "You get email reminders at 30, 15, 7, 3 and 1 days before each item expires, delivered on India (Asia/Kolkata) time so they always land at a sensible hour.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Every item is protected by database-level row-level security, so your records are only ever visible to you — not to other users and not by accident.",
  },
  {
    q: "Does it cost anything?",
    a: "No. Expire X is free to use. Create an account, add your first item, and you’re set.",
  },
];

export function Landing() {
  return (
    <div className="relative min-h-dvh">
      <LandingNav />

      {/* ---------------- Hero ---------------- */}
      <section className="relative mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-fade-up text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Barcode + OCR + AI expiry tracking
            </span>

            <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Never let anything{" "}
              <span className="bg-gradient-to-r from-primary via-blue-500 to-accent bg-clip-text text-transparent">
                expire
              </span>{" "}
              again.
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted sm:text-lg lg:mx-0">
              Expire X is your calm, green command centre for everything with a shelf life. Scan a
              label, confirm the details once, and let timely reminders keep your food, medicine,
              documents and subscriptions from ever catching you off guard.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:items-start">
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="md" className="h-12 w-full px-7 text-[15px] sm:w-auto">
                  Get started free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="#how" className="w-full sm:w-auto">
                <Button variant="outline" size="md" className="h-12 w-full px-7 text-[15px] sm:w-auto">
                  See how it works
                </Button>
              </Link>
            </div>

            <p className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted lg:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Free forever
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> No credit card
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Private by default
              </span>
            </p>
          </div>

          {/* Hero preview card */}
          <div className="animate-fade-up [animation-delay:120ms]">
            <HeroPreview />
          </div>
        </div>

        {/* Category chips */}
        <div className="mt-12 flex flex-wrap justify-center gap-2 animate-fade-up [animation-delay:200ms]">
          {CATEGORIES.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-surface/[0.04] px-3 py-1 text-xs text-muted"
            >
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* ---------------- Stats ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="glass grid grid-cols-2 gap-4 p-6 sm:grid-cols-4 sm:p-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="bg-gradient-to-br from-primary to-accent bg-clip-text text-3xl font-extrabold tabular-nums text-transparent sm:text-4xl">
                {s.value}
              </div>
              <div className="mt-1 text-xs text-muted sm:text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6">
        <SectionHeading
          eyebrow="Features"
          title="Everything you need to stay ahead of expiry"
          subtitle="Built for the way you actually shop and stock — fast capture, zero spreadsheets."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="glass hover-glow group p-6"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/15 text-primary transition group-hover:scale-110">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1.5 font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps. That’s it."
          subtitle="From shelf to scheduled reminder in under a minute."
        />
        <div className="relative mt-10 grid gap-4 sm:grid-cols-3">
          {/* connecting line on desktop */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-12 hidden h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent sm:block"
            aria-hidden
          />
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="glass hover-glow relative p-6 text-center">
              <span className="absolute right-4 top-3 text-4xl font-black text-primary/10">
                {i + 1}
              </span>
              <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_0_24px_-6px] shadow-primary/60">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1 font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- FAQ / description ---------------- */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-14 sm:px-6">
        <SectionHeading
          eyebrow="FAQ"
          title="Good to know"
          subtitle="A quick tour of what Expire X does and how it keeps your life on schedule."
        />
        <div className="mt-8 space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="glass group p-5 [&_summary]:list-none">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium">
                {f.q}
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-primary transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-blue-500/10 to-accent/15 p-10 text-center sm:p-16">
          <div
            className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 animate-blob rounded-full bg-primary/30 blur-3xl"
            aria-hidden
          />
          <h2 className="mx-auto max-w-lg text-balance text-2xl font-bold sm:text-4xl">
            Start tracking in under a minute.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted sm:text-base">
            Free to use. Your first scan is the only setup you need.
          </p>
          <Link href="/login" className="mt-7 inline-block">
            <Button size="md" className="h-12 px-8 text-[15px]">
              Get started free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border py-8 text-sm text-muted sm:flex-row">
          <span className="inline-flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent text-xs font-black text-primary-foreground">
              X
            </span>
            Expire <span className="font-semibold text-foreground">X</span> · Track. Confirm. Relax.
          </span>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
            <a href="#features" className="transition hover:text-foreground">
              Features
            </a>
            <a href="#faq" className="transition hover:text-foreground">
              FAQ
            </a>
            <Link href="/privacy" className="transition hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-foreground">
              Terms
            </Link>
            <Link href="/contact" className="transition hover:text-foreground">
              Contact
            </Link>
            <Link href="/login" className="transition hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</span>
      <h2 className="mt-2 text-balance text-2xl font-bold sm:text-3xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted">{subtitle}</p>
    </div>
  );
}

/** Stylised product/dashboard preview shown in the hero. */
function HeroPreview() {
  const items = [
    { icon: Leaf, name: "Greek yogurt", meta: "Food", days: "3 days", tone: "text-warning" },
    { icon: Pill, name: "Vitamin D3", meta: "Medicine", days: "12 days", tone: "text-primary" },
    { icon: FileText, name: "Passport", meta: "Documents", days: "30 days", tone: "text-accent" },
  ];
  return (
    <div className="glass relative mx-auto w-full max-w-md p-5 shadow-2xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted">Expiring soon</div>
          <div className="text-lg font-bold">Your shelf</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
          <BellRing className="h-3.5 w-3.5" /> 3 reminders
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        {items.map(({ icon: Icon, name, meta, days, tone }) => (
          <div
            key={name}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface/[0.04] p-3"
          >
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/15 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{name}</div>
              <div className="text-xs text-muted">{meta}</div>
            </div>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
              <Clock className="h-3.5 w-3.5" />
              {days}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
        <ScanBarcode className="h-4 w-4 shrink-0 text-primary" />
        Scan a barcode or label to auto-fill name, date &amp; category.
      </div>
    </div>
  );
}
