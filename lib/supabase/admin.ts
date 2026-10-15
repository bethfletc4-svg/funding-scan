import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

// `any` until database types are generated from the migrations with
// `supabase gen types typescript` (needs a linked Supabase project). Without a
// schema type, supabase-js rejects arguments to rpc() and table queries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any>;

// Service-role client: bypasses Row-Level Security. Use it only inside Inngest
// functions, API routes (webhooks, the Inngest handler) and scripts/, never in
// browser code or in pages a user can render. SUPABASE_SERVICE_ROLE_KEY has no
// NEXT_PUBLIC_ prefix, so Next.js never ships it to the browser.
let adminClient: AdminClient | undefined;

export function createAdminClient(): AdminClient {
  adminClient ??= createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return adminClient;
}
