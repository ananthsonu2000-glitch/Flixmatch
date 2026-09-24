import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabaseAdmin();

  const { data: session } = await db
    .from("sessions")
    .select("id, expires_at")
    .eq("id", id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  if (new Date(session.expires_at as string).getTime() < Date.now()) {
    return NextResponse.json({ error: "session_expired" }, { status: 410 });
  }

  const { data, error } = await db.rpc("claim_partner_b", { p_session_id: id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const claimed = data?.[0];
  if (!claimed?.token) {
    return NextResponse.json(
      { error: "session_already_has_two_players" },
      { status: 409 }
    );
  }

  return NextResponse.json({ sessionId: id, token: claimed.token, role: "B" });
}
