import { supabaseAdmin } from "./supabase/server";

/**
 * Server-side broadcast of the match event for low-latency simultaneous
 * reveal. The `matches` row (written by the record_swipe RPC) is the durable
 * source of truth; this broadcast is purely a latency shortcut so both
 * clients see it land at (near) the same instant. Postgres Changes on
 * `sessions.status` is the reconnect-safe fallback if a client misses it.
 */
export async function broadcastMatch(
  sessionId: string,
  payload: { tmdb_id: number; round: number }
) {
  const channel = supabaseAdmin().channel(`session:${sessionId}`);
  await channel.send({ type: "broadcast", event: "match", payload });
  await supabaseAdmin().removeChannel(channel);
}
