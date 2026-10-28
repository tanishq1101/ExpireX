'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'sonner';
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
async function registration() {
  return Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Notification service is unavailable. Reload and retry.')), 5000))]);
}
export async function detachPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  // Revoke locally even if the server is unavailable; expired endpoints are purged by the worker.
  const response = await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }), signal: AbortSignal.timeout(5000) }).catch(() => null);
  const revoked = await sub.unsubscribe();
  if (!revoked) throw new Error('Could not detach this device. Try again.');
  if (!response?.ok) toast.warning('Device notifications stopped. Server cleanup will retry on the next delivery.');
}
export function usePush() {
  const { userId, isLoaded } = useAuth();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    if (!isLoaded) return;
    setEnabled(false);
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC && !!userId;
    setSupported(ok);
    if (!ok) {
      if (!userId && 'serviceWorker' in navigator && 'PushManager' in window) navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager.getSubscription()).then((sub) => sub?.unsubscribe()).catch(() => {});
      return;
    }
    (async () => {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (!sub || !active) return;
      const response = await fetch('/api/push/subscribe', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not check this device’s notification settings.');
      const { endpoints } = await response.json() as { endpoints: string[] };
      if (!active) return;
      if (endpoints.includes(sub.endpoint)) setEnabled(true);
      else await sub.unsubscribe(); // Device belonged to a previous account or failed save.
    })().catch((error) => { if (active) toast.error(error.message); });
    return () => { active = false; };
  }, [userId, isLoaded]);
  async function toggle() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (enabled) { await detachPush(); setEnabled(false); toast.success('Push reminders off'); }
      else {
        if (await Notification.requestPermission() !== 'granted') throw new Error('Allow notifications in your browser settings.');
        const reg = await registration();
        const raw = atob(VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/'));
        const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const json = sub.toJSON();
        const response = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }) });
        if (!response.ok) { await sub.unsubscribe(); throw new Error('Could not save notification settings. Please retry.'); }
        setEnabled(true); toast.success('Push reminders on');
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not change notifications.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return { supported, enabled, busy, toggle };
}
