import { createBrowserClient } from "@supabase/ssr";

// Supabase client for Client Components. Only the public URL and anon key are
// available here; Row-Level Security limits what the signed-in user can see.
// Never import lib/supabase/admin.ts from browser code.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
