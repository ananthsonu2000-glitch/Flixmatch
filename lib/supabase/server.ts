import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Server-only client using the service role key — bypasses RLS.
// NEVER import this file from client components.
let cached: ReturnType<typeof createClient<Database>> | null = null;

export function supabaseAdmin() {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  cached = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
  return cached;
}
