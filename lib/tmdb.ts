import type { ContentType, Era, MediaType, SearchBrief } from "./types";

const BASE = "https://api.themoviedb.org/3";

function apiKey() {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set");
  return key;
}

export interface TmdbCandidate {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  year: number | null;
  poster_path: string | null;
  synopsis: string;
  vote_average: number;
  popularity: number;
}

function eraDateRange(era: Era): { gte?: string; lte?: string } {
  switch (era) {
    case "classic":
      return { lte: "1999-12-31" };
    case "2000_2020":
      return { gte: "2000-01-01", lte: "2020-12-31" };
    case "recent":
      return { gte: "2021-01-01", lte: "2026-12-31" };
    default:
      return {};
  }
}

function mergedDateRange(eras: Era[]): { gte?: string; lte?: string } {
  const active = eras.filter((e) => e !== "any");
  if (active.length === 0) return {};
  const ranges = active.map(eraDateRange);
  const gte = ranges.map((r) => r.gte).filter(Boolean).sort()[0];
  const lte = ranges.map((r) => r.lte).filter(Boolean).sort().pop();
  return { gte, lte };
}

const LANGUAGE_CODES: Record<string, string> = {
  hindi: "hi",
  english: "en",
  tamil: "ta",
  telugu: "te",
  kannada: "kn",
};

export function languagesToCodes(languages: string[]): string[] {
  const codes = languages
    .filter((l) => l !== "any")
    .map((l) => LANGUAGE_CODES[l])
    .filter(Boolean);
  return codes;
}

async function discoverOne(
  mediaType: MediaType,
  params: Record<string, string>,
  page: number
): Promise<TmdbCandidate[]> {
  const url = new URL(`${BASE}/discover/${mediaType}`);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("sort_by", "popularity.desc");
  url.searchParams.set("page", String(page));
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`TMDB discover/${mediaType} failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();

  return (data.results ?? []).map(
    (r: {
      id: number;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path: string | null;
      overview: string;
      vote_average: number;
      popularity: number;
    }) => ({
      tmdb_id: r.id,
      media_type: mediaType,
      title: r.title ?? r.name ?? "Untitled",
      year: parseYear(r.release_date ?? r.first_air_date),
      poster_path: r.poster_path,
      synopsis: r.overview,
      vote_average: r.vote_average,
      popularity: r.popularity,
    })
  );
}

/**
 * The OTT/rating enrichment provider identifies titles by IMDb id, not TMDB
 * id, so every candidate needs this lookup before it can be enriched. TMDB
 * exposes it for free via each title's external_ids.
 */
export async function getImdbId(tmdbId: number, mediaType: MediaType): Promise<string | null> {
  const url = new URL(`${BASE}/${mediaType}/${tmdbId}/external_ids`);
  url.searchParams.set("api_key", apiKey());

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.imdb_id === "string" && data.imdb_id ? data.imdb_id : null;
  } catch {
    return null;
  }
}

function parseYear(date?: string): number | null {
  if (!date) return null;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

/**
 * Pulls discover candidates across a few pages for each requested media type,
 * ordered by popularity. Caller filters/enriches (rating, OTT) downstream.
 */
export async function discoverCandidates(
  brief: SearchBrief,
  contentType: ContentType,
  eras: Era[],
  languages: string[],
  pages = 4
): Promise<TmdbCandidate[]> {
  const { gte, lte } = mergedDateRange(eras);
  const dateKeyMovie = { gte: "primary_release_date.gte", lte: "primary_release_date.lte" };
  const dateKeyTv = { gte: "first_air_date.gte", lte: "first_air_date.lte" };
  const withGenres = brief.tmdbGenres.join(",");
  const withoutGenres = brief.excludedGenres.join(",");
  const langCodes = languagesToCodes(languages.length ? languages : brief.languages);
  const withOriginalLanguage = langCodes.length === 1 ? langCodes[0] : undefined;

  const mediaTypes: MediaType[] = contentType === "movies_only" ? ["movie"] : ["movie", "tv"];

  const results: TmdbCandidate[] = [];
  for (const mediaType of mediaTypes) {
    const dateKeys = mediaType === "movie" ? dateKeyMovie : dateKeyTv;
    for (let page = 1; page <= pages; page++) {
      const params: Record<string, string> = {
        with_genres: withGenres,
        without_genres: withoutGenres,
      };
      if (gte) params[dateKeys.gte] = gte;
      if (lte) params[dateKeys.lte] = lte;
      if (withOriginalLanguage) params.with_original_language = withOriginalLanguage;

      try {
        const page_results = await discoverOne(mediaType, params, page);
        results.push(...page_results);
      } catch {
        // one bad page shouldn't kill the whole pool
      }
    }

    // If multiple languages requested, run one discover pass per language too
    // (with_original_language only accepts a single code).
    if (langCodes.length > 1) {
      for (const code of langCodes) {
        try {
          const page_results = await discoverOne(
            mediaType,
            { with_genres: withGenres, without_genres: withoutGenres, with_original_language: code },
            1
          );
          results.push(...page_results);
        } catch {
          // skip
        }
      }
    }
  }

  // De-dupe by tmdb_id+media_type, keep most popular first.
  const seen = new Set<string>();
  const deduped: TmdbCandidate[] = [];
  for (const c of results.sort((a, b) => b.popularity - a.popularity)) {
    const key = `${c.media_type}:${c.tmdb_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped;
}
