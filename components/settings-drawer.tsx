"use client";

import * as React from "react";
import Link from "next/link";
import {
  MoreVertical,
  X,
  Settings,
  Moon,
  Sun,
  Bell,
  BellOff,
  Sliders,
  HelpCircle,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

/* ------------------------------------------------------------------ */
/*  FAQ data (shared with landing page)                                */
/* ------------------------------------------------------------------ */
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
    a: "No. Expire X is free to use. Create an account, add your first item, and you're set.",
  },
];

/* ------------------------------------------------------------------ */
/*  Inline push-notification toggle for the drawer                     */
/* ------------------------------------------------------------------ */
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function useDrawerPush() {
  const [supported, setSupported] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      !!VAPID_PUBLIC;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub))
      .catch(() => {});
  }, []);

  const toggle = React.useCallback(async () => {
    setBusy(true);
    try {
      if (enabled) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});
          await sub.unsubscribe();
        }
        setEnabled(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        });
        const json = sub.toJSON();
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: json.endpoint,
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          }),
        });
        if (!res.ok) throw new Error("save failed");
        setEnabled(true);
      }
    } catch {
      /* silent */
    } finally {
      setBusy(false);
    }
  }, [enabled]);

  return { supported, enabled, busy, toggle };
}

/* ------------------------------------------------------------------ */
/*  Toggle switch UI                                                   */
/* ------------------------------------------------------------------ */
function ToggleSwitch({
  checked,
  busy,
  onChange,
  label,
}: {
  checked: boolean;
  busy?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={busy}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        checked ? "bg-primary" : "bg-surface/20"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      >
        {busy && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main drawer component                                              */
/* ------------------------------------------------------------------ */
export type SettingsDrawerVariant = "landing" | "app";

interface SettingsDrawerProps {
  variant: SettingsDrawerVariant;
  onSignOut?: () => void;
}

export function SettingsDrawer({ variant, onSignOut }: SettingsDrawerProps) {
  const [open, setOpen] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const [faqOpen, setFaqOpen] = React.useState<number | null>(null);
  const [modesOpen, setModesOpen] = React.useState(false);
  const [compact, setCompact] = React.useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  React.useEffect(() => {
    setCompact(document.documentElement.classList.contains("compact"));
  }, []);

  const toggleCompact = React.useCallback(() => {
    const next = !compact;
    setCompact(next);
    document.documentElement.classList.toggle("compact", next);
    try { localStorage.setItem("compact", next ? "1" : "0"); } catch { /* ignore */ }
  }, [compact]);
  const push = useDrawerPush();
  const isDark = theme === "dark";

  /* Close with exit animation */
  const handleClose = React.useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 250); // matches slide-out-left duration
  }, []);

  /* Lock body scroll while open */
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* Close on Escape */
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  return (
    <>
      {/* 3-dot trigger button */}
      <button
        type="button"
        aria-label="Open settings menu"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border",
          "bg-surface/[0.05] text-foreground transition hover:bg-surface/[0.12]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        )}
      >
        <MoreVertical className="h-[1.1rem] w-[1.1rem]" />
      </button>

      {/* Drawer + backdrop */}
      {open && (
        <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close settings menu"
            className={cn(
              "absolute inset-0 bg-background/60 backdrop-blur-sm",
              closing ? "opacity-0 transition-opacity duration-200" : "animate-fade-backdrop-in"
            )}
            onClick={handleClose}
          />

          {/* Drawer panel */}
          <aside
            className={cn(
              "absolute inset-y-0 left-0 z-50 flex w-[82vw] max-w-[320px] flex-col",
              "border-r bg-background/95 backdrop-blur-xl shadow-2xl",
              closing ? "animate-slide-out-left" : "animate-slide-in-left"
            )}
            style={{ borderColor: "var(--glass-border)" }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--glass-border)" }}>
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-sm font-black text-primary-foreground shadow-[0_0_20px_-4px] shadow-primary/60">
                  X
                </span>
                <span className="text-base font-bold tracking-tight">
                  Expire <span className="text-primary">X</span>
                </span>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={handleClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface/[0.08] hover:text-foreground"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {/* ============ Settings Section ============ */}
              <SectionLabel>Settings</SectionLabel>

              <DrawerRow icon={Settings} label="General Settings" chevron>
                <span className="text-[11px] text-muted">App preferences</span>
              </DrawerRow>

              {/* Dark mode toggle */}
              <DrawerRow
                icon={isDark ? Moon : Sun}
                label="Dark Mode"
                trailing={
                  <ToggleSwitch
                    checked={isDark}
                    onChange={toggleTheme}
                    label="Toggle dark mode"
                  />
                }
              />

              {/* Notification settings — only in app variant */}
              {variant === "app" && push.supported && (
                <DrawerRow
                  icon={push.enabled ? Bell : BellOff}
                  label="Notifications"
                  trailing={
                    <ToggleSwitch
                      checked={push.enabled}
                      busy={push.busy}
                      onChange={push.toggle}
                      label="Toggle push notifications"
                    />
                  }
                />
              )}

              {/* Additional modes — expandable */}
              <button type="button" onClick={() => setModesOpen((v) => !v)} className="w-full">
                <DrawerRow icon={Sliders} label="Additional Modes" chevron chevronOpen={modesOpen} />
              </button>
              {modesOpen && (
                <div className="mb-1 pl-3 pr-1">
                  <DrawerRow
                    icon={Sliders}
                    label="Compact View"
                    trailing={
                      <ToggleSwitch
                        checked={compact}
                        onChange={toggleCompact}
                        label="Toggle compact view"
                      />
                    }
                  >
                    <span className="text-[11px] text-muted">Smaller item rows</span>
                  </DrawerRow>
                </div>
              )}

              <Divider />

              {/* ============ Information Section ============ */}
              <SectionLabel>Information</SectionLabel>

              {/* FAQs */}
              {variant === "landing" ? (
                <a href="#faq" onClick={handleClose}>
                  <DrawerRow icon={HelpCircle} label="FAQs" chevron />
                </a>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => setFaqOpen(faqOpen !== null ? null : 0)}
                    className="w-full"
                  >
                    <DrawerRow
                      icon={HelpCircle}
                      label="FAQs"
                      chevron
                      chevronOpen={faqOpen !== null}
                    />
                  </button>

                  {/* Inline FAQ accordion */}
                  {faqOpen !== null && (
                    <div className="mb-2 space-y-1.5 pl-2 pr-1">
                      {FAQS.map((f, i) => (
                        <details
                          key={i}
                          open={faqOpen === i}
                          onToggle={(e) => {
                            if ((e.target as HTMLDetailsElement).open) setFaqOpen(i);
                          }}
                          className="rounded-xl border border-border bg-surface/[0.03] px-3 py-2.5 text-sm [&_summary]:list-none"
                        >
                          <summary className="flex cursor-pointer items-center justify-between gap-2 font-medium text-foreground">
                            <span className="text-[13px] leading-snug">{f.q}</span>
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border text-primary text-xs transition-transform [[open]>&]:rotate-45">
                              +
                            </span>
                          </summary>
                          <p className="mt-2 text-[12px] leading-relaxed text-muted">
                            {f.a}
                          </p>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Privacy Policy */}
              <Link href="/privacy" onClick={handleClose}>
                <DrawerRow icon={ShieldCheck} label="Privacy Policy" chevron />
              </Link>
            </div>

            {/* ============ Footer / Sign Out ============ */}
            {variant === "app" && onSignOut && (
              <div className="border-t px-4 py-4" style={{ borderColor: "var(--glass-border)" }}>
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    onSignOut();
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-danger transition",
                    "hover:bg-danger/10"
                  )}
                >
                  <LogOut className="h-4.5 w-4.5" />
                  Sign Out
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Drawer helpers                                                     */
/* ------------------------------------------------------------------ */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted/70">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-3 h-px bg-border" />;
}

function DrawerRow({
  icon: Icon,
  label,
  trailing,
  chevron,
  chevronOpen,
  children,
}: {
  icon: React.ElementType;
  label: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  chevronOpen?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-surface/[0.06]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface/[0.06] text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {children}
      </div>
      {trailing}
      {chevron && !trailing && (
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted/60 transition-transform",
            chevronOpen && "rotate-90"
          )}
        />
      )}
    </div>
  );
}
