import { supabaseAdmin } from "./supabase/server";
import type { Json } from "./supabase/database.types";
import { getImdbId } from "./tmdb";
import type { MediaType, OttPlatform } from "./types";

const REGION = "IN";
const CACHE_TTL_HOURS = 36;

export interface EnrichedTitle {
  tmdb_id: number;
  imdb_rating: number | null;
  runtime: number | null;
  ott_platforms: OttPlatform[];
}

function apiHeaders() {
  const key = process.env.RAPIDAPI_KEY;
  const host = process.env.RAPIDAPI_HOST;
  if (!key || !host) throw new Error("RAPIDAPI_KEY / RAPIDAPI_HOST not set");
  return { "x-rapidapi-key": key, "x-rapidapi-host": host, "Content-Type": "application/json" };
}

// The "OTT details" RapidAPI service returns slugs like "primevideo" /
// "sonyliv" rather than display names; humanize anything not in this map.
const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  netflix: "Netflix",
  amazon: "Amazon Video",
  primevideo: "Prime Video",
  hotstar: "Disney+ Hotstar",
  voot: "Voot",
  viu: "Viu",
  jiocinema: "JioCinema",
  zee5: "ZEE5",
  erosnow: "Eros Now",
  play: "Google Play Movies",
  itunes: "Apple iTunes",
  appletv: "Apple TV+",
  mubi: "Mubi",
  sonyliv: "SonyLIV",
  youtube: "YouTube",
  tubitv: "Tubi TV",
  yupptv: "Yupp TV",
  sunnxt: "Sun NXT",
  crunchyroll: "Crunchyroll",
  hoichoi: "Hoichoi",
  altbalaji: "ALTBalaji",
  hungamaplay: "Hungama Play",
};

function humanizePlatform(slug: string): string {
  if (PLATFORM_DISPLAY_NAMES[slug]) return PLATFORM_DISPLAY_NAMES[slug];
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseRuntimeMinutes(runtime: unknown): number | null {
  if (typeof runtime !== "string") return null;
  const match = runtime.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The subscribed RapidAPI plan for this provider is heavily rate-limited —
// bursts of concurrent requests get 429'd almost immediately. Callers are
// serialized (see enrichCandidates) and a 429 here gets one backed-off retry
// before the candidate is dropped, rather than failing the whole pool.
// `deadline` is a hard wall-clock cutoff (ms epoch) — retries are skipped
// once honoring the backoff would blow past it, since a killed serverless
// function never runs the caller's catch/cleanup, unlike a thrown error.
async function fetchFromProvider(
  tmdbId: number,
  mediaType: MediaType,
  deadline: number,
  attempt = 0
): Promise<EnrichedTitle | null> {
  const imdbId = await getImdbId(tmdbId, mediaType);
  if (!imdbId) return null;

  const host = process.env.RAPIDAPI_HOST;
  const url = `https://${host}/gettitleDetails?imdbid=${imdbId}`;

  try {
    const res = await fetch(url, { headers: apiHeaders() });

    if (res.status === 429 && attempt < 2) {
      const retryAfterSec = Number(res.headers.get("retry-after"));
      const backoffMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 1500 * (attempt + 1);
      if (Date.now() + backoffMs > deadline) return null;
      await sleep(backoffMs);
      return fetchFromProvider(tmdbId, mediaType, deadline, attempt + 1);
    }
    if (!res.ok) return null;

    const data = await res.json();

    const regionOffers = data.streamingAvailability?.country?.[REGION] ?? [];
    const platforms: OttPlatform[] = (regionOffers as Array<{ platform: string; url: string }>).map(
      (o) => ({ service: humanizePlatform(o.platform), link: o.url })
    );

    return {
      tmdb_id: tmdbId,
      imdb_rating: typeof data.imdbrating === "number" ? data.imdbrating : null,
      runtime: parseRuntimeMinutes(data.runtime),
      ott_platforms: platforms,
    };
  } catch {
    return null;
  }
}

async function getCached(tmdbId: number): Promise<EnrichedTitle | null> {
  const { data } = await supabaseAdmin()
    .from("title_cache")
    .select("tmdb_id, imdb_rating, runtime, ott_platforms, fetched_at")
    .eq("tmdb_id", tmdbId)
    .eq("region", REGION)
    .maybeSingle();

  if (!data) return null;
  const ageHours = (Date.now() - new Date(data.fetched_at as string).getTime()) / 3_600_000;
  if (ageHours > CACHE_TTL_HOURS) return null;

  return {
    tmdb_id: tmdbId,
    imdb_rating: data.imdb_rating as number | null,
    runtime: data.runtime as number | null,
    ott_platforms: data.ott_platforms as unknown as OttPlatform[],
  };
}

async function writeCache(entry: EnrichedTitle) {
  await supabaseAdmin()
    .from("title_cache")
    .upsert({
      tmdb_id: entry.tmdb_id,
      region: REGION,
      imdb_rating: entry.imdb_rating,
      runtime: entry.runtime,
      ott_platforms: entry.ott_platforms as unknown as Json,
      fetched_at: new Date().toISOString(),
    });
}

/**
 * Enriches candidates with IMDb rating + Indian OTT availability, using a
 * persistent cache first and a bounded, SERIALIZED call budget against the
 * provider for cache misses. The subscribed RapidAPI plan 429s almost
 * immediately under concurrent load, so calls are spaced out rather than
 * fired in parallel — slower, but it actually gets through the budget
 * instead of mostly getting rate-limited.
 *
 * `budgetMs` is a hard wall-clock cap on this whole function, independent of
 * maxProviderCalls — Vercel's serverless timeout kills the process without
 * ever running the caller's catch block, so this always returns whatever it
 * has gathered so far rather than risk running past the platform's limit.
 */
export async function enrichCandidates(
  candidates: { tmdb_id: number; media_type: MediaType }[],
  maxProviderCalls = 25,
  budgetMs = 25000
): Promise<Map<number, EnrichedTitle>> {
  const deadline = Date.now() + budgetMs;
  const result = new Map<number, EnrichedTitle>();
  const misses: typeof candidates = [];

  for (const c of candidates) {
    if (Date.now() > deadline) break;
    const cached = await getCached(c.tmdb_id);
    if (cached) {
      result.set(c.tmdb_id, cached);
    } else {
      misses.push(c);
    }
  }

  const budgeted = misses.slice(0, maxProviderCalls);

  for (const c of budgeted) {
    if (Date.now() > deadline) break;
    const enriched = await fetchFromProvider(c.tmdb_id, c.media_type, deadline);
    if (enriched) {
      result.set(c.tmdb_id, enriched);
      await writeCache(enriched);
    }
    if (Date.now() + 1300 > deadline) break;
    await sleep(1300);
  }

  return result;
}
