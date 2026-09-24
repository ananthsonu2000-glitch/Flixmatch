import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Partner, TitlePoolItem } from "@/lib/types";

// Since a genuine mutual like already short-circuits into an immediate match
// (see record_swipe RPC), every title that survives to this fallback has at
// most one partner's like — a naive "both partners liked count" degenerates
// to 0/1 and can't discriminate. Instead: weight round-2 likes above round-1
// (reflects the refined taste), break ties on IMDb rating, and surface which
// partner liked each pick so the couple has real info to decide with.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabaseAdmin();

  const [{ data: pools }, { data: likes }] = await Promise.all([
    db.from("title_pools").select("*").eq("session_id", id),
    db.from("swipes").select("round, partner, tmdb_id").eq("session_id", id).eq("direction", "like"),
  ]);

  const poolByKey = new Map<string, TitlePoolItem & { round: number }>();
  for (const p of pools ?? []) {
    poolByKey.set(`${p.round}:${p.tmdb_id}`, p as unknown as TitlePoolItem & { round: number });
  }

  interface Scored {
    tmdb_id: number;
    round: number;
    title: string;
    poster_path: string | null;
    imdb_rating: number | null;
    year: number | null;
    synopsis: string;
    ott_platforms: unknown;
    score: number;
    likedBy: Partner[];
  }

  const byTitle = new Map<number, Scored>();

  for (const s of likes ?? []) {
    const p = poolByKey.get(`${s.round}:${s.tmdb_id}`);
    if (!p) continue;

    const existing = byTitle.get(s.tmdb_id as number);
    const weight = (s.round as number) === 2 ? 2 : 1;

    if (existing) {
      existing.score += weight;
      if (!existing.likedBy.includes(s.partner as Partner)) existing.likedBy.push(s.partner as Partner);
    } else {
      byTitle.set(s.tmdb_id as number, {
        tmdb_id: s.tmdb_id as number,
        round: s.round as number,
        title: p.title,
        poster_path: p.poster_path,
        imdb_rating: p.imdb_rating,
        year: p.year,
        synopsis: p.synopsis,
        ott_platforms: p.ott_platforms,
        score: weight,
        likedBy: [s.partner as Partner],
      });
    }
  }

  const topFive = [...byTitle.values()]
    .sort((a, b) => b.score - a.score || (b.imdb_rating ?? 0) - (a.imdb_rating ?? 0))
    .slice(0, 5);

  return NextResponse.json({ topFive });
}
