import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyPartnerToken } from "@/lib/sessionAuth";
import { generateRoundOnePool } from "@/lib/pool-generation";
import { errorResponse } from "@/lib/apiError";
import type { Partner, PreferenceInput } from "@/lib/types";

// Pool generation (Gemini + TMDB + serialized RapidAPI enrichment) can take
// 30-40s+, well past Vercel's default 10s function timeout on the Hobby
// plan. 60 is the Hobby-plan ceiling; raise further if on a paid plan.
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const role: Partner | undefined = body.role;
    const token: string | undefined = body.token;
    const preferences: PreferenceInput | undefined = body.preferences;

    if (!role || !token || !preferences) {
      return NextResponse.json({ error: "role, token, preferences required" }, { status: 400 });
    }

    const auth = await verifyPartnerToken(id, role, token);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const db = supabaseAdmin();
    const { data, error } = await db.rpc("submit_preferences", {
      p_session_id: id,
      p_partner: role,
      p_mood: preferences.mood,
      p_mood_freetext: preferences.moodFreetext,
      p_languages: preferences.languages,
      p_content_type: preferences.contentType,
      p_min_rating: preferences.minRating,
      p_eras: preferences.eras,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const triggered = Boolean(data?.[0]?.triggered);

    if (triggered) {
      // Flip to 'generating_brief' immediately and return — the Gemini/TMDB/
      // RapidAPI pipeline can take 10-40s, too long to hold the HTTP response
      // open. Clients watch the status transition via Realtime.
      await db.from("sessions").update({ status: "generating_brief", error_message: null }).eq("id", id);

      after(async () => {
        try {
          await generateRoundOnePool(id);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("round 1 pool generation failed", err);
          await db.from("sessions").update({ status: "both_submitted", error_message: message }).eq("id", id);
        }
      });
    }

    return NextResponse.json({ ok: true, triggered });
  } catch (err) {
    return errorResponse(err);
  }
}
