import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = supabaseAdmin();

    const { data: match } = await db
      .from("matches")
      .select("tmdb_id, round, matched_at")
      .eq("session_id", id)
      .maybeSingle();

    if (!match) return NextResponse.json({ match: null });

    const { data: title } = await db
      .from("title_pools")
      .select("*")
      .eq("session_id", id)
      .eq("round", match.round)
      .eq("tmdb_id", match.tmdb_id)
      .maybeSingle();

    return NextResponse.json({ match: { ...match, title } });
  } catch (err) {
    return errorResponse(err);
  }
}
