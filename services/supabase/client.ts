"use client";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { useSession } from "@clerk/nextjs";
import { useMemo } from "react";

// Browser Supabase client that forwards the Clerk session token -> RLS applies.
export function useSupabaseClient() {
  const { session } = useSession();
  return useMemo(
    () =>
      createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { accessToken: async () => (await session?.getToken()) ?? null }
      ),
    [session]
  );
}
