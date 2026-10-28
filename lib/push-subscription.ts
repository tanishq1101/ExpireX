import { z } from 'zod';
const PUSH_HOSTS = ['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com'];
export function isPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (PUSH_HOSTS.includes(url.hostname) || url.hostname.endsWith('.push.services.mozilla.com') || url.hostname.endsWith('.notify.windows.com'));
  } catch { return false; }
}
export const endpointSchema = z.string().max(4096).refine(isPushEndpoint, 'Unsupported push service URL');
export const subscriptionSchema = z.object({ endpoint: endpointSchema, p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}={0,1}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/) }).strict();
