import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";

// Supabase client for Server Components, Server Actions and route handlers.
// Uses the anon key plus the signed-in user's session, so Row-Level Security
// applies: the user only sees rows for organizations they own.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh will live in proxy.ts when auth is built (Phase 6).
          }
        },
      },
    },
  );
}
