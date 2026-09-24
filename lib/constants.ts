import type { Era, Language, MinRating, Mood } from "./types";

export const MOOD_OPTIONS: { value: Mood; label: string; emoji: string }[] = [
  { value: "light_fun", label: "Light & fun", emoji: "🎈" },
  { value: "intense_gripping", label: "Intense & gripping", emoji: "🔥" },
  { value: "scary", label: "Scary", emoji: "👻" },
  { value: "romantic", label: "Romantic", emoji: "💕" },
  { value: "other", label: "Other", emoji: "✨" },
];

export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "hindi", label: "Hindi" },
  { value: "english", label: "English" },
  { value: "tamil", label: "Tamil" },
  { value: "telugu", label: "Telugu" },
  { value: "kannada", label: "Kannada" },
  { value: "any", label: "Any" },
];

export const ERA_OPTIONS: { value: Era; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "classic", label: "Classic (pre-2000)" },
  { value: "2000_2020", label: "2000–2020" },
  { value: "recent", label: "Recent (2021–2026)" },
];

export const MIN_RATING_OPTIONS: { value: MinRating; label: string; caveat?: string }[] = [
  { value: 6, label: "6+" },
  { value: 7, label: "7+" },
  { value: 8, label: "8+" },
  { value: 9, label: "9+", caveat: "very few titles" },
];
