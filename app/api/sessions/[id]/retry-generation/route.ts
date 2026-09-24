import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateRoundOnePool } from "@/lib/pool-generation";
import { errorResponse } from "@/lib/apiError";

// Manual recovery path if brief/pool generation errored out and left the
// session stuck at 'both_submitted' (e.g. a transient TMDB/RapidAPI failure).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = supabaseAdmin();

    const { data, error } = await db
      .from("sessions")
      .update({ status: "generating_brief" })
      .eq("id", id)
      .eq("status", "both_submitted")
      .select("id")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "nothing_to_retry" }, { status: 409 });

    after(async () => {
      try {
        await generateRoundOnePool(id);
      } catch (err) {
        console.error("retry: round 1 pool generation failed", err);
        await db.from("sessions").update({ status: "both_submitted" }).eq("id", id);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
