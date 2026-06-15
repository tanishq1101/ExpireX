import "server-only";

import { createClient } from "@supabase/supabase-js";

// Service-role client: BYPASSES RLS. Server-only. Never import from a client component.
// Used only where a trusted system context is required (not in normal user flows).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
