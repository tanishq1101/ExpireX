import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

// Server Supabase client that forwards the Clerk session token, so Postgres RLS
// (auth.jwt()->>'sub') runs as the signed-in Clerk user.
export async function createClient() {
  const { getToken } = await auth();
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: async () => (await getToken()) ?? null }
  );
}
