import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyPartnerToken } from "@/lib/sessionAuth";
import { broadcastMatch } from "@/lib/broadcastMatch";
import { errorResponse } from "@/lib/apiError";
import type { Partner, SwipeDirection } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const role: Partner | undefined = body.role;
    const token: string | undefined = body.token;
    const round: number | undefined = body.round;
    const tmdbId: number | undefined = body.tmdbId;
    const direction: SwipeDirection | undefined = body.direction;

    if (!role || !token || !round || !tmdbId || !direction) {
      return NextResponse.json({ error: "role, token, round, tmdbId, direction required" }, { status: 400 });
    }

    const auth = await verifyPartnerToken(id, role, token);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 403 });

    const db = supabaseAdmin();
    const { data, error } = await db.rpc("record_swipe", {
      p_session_id: id,
      p_round: round,
      p_partner: role,
      p_tmdb_id: tmdbId,
      p_direction: direction,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const matched = Boolean(data?.[0]?.matched);
    if (matched) {
      await broadcastMatch(id, { tmdb_id: tmdbId, round });
    }

    return NextResponse.json({ matched });
  } catch (err) {
    return errorResponse(err);
  }
}
