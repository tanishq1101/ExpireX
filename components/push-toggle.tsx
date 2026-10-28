"use client";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { usePush } from "@/lib/use-push";
export function PushToggle() {
  const push = usePush();
  if (!push.supported) return null;
  return <button type="button" disabled={push.busy} onClick={push.toggle} aria-label={push.enabled ? "Turn off push reminders" : "Turn on push reminders"} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{push.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : push.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}</button>;
}
