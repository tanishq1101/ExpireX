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
  ChevronLeft,
  Loader2,
  Mail,
  User,
  FileText,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { useUser } from "@clerk/nextjs";
import { useSupabaseClient } from "@/services/supabase/client";
import { CATEGORY_META } from "@/lib/categories";
import { Select } from "@/components/ui/select";
import type { Category } from "@/types/database";

/* ------------------------------------------------------------------ */
/*  Inline push-notification toggle                                     */
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
/*  Toggle switch                                                       */
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
        {busy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Drawer row                                                          */
/* ------------------------------------------------------------------ */
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
  const [panel, setPanel] = React.useState<"main" | "settings">("main");
  const [modesOpen, setModesOpen] = React.useState(false);
  const [compact, setCompact] = React.useState(false);

  /* General Settings state */
  const [defaultCategory, setDefaultCategory] = React.useState<Category>("food");
  const [emailReminders, setEmailReminders] = React.useState(true);
  const [emailRemindersBusy, setEmailRemindersBusy] = React.useState(false);
  const [settingsLoaded, setSettingsLoaded] = React.useState(false);

  const { theme, toggle: toggleTheme } = useTheme();
  const push = useDrawerPush();
  const isDark = theme === "dark";

  const { user } = useUser();
  const supabase = useSupabaseClient();

  /* Compact mode: read from DOM on mount */
  React.useEffect(() => {
    setCompact(document.documentElement.classList.contains("compact"));
  }, []);

  const toggleCompact = React.useCallback(() => {
    const next = !compact;
    setCompact(next);
    document.documentElement.classList.toggle("compact", next);
    try { localStorage.setItem("compact", next ? "1" : "0"); } catch { /* ignore */ }
  }, [compact]);

  /* Load General Settings when sub-panel opens */
  React.useEffect(() => {
    if (panel !== "settings") return;
    try {
      const saved = localStorage.getItem("defaultCategory") as Category | null;
      if (saved) setDefaultCategory(saved);
    } catch { /* ignore */ }

    if (user?.id && !settingsLoaded) {
      supabase
        .from("users")
        .select("email_reminders_enabled")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) setEmailReminders(data.email_reminders_enabled ?? true);
          setSettingsLoaded(true);
        });
    }
  }, [panel, user?.id, supabase, settingsLoaded]);

  const changeDefaultCategory = (cat: Category) => {
    setDefaultCategory(cat);
    try { localStorage.setItem("defaultCategory", cat); } catch { /* ignore */ }
  };

  const toggleEmailReminders = async () => {
    const next = !emailReminders;
    setEmailRemindersBusy(true);
    setEmailReminders(next);
    try {
      await supabase
        .from("users")
        .update({ email_reminders_enabled: next })
        .eq("id", user!.id);
    } catch {
      setEmailReminders(!next); // revert on error
    } finally {
      setEmailRemindersBusy(false);
    }
  };

  /* Close with exit animation */
  const handleClose = React.useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setPanel("main");
      setSettingsLoaded(false);
    }, 250);
  }, []);

  /* Lock body scroll while open */
  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  /* Close on Escape */
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  return (
    <>
      {/* 3-dot trigger */}
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

      {open && (
        <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close settings menu"
            className={cn(
              "absolute inset-0 bg-background/60 backdrop-blur-sm",
              closing
                ? "opacity-0 transition-opacity duration-200"
                : "animate-fade-backdrop-in"
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
            {/* ── Header ── */}
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: "var(--glass-border)" }}
            >
              {panel === "main" ? (
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-sm font-black text-primary-foreground shadow-[0_0_20px_-4px] shadow-primary/60">
                    X
                  </span>
                  <span className="text-base font-bold tracking-tight">
                    Expire <span className="text-primary">X</span>
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPanel("main")}
                  className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
                >
                  <ChevronLeft className="h-4 w-4 text-muted" />
                  General Settings
                </button>
              )}
              <button
                type="button"
                aria-label="Close menu"
                onClick={handleClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface/[0.08] hover:text-foreground"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* ── Scrollable content ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4">

              {/* ════════ MAIN PANEL ════════ */}
              {panel === "main" && (
                <>
                  <SectionLabel>Settings</SectionLabel>

                  {/* General Settings → sub-panel */}
                  <button
                    type="button"
                    onClick={() => setPanel("settings")}
                    className="w-full"
                  >
                    <DrawerRow icon={Settings} label="General Settings" chevron>
                      <span className="text-[11px] text-muted">App preferences</span>
                    </DrawerRow>
                  </button>

                  {/* Dark mode */}
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

                  {/* Push notifications (app + supported only) */}
                  {variant === "app" && push.supported && (
                    <DrawerRow
                      icon={push.enabled ? Bell : BellOff}
                      label="Push Notifications"
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

                  {/* Additional Modes */}
                  <button
                    type="button"
                    onClick={() => setModesOpen((v) => !v)}
                    className="w-full"
                  >
                    <DrawerRow
                      icon={Sliders}
                      label="Additional Modes"
                      chevron
                      chevronOpen={modesOpen}
                    />
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

                  <SectionLabel>Information</SectionLabel>

                  <Link href="/faq" onClick={handleClose}>
                    <DrawerRow icon={HelpCircle} label="FAQ" chevron />
                  </Link>
                  <Link href="/privacy" onClick={handleClose}>
                    <DrawerRow icon={ShieldCheck} label="Privacy Policy" chevron />
                  </Link>
                  <Link href="/terms" onClick={handleClose}>
                    <DrawerRow icon={FileText} label="Terms of Service" chevron />
                  </Link>
                  <Link href="/contact" onClick={handleClose}>
                    <DrawerRow icon={MessageSquare} label="Contact Us" chevron />
                  </Link>
                </>
              )}

              {/* ════════ GENERAL SETTINGS PANEL ════════ */}
              {panel === "settings" && (
                <>
                  <SectionLabel>Preferences</SectionLabel>

                  {/* Default category */}
                  <div className="mb-1 rounded-xl px-3 py-3">
                    <div className="mb-2 flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface/[0.06] text-primary">
                        <Settings className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-sm font-medium text-foreground">Default Category</div>
                        <div className="text-[11px] text-muted">Pre-selected when adding items</div>
                      </div>
                    </div>
                    <Select
                      value={defaultCategory}
                      onChange={(e) => changeDefaultCategory(e.target.value as Category)}
                      className="text-sm"
                    >
                      {(Object.entries(CATEGORY_META) as [Category, typeof CATEGORY_META[Category]][]).map(
                        ([key, meta]) => (
                          <option key={key} value={key}>{meta.label}</option>
                        )
                      )}
                    </Select>
                  </div>

                  {/* Email reminders */}
                  <DrawerRow
                    icon={Mail}
                    label="Email Reminders"
                    trailing={
                      !settingsLoaded ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted" />
                      ) : (
                        <ToggleSwitch
                          checked={emailReminders}
                          busy={emailRemindersBusy}
                          onChange={toggleEmailReminders}
                          label="Toggle email reminders"
                        />
                      )
                    }
                  >
                    <span className="text-[11px] text-muted">Expiry nudges by email</span>
                  </DrawerRow>

                  <Divider />

                  <SectionLabel>Account</SectionLabel>

                  {/* Account info */}
                  <div className="rounded-xl border border-border bg-surface/[0.03] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <User className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        {user?.firstName && (
                          <div className="truncate text-sm font-medium text-foreground">
                            {user.firstName} {user.lastName ?? ""}
                          </div>
                        )}
                        <div className="truncate text-[11px] text-muted">
                          {user?.emailAddresses[0]?.emailAddress ?? ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sign out */}
                  {onSignOut && (
                    <button
                      type="button"
                      onClick={() => { handleClose(); onSignOut(); }}
                      className={cn(
                        "mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-danger transition",
                        "hover:bg-danger/10"
                      )}
                    >
                      <LogOut className="h-4.5 w-4.5" />
                      Sign Out
                    </button>
                  )}
                </>
              )}
            </div>

            {/* ── Footer (main panel only) ── */}
            {panel === "main" && variant === "app" && onSignOut && (
              <div
                className="border-t px-4 py-4"
                style={{ borderColor: "var(--glass-border)" }}
              >
                <button
                  type="button"
                  onClick={() => { handleClose(); onSignOut(); }}
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
