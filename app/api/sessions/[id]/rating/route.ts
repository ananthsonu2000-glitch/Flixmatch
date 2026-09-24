import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyPartnerToken } from "@/lib/sessionAuth";
import type { Partner } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const role: Partner | undefined = body.role;
  const token: string | undefined = body.token;
  const tmdbId: number | undefined = body.tmdbId;
  const rating: number | undefined = body.rating;
  const review: string | undefined = body.review;

  if (!role || !token || !tmdbId || !rating) {
    return NextResponse.json({ error: "role, token, tmdbId, rating required" }, { status: 400 });
  }
  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: "rating must be 1-5" }, { status: 400 });
  }

  const auth = await verifyPartnerToken(id, role, token);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 403 });

  const { error } = await supabaseAdmin()
    .from("ratings")
    .upsert(
      { session_id: id, tmdb_id: tmdbId, partner: role, rating, review: review ?? null },
      { onConflict: "session_id,tmdb_id,partner" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
