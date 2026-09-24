import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generatePairCode } from "@/lib/pairCode";
import { errorResponse } from "@/lib/apiError";
import type { PreferenceInput } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const preferences: PreferenceInput | undefined = body.preferences;
    const devicePairId: string | undefined = body.pairId;

    if (!preferences) {
      return NextResponse.json({ error: "preferences required" }, { status: 400 });
    }

    const db = supabaseAdmin();

    let pairId = devicePairId ?? null;
    let pairCode: string | null = null;

    if (pairId) {
      const { data } = await db.from("pairs").select("id, code").eq("id", pairId).maybeSingle();
      if (data) {
        pairCode = data.code as string;
      } else {
        pairId = null; // stale/unknown id, fall through to create a fresh pair
      }
    }

    if (!pairId) {
      pairCode = generatePairCode();
      const { data, error } = await db.from("pairs").insert({ code: pairCode }).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      pairId = data.id as string;
    }

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .insert({ pair_id: pairId })
      .select("id, partnerA_token")
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: sessionError?.message ?? "failed to create session" }, { status: 500 });
    }

    const { error: rpcError } = await db.rpc("submit_preferences", {
      p_session_id: session.id,
      p_partner: "A",
      p_mood: preferences.mood,
      p_mood_freetext: preferences.moodFreetext,
      p_languages: preferences.languages,
      p_content_type: preferences.contentType,
      p_min_rating: preferences.minRating,
      p_eras: preferences.eras,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json({
      sessionId: session.id,
      token: session.partnerA_token,
      role: "A",
      pairId,
      pairCode,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
