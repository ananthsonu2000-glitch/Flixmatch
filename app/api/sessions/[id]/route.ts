import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = supabaseAdmin();

    const { data: session, error } = await db
      .from("sessions")
      .select("id, status, round, partnerA_claimed, partnerB_claimed, expires_at")
      .eq("id", id)
      .single();

    if (error || !session) {
      return NextResponse.json({ error: "session_not_found" }, { status: 404 });
    }

    const expired = new Date(session.expires_at as string).getTime() < Date.now();
    if (expired && session.status !== "expired") {
      await db.from("sessions").update({ status: "expired" }).eq("id", id);
      session.status = "expired";
    }

    const { data: match } = await db
      .from("matches")
      .select("tmdb_id, round")
      .eq("session_id", id)
      .maybeSingle();

    return NextResponse.json({ session, match: match ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}
