import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client — anon key only, RLS restricts it to SELECT on sessions/matches.
export const supabaseBrowser = createClient<Database>(url, anonKey, {
  auth: { persistSession: false },
});
