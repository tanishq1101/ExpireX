import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "FAQ — Expire X",
  description: "Frequently asked questions about Expire X.",
};

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
    q: "Can I scan barcodes?",
    a: "Yes. Expire X can scan EAN / UPC barcodes — point the camera at a product and we identify it via Open Food Facts, then AI estimates a likely shelf life you can confirm or adjust.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Every item is protected by database-level row-level security, so your records are only ever visible to you — not to other users and not by accident.",
  },
  {
    q: "Can I turn off email reminders?",
    a: "Yes. Open the settings menu (three-dot icon), go to General Settings, and toggle off Email Reminders. You can re-enable it at any time.",
  },
  {
    q: "What is the shopping list?",
    a: "Expire X can automatically add soon-to-expire or expired items to a shopping list so you remember to restock them. You can also add items manually.",
  },
  {
    q: "Does it cost anything?",
    a: "No. Expire X is free to use. Create an account, add your first item, and you're set.",
  },
];

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
          Frequently asked questions
        </h1>
        <p className="mt-2 text-muted">
          Everything you need to know about Expire X.
        </p>
      </div>

      <div className="space-y-3">
        {FAQS.map((f, i) => (
          <details
            key={i}
            className="group rounded-2xl border border-border bg-surface/[0.03] px-5 py-4 [&_summary]:list-none"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium text-foreground">
              <span className="text-[15px] leading-snug">{f.q}</span>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-primary text-sm transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
          </details>
        ))}
      </div>

      <p className="mt-10 text-sm text-muted">
        Still have questions?{" "}
        <Link href="/contact" className="text-primary underline-offset-4 hover:underline">
          Contact us
        </Link>
        .
      </p>
    </main>
  );
}
