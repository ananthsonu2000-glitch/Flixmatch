import { generateSearchBrief, refineFromLikes, summarizePairHistory } from "./gemini";
import { discoverCandidates } from "./tmdb";
import { enrichCandidates } from "./streamingAvailability";
import { supabaseAdmin } from "./supabase/server";
import type { Json } from "./supabase/database.types";
import type { Partner, PreferenceInput, TitlePoolItem } from "./types";

const POOL_SIZE = 30;

async function getPairHistory(pairId: string | null) {
  if (!pairId) return undefined;

  const { data } = await supabaseAdmin()
    .from("ratings")
    .select("tmdb_id, rating, session_id, sessions!inner(pair_id)")
    .eq("sessions.pair_id", pairId);

  if (!data || data.length === 0) return undefined;

  // Average rating per title, joined back to title_pools for a display title.
  const byTitle = new Map<number, { sum: number; count: number }>();
  for (const r of data as unknown as { tmdb_id: number; rating: number }[]) {
    const cur = byTitle.get(r.tmdb_id) ?? { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    byTitle.set(r.tmdb_id, cur);
  }

  const tmdbIds = [...byTitle.keys()];
  const { data: titles } = await supabaseAdmin()
    .from("title_pools")
    .select("tmdb_id, title")
    .in("tmdb_id", tmdbIds);

  const titleName = new Map((titles ?? []).map((t) => [t.tmdb_id as number, t.title as string]));

  const ratedTitles = [...byTitle.entries()].map(([tmdbId, agg]) => ({
    title: titleName.get(tmdbId) ?? `#${tmdbId}`,
    avgRating: agg.sum / agg.count,
  }));

  return summarizePairHistory(ratedTitles);
}

async function buildPool(params: {
  candidatesSource: () => Promise<Awaited<ReturnType<typeof discoverCandidates>>>;
  minRating: number;
  excludeTmdbIds: Set<number>;
}): Promise<TitlePoolItem[]> {
  const candidates = (await params.candidatesSource()).filter(
    (c) => !params.excludeTmdbIds.has(c.tmdb_id)
  );

  // Cheap pre-filter on TMDB's own vote_average before spending RapidAPI calls.
  const preFiltered = candidates.filter((c) => c.vote_average >= Math.max(0, params.minRating - 1.5));

  const enriched = await enrichCandidates(
    preFiltered.map((c) => ({ tmdb_id: c.tmdb_id, media_type: c.media_type }))
  );

  const pool: TitlePoolItem[] = [];
  for (const c of preFiltered) {
    const info = enriched.get(c.tmdb_id);
    if (!info || info.imdb_rating === null) continue;
    if (info.imdb_rating < params.minRating) continue;

    pool.push({
      tmdb_id: c.tmdb_id,
      media_type: c.media_type,
      title: c.title,
      year: c.year,
      poster_path: c.poster_path,
      imdb_rating: info.imdb_rating,
      runtime: info.runtime,
      synopsis: c.synopsis,
      ott_platforms: info.ott_platforms,
    });
    if (pool.length >= POOL_SIZE) break;
  }

  return pool;
}

async function persistPool(sessionId: string, round: number, pool: TitlePoolItem[]) {
  if (pool.length === 0) return;
  await supabaseAdmin()
    .from("title_pools")
    .upsert(
      pool.map((p) => ({
        session_id: sessionId,
        round,
        tmdb_id: p.tmdb_id,
        media_type: p.media_type,
        title: p.title,
        year: p.year,
        poster_path: p.poster_path,
        imdb_rating: p.imdb_rating,
        runtime: p.runtime,
        synopsis: p.synopsis,
        ott_platforms: p.ott_platforms as unknown as Json,
      })),
      { onConflict: "session_id,round,tmdb_id" }
    );
}

/**
 * Round 1: merges both partners' preferences via Gemini, pulls TMDB
 * candidates, enriches/filters by real IMDb rating + Indian OTT
 * availability, persists the pool, and flips the session to 'swiping'.
 */
export async function generateRoundOnePool(sessionId: string) {
  const db = supabaseAdmin();

  const [{ data: session }, { data: prefs }] = await Promise.all([
    db.from("sessions").select("pair_id").eq("id", sessionId).single(),
    db.from("preferences").select("*").eq("session_id", sessionId),
  ]);

  const prefsA = toPreferenceInput(prefs?.find((p) => p.partner === "A"));
  const prefsB = toPreferenceInput(prefs?.find((p) => p.partner === "B"));
  if (!prefsA || !prefsB) throw new Error("Both partners must submit preferences first");

  const history = await getPairHistory((session?.pair_id as string) ?? null);
  const brief = await generateSearchBrief(prefsA, prefsB, history);

  const minRating = Math.min(prefsA.minRating, prefsB.minRating);
  const eras = [...new Set([...prefsA.eras, ...prefsB.eras])];
  const languages = [...new Set([...prefsA.languages, ...prefsB.languages])];
  const contentType = prefsA.contentType === "include_series" || prefsB.contentType === "include_series"
    ? "include_series"
    : "movies_only";

  const pool = await buildPool({
    candidatesSource: () => discoverCandidates(brief, contentType, eras, languages),
    minRating,
    excludeTmdbIds: new Set(),
  });

  await persistPool(sessionId, 1, pool);
  await db.from("sessions").update({ status: "swiping" }).eq("id", sessionId);

  return { brief, pool };
}

/**
 * Round 2: reads both partners' round-1 likes, asks Gemini to lean into the
 * pattern, pulls a fresh pool deduped against everything already seen.
 */
export async function generateRoundTwoPool(sessionId: string) {
  const db = supabaseAdmin();

  const [{ data: prefs }, { data: round1Pool }, { data: round1Likes }] = await Promise.all([
    db.from("preferences").select("*").eq("session_id", sessionId),
    db.from("title_pools").select("*").eq("session_id", sessionId).eq("round", 1),
    db.from("swipes").select("tmdb_id, partner").eq("session_id", sessionId).eq("round", 1).eq("direction", "like"),
  ]);

  const prefsA = toPreferenceInput(prefs?.find((p) => p.partner === "A"));
  const prefsB = toPreferenceInput(prefs?.find((p) => p.partner === "B"));
  if (!prefsA || !prefsB) throw new Error("Missing preferences");

  const poolById = new Map((round1Pool ?? []).map((p) => [p.tmdb_id as number, p]));
  const likesByTitle = new Map<number, Partner[]>();
  for (const s of round1Likes ?? []) {
    const arr = likesByTitle.get(s.tmdb_id as number) ?? [];
    arr.push(s.partner as Partner);
    likesByTitle.set(s.tmdb_id as number, arr);
  }

  const likedTitles = [...likesByTitle.entries()].map(([tmdbId, likedBy]) => {
    const p = poolById.get(tmdbId);
    return { title: (p?.title as string) ?? `#${tmdbId}`, synopsis: (p?.synopsis as string) ?? "", likedBy };
  });

  // Re-derive round 1's brief context isn't persisted separately; rebuild a
  // minimal previous-brief shape from stored preferences for continuity.
  const previousBrief = await generateSearchBrief(prefsA, prefsB);
  const brief = await refineFromLikes(likedTitles, previousBrief);

  const minRating = Math.min(prefsA.minRating, prefsB.minRating);
  const eras = [...new Set([...prefsA.eras, ...prefsB.eras])];
  const languages = [...new Set([...prefsA.languages, ...prefsB.languages])];
  const contentType = prefsA.contentType === "include_series" || prefsB.contentType === "include_series"
    ? "include_series"
    : "movies_only";

  const excludeTmdbIds = new Set((round1Pool ?? []).map((p) => p.tmdb_id as number));

  const pool = await buildPool({
    candidatesSource: () => discoverCandidates(brief, contentType, eras, languages),
    minRating,
    excludeTmdbIds,
  });

  await persistPool(sessionId, 2, pool);
  await db.from("sessions").update({ status: "swiping" }).eq("id", sessionId);

  return { brief, pool };
}

function toPreferenceInput(row: Record<string, unknown> | undefined): PreferenceInput | null {
  if (!row) return null;
  return {
    mood: row.mood as PreferenceInput["mood"],
    moodFreetext: row.mood_freetext as string,
    languages: row.languages as PreferenceInput["languages"],
    contentType: row.content_type as PreferenceInput["contentType"],
    minRating: row.min_rating as PreferenceInput["minRating"],
    eras: row.eras as PreferenceInput["eras"],
  };
}
