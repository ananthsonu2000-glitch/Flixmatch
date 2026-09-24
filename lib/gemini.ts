import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import type { PreferenceInput, SearchBrief, TitlePoolItem, Partner } from "./types";

const briefSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    tmdbGenres: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.INTEGER },
      description: "TMDB genre ids that fit both partners' moods and content type.",
    },
    keywords: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Free-text TMDB keyword search terms capturing mood nuance.",
    },
    languages: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "ISO 639-1 original-language codes to search (e.g. hi, en, ta, te, kn).",
    },
    excludedGenres: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.INTEGER },
      description: "TMDB genre ids to actively avoid (e.g. horror if one partner is not up for scary).",
    },
    toneSummary: {
      type: SchemaType.STRING,
      description: "One sentence describing the tone both partners will agree on tonight.",
    },
  },
  required: ["tmdbGenres", "keywords", "languages", "excludedGenres", "toneSummary"],
};

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(apiKey);
}

function briefModel() {
  return client().getGenerativeModel({
    model: "gemini-3.6-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: briefSchema,
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The hosted model intermittently returns 503 ("high demand") — worth a
// couple of backed-off retries rather than failing the whole brief step.
async function generateBrief(prompt: string): Promise<SearchBrief> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await briefModel().generateContent(prompt);
      return JSON.parse(result.response.text()) as SearchBrief;
    } catch (err) {
      lastError = err;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError;
}

const TMDB_GENRE_REFERENCE = `
Movie genres: 28 Action, 12 Adventure, 16 Animation, 35 Comedy, 80 Crime,
99 Documentary, 18 Drama, 10751 Family, 14 Fantasy, 36 History, 27 Horror,
10402 Music, 9648 Mystery, 10749 Romance, 878 Science Fiction, 10770 TV Movie,
53 Thriller, 10752 War, 37 Western.
TV genres: 10759 Action & Adventure, 16 Animation, 35 Comedy, 80 Crime,
99 Documentary, 18 Drama, 10751 Family, 10762 Kids, 9648 Mystery,
10763 News, 10764 Reality, 10765 Sci-Fi & Fantasy, 10766 Soap, 10767 Talk,
10768 War & Politics, 37 Western.
`;

function describePrefs(label: string, p: PreferenceInput) {
  return `${label}:
- Moods: ${p.mood.join(", ") || "none specified"}
- Free-text mood: "${p.moodFreetext || "(none)"}"
- Languages: ${p.languages.join(", ")}
- Content type: ${p.contentType}
- Minimum IMDb rating: ${p.minRating}+
- Era: ${p.eras.join(", ")}`;
}

export interface PairHistorySummary {
  enjoyed: string[]; // titles rated highly
  disliked: string[]; // titles rated poorly or passed on repeatedly
}

export async function generateSearchBrief(
  prefsA: PreferenceInput,
  prefsB: PreferenceInput,
  history?: PairHistorySummary
): Promise<SearchBrief> {
  const historyBlock = history
    ? `\nThis couple has watched together before.
Titles they rated highly: ${history.enjoyed.join(", ") || "none yet"}.
Titles that fell flat: ${history.disliked.join(", ") || "none yet"}.
Use this to inform taste, but tonight's stated mood always takes priority.`
    : "";

  const prompt = `You are building a movie/TV search brief that will satisfy TWO partners
watching together tonight in India. Merge their preferences into ONE brief that
respects both people's constraints (never suggest something one partner
explicitly ruled out) while leaning into the overlap and nuance of their free-text
mood descriptions.

${describePrefs("Partner A", prefsA)}

${describePrefs("Partner B", prefsB)}
${historyBlock}

${TMDB_GENRE_REFERENCE}

Return TMDB genre ids (movie or tv depending on content type requested),
a short list of keyword search terms that capture the mood nuance from the
free-text fields, the ISO 639-1 language codes to search, any genres to
exclude, and a one-sentence tone summary.`;

  return generateBrief(prompt);
}

export async function refineFromLikes(
  likedTitles: { title: string; synopsis: string; likedBy: Partner[] }[],
  previousBrief: SearchBrief
): Promise<SearchBrief> {
  const likesBlock = likedTitles
    .map((t) => `- "${t.title}" (liked by ${t.likedBy.join(" & ")}): ${t.synopsis}`)
    .join("\n");

  const prompt = `Round 1 of a couple's movie-matching session produced no mutual match, but
here is what each partner liked individually. Build a refined search brief
for round 2 that leans into the patterns below — genres, tone, and themes
these titles share — while staying within the original constraints.

Previous brief tone: "${previousBrief.toneSummary}"
Previous languages: ${previousBrief.languages.join(", ")}

Titles liked in round 1:
${likesBlock || "(no likes recorded)"}

${TMDB_GENRE_REFERENCE}

Return an updated brief in the same shape, biased toward what was actually liked.`;

  return generateBrief(prompt);
}

export function summarizePairHistory(
  ratedTitles: { title: string; avgRating: number }[]
): PairHistorySummary {
  return {
    enjoyed: ratedTitles.filter((t) => t.avgRating >= 4).map((t) => t.title),
    disliked: ratedTitles.filter((t) => t.avgRating <= 2).map((t) => t.title),
  };
}

export type { TitlePoolItem };
