# Tonight — a movie/TV matchmaker for two

Two people set their preferences privately, Gemini merges both into a search
brief, TMDB supplies candidates, and a RapidAPI streaming-availability service
filters by real IMDb rating and current Indian OTT availability. Both partners
swipe the same 30-title pool (independently shuffled) until a mutual like
produces a synchronized match — with a direct link to watch it tonight.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open the SQL editor and run the contents of [`supabase/schema.sql`](supabase/schema.sql)
   once. This creates all tables, the atomic RPC functions used for race-free
   swiping/matching, RLS policies, and enables Realtime on `sessions` and
   `matches`.
3. From Project Settings → API, copy the Project URL, the `anon` public key,
   and the `service_role` secret key.

### 3. Get the other API keys

| Key | Where to get it |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `TMDB_API_KEY` | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) (free) |
| `RAPIDAPI_KEY` / `RAPIDAPI_HOST` | Subscribe to the [OTT details](https://rapidapi.com/gox-ai-gox-ai-default/api/ott-details) API on RapidAPI (`RAPIDAPI_HOST=ott-details.p.rapidapi.com`). It identifies titles by IMDb id, so `lib/tmdb.ts` looks up each candidate's IMDb id via TMDB's free `external_ids` endpoint first. |

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill in every value. Never commit
`.env.local` — it's already gitignored.

```bash
cp .env.example .env.local
```

### 5. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Partner A fills the form
there; the app then shows a QR code / invite link for Partner B to open on
their own device.

## How the pieces fit together

- **`supabase/schema.sql`** — all tables plus four Postgres functions
  (`claim_partner_b`, `submit_preferences`, `record_swipe`, `complete_round`)
  that make session joining, preference submission, swipe/match detection,
  and round advancement atomic — no read-then-write races between two
  partners acting near-simultaneously.
- **`lib/pool-generation.ts`** — orchestrates Gemini (search brief) → TMDB
  (candidates) → RapidAPI (real IMDb rating + Indian OTT links, cached in
  `title_cache`) → a 30-title pool.
- **`lib/realtime.ts`** — Postgres Changes on `sessions` drives ordinary state
  transitions; a Supabase Broadcast fired the instant a match is detected
  (see `lib/broadcastMatch.ts`) gives the "both screens light up together"
  moment lower latency than waiting on the database replication stream.
- **No accounts** — each session issues a per-partner token stored in
  localStorage (and mirrored in the URL as a fallback), so one partner can't
  write on behalf of the other. Returning-couple history is linked via a
  `pairId` silently persisted on the creating partner's device.

## Verified live, with real keys

The full loop below was exercised end-to-end against the real Gemini, TMDB,
RapidAPI and Supabase services (not mocks): preference submission for both
partners (independently, privacy preserved) → Gemini brief generation → TMDB
candidate discovery → RapidAPI IMDb rating/OTT enrichment → swipe deck →
mutual-like match detection (atomic RPC) → realtime match reveal with a real
Netflix deep link → post-watch rating persisted → round-completion and
round-2/top-5 fallback scoring (verified at the data layer). Two issues came
up during that testing and are already fixed in the code:

- **Gemini model name**: the SDK call originally targeted a model that's been
  retired; `lib/gemini.ts` now targets `gemini-3.6-flash` and retries on the
  provider's transient 503 ("high demand") responses.
- **RapidAPI rate limiting**: the subscribed "OTT details" API plan rejects
  concurrent requests almost immediately (HTTP 429), so `lib/streamingAvailability.ts`
  calls it **serially** with spacing and a backoff-retry, rather than in
  parallel.

### ⚠️ RapidAPI plan is the real constraint on pool size

The "OTT details" API's **free/BASIC tier caps out at 120 requests per month**,
separate from its aggressive per-request rate limiting. In testing, a single
cold pool generation (no cache hits yet) could only get a handful of titles
enriched before hitting 429s, even serialized — nowhere near a reliable 30.
The persistent `title_cache` table means repeat sessions get cheaper over
time (cache hits cost zero API calls), but for consistently full 30-title
pools you'll likely need to upgrade to at least the **PRO ($10/mo)** tier on
RapidAPI for that API. This is a plan/quota limitation, not a code bug.

## Suggested next check

1. Force a no-match round (pass on everything) on both sides live in the
   browser and confirm round 2 generates and the UI transitions correctly —
   this was verified at the database/RPC level but not click-by-click through
   the live UI, since it would have cost another full round of scarce RapidAPI
   quota.
2. Watch actual pool sizes over a few real sessions as `title_cache` warms up.
