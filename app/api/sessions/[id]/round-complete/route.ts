import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyPartnerToken } from "@/lib/sessionAuth";
import { generateRoundTwoPool } from "@/lib/pool-generation";
import type { Partner } from "@/lib/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const role: Partner | undefined = body.role;
  const token: string | undefined = body.token;
  const round: number | undefined = body.round;

  if (!role || !token || !round) {
    return NextResponse.json({ error: "role, token, round required" }, { status: 400 });
  }

  const auth = await verifyPartnerToken(id, role, token);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 403 });

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("complete_round", {
    p_session_id: id,
    p_round: round,
    p_partner: role,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const next = data?.[0]?.triggered_next as string | null;

  if (next === "round2") {
    after(async () => {
      try {
        await generateRoundTwoPool(id);
      } catch (err) {
        console.error("round 2 pool generation failed", err);
        await db.from("sessions").update({ status: "swiping", round: 1 }).eq("id", id);
      }
    });
  }

  return NextResponse.json({ ok: true, next });
}
