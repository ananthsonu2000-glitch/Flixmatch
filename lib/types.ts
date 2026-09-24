export type Partner = "A" | "B";

export type Mood = "light_fun" | "intense_gripping" | "scary" | "romantic" | "other";

export type Language = "hindi" | "english" | "tamil" | "telugu" | "kannada" | "any";

export type ContentType = "movies_only" | "include_series";

export type Era = "any" | "classic" | "2000_2020" | "recent";

export type MinRating = 6 | 7 | 8 | 9;

export type SessionStatus =
  | "waiting_for_b"
  | "both_submitted"
  | "generating_brief"
  | "swiping"
  | "matched"
  | "final_choice"
  | "expired";

export interface PreferenceInput {
  mood: Mood[];
  moodFreetext: string;
  languages: Language[];
  contentType: ContentType;
  minRating: MinRating;
  eras: Era[];
}

export interface SessionRecord {
  id: string;
  pair_id: string | null;
  status: SessionStatus;
  round: number;
  partnerA_claimed: boolean;
  partnerB_claimed: boolean;
  expires_at: string;
  created_at: string;
}

export interface Identity {
  sessionId: string;
  role: Partner;
  token: string;
}

export type MediaType = "movie" | "tv";

export interface OttPlatform {
  service: string; // e.g. "Netflix", "Prime Video"
  link: string;
}

export interface TitlePoolItem {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  year: number | null;
  poster_path: string | null;
  imdb_rating: number | null;
  runtime: number | null;
  synopsis: string;
  ott_platforms: OttPlatform[];
}

export type SwipeDirection = "like" | "pass";

export interface SearchBrief {
  tmdbGenres: number[];
  keywords: string[];
  languages: string[]; // ISO 639-1 codes
  excludedGenres: number[];
  toneSummary: string;
}
