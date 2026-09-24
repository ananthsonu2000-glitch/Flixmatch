import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/apiError";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const round = Number(req.nextUrl.searchParams.get("round") ?? "1");

    const { data, error } = await supabaseAdmin()
      .from("title_pools")
      .select("*")
      .eq("session_id", id)
      .eq("round", round);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ pool: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
