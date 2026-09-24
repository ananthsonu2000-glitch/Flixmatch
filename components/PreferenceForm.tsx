"use client";

import { useState } from "react";
import { ERA_OPTIONS, LANGUAGE_OPTIONS, MIN_RATING_OPTIONS, MOOD_OPTIONS } from "@/lib/constants";
import type { ContentType, Era, Language, MinRating, Mood, PreferenceInput } from "@/lib/types";

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export default function PreferenceForm({
  title,
  subtitle,
  submitLabel,
  onSubmit,
  submitting,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
  onSubmit: (prefs: PreferenceInput) => void;
  submitting?: boolean;
}) {
  const [mood, setMood] = useState<Mood[]>([]);
  const [moodFreetext, setMoodFreetext] = useState("");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [contentType, setContentType] = useState<ContentType>("movies_only");
  const [minRating, setMinRating] = useState<MinRating>(6);
  const [eras, setEras] = useState<Era[]>([]);

  const toggleLanguage = (value: Language) => {
    if (value === "any") {
      setLanguages(["any"]);
    } else {
      setLanguages((prev) => toggleInArray(prev.filter((l) => l !== "any"), value));
    }
  };

  const toggleEra = (value: Era) => {
    if (value === "any") {
      setEras(["any"]);
    } else {
      setEras((prev) => toggleInArray(prev.filter((e) => e !== "any"), value));
    }
  };

  const valid = mood.length > 0 && languages.length > 0 && eras.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    onSubmit({ mood, moodFreetext, languages, contentType, minRating, eras });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto flex flex-col gap-7">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold gradient-text">{title}</h1>
        <p className="text-sm text-[var(--text-dim)] mt-1">{subtitle}</p>
      </div>

      <Section label="What's the mood tonight?" hint="pick as many as fit">
        <div className="flex flex-wrap gap-2">
          {MOOD_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              selected={mood.includes(opt.value)}
              onClick={() => setMood((prev) => toggleInArray(prev, opt.value))}
            >
              <span className="mr-1">{opt.emoji}</span>
              {opt.label}
            </Chip>
          ))}
        </div>
        <textarea
          value={moodFreetext}
          onChange={(e) => setMoodFreetext(e.target.value)}
          placeholder="Describe what you're in the mood for tonight (optional)"
          rows={2}
          className="mt-3 w-full rounded-xl px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-dim)] resize-none"
        />
      </Section>

      <Section label="Language">
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((opt) => (
            <Chip key={opt.value} selected={languages.includes(opt.value)} onClick={() => toggleLanguage(opt.value)}>
              {opt.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section label="What are we watching?">
        <div className="grid grid-cols-2 gap-2">
          <SegmentButton selected={contentType === "movies_only"} onClick={() => setContentType("movies_only")}>
            Movies only
          </SegmentButton>
          <SegmentButton selected={contentType === "include_series"} onClick={() => setContentType("include_series")}>
            Include series
          </SegmentButton>
        </div>
      </Section>

      <Section label="Minimum IMDb rating">
        <div className="grid grid-cols-4 gap-2">
          {MIN_RATING_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex flex-col items-center gap-1">
              <SegmentButton selected={minRating === opt.value} onClick={() => setMinRating(opt.value)}>
                {opt.label}
              </SegmentButton>
              {opt.caveat && minRating === opt.value && (
                <span className="text-[10px] text-[var(--accent-2)] text-center leading-tight">{opt.caveat}</span>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section label="Era">
        <div className="flex flex-wrap gap-2">
          {ERA_OPTIONS.map((opt) => (
            <Chip key={opt.value} selected={eras.includes(opt.value)} onClick={() => toggleEra(opt.value)}>
              {opt.label}
            </Chip>
          ))}
        </div>
      </Section>

      <button
        type="submit"
        disabled={!valid || submitting}
        className="btn-primary rounded-full py-3.5 text-base mt-2"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm font-semibold text-[var(--text)]">{label}</label>
        {hint && <span className="text-xs text-[var(--text-dim)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-selected={selected}
      onClick={onClick}
      className="chip rounded-full px-3.5 py-1.5 text-sm"
    >
      {children}
    </button>
  );
}

function SegmentButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-selected={selected}
      onClick={onClick}
      className="chip rounded-xl py-2.5 text-sm font-medium text-center"
    >
      {children}
    </button>
  );
}
