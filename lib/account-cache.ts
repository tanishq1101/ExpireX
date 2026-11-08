import { revalidateTag } from "next/cache";

/** Tag for one user's cached account state; the Clerk webhook clears it on profile changes. */
export const accountTag = (userId: string) => `account:${userId}`;

/** Drop a user's cached account state (best effort; outside a Next request it is a no-op). */
export function forgetAccount(userId: string) {
  try { revalidateTag(accountTag(userId)); } catch { /* no cache in this context */ }
}
