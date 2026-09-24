import { supabaseAdmin } from "./supabase/server";
import type { Partner } from "./types";

/**
 * Verifies that `token` matches the claimed role's token on the session,
 * so one partner can't spoof writes on behalf of the other without real
 * accounts. Returns the session row on success.
 */
export async function verifyPartnerToken(sessionId: string, role: Partner, token: string) {
  const { data, error } = await supabaseAdmin()
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error || !data) return { ok: false as const, reason: "session_not_found" };

  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    return { ok: false as const, reason: "session_expired" };
  }

  const expectedToken = role === "A" ? data.partnerA_token : data.partnerB_token;
  if (!expectedToken || expectedToken !== token) {
    return { ok: false as const, reason: "invalid_token" };
  }

  return { ok: true as const, session: data };
}
