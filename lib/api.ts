"use client";

import type { Identity, PreferenceInput, SessionStatus, SwipeDirection, TitlePoolItem } from "./types";

async function j<T>(resPromise: Promise<Response>): Promise<T> {
  const res = await resPromise;
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`request failed (${res.status}): ${text.slice(0, 200) || "empty response"}`);
  }
  if (!res.ok) throw new Error((data.error as string) ?? `request failed (${res.status})`);
  return data as T;
}

export function createSession(preferences: PreferenceInput, pairId: string | null) {
  return j<{ sessionId: string; token: string; role: "A"; pairId: string; pairCode: string }>(
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences, pairId }),
    })
  );
}

export function joinSession(sessionId: string) {
  return j<{ sessionId: string; token: string; role: "B" } | { error: string }>(
    fetch(`/api/sessions/${sessionId}/join`, { method: "POST" })
  );
}

export function getSessionState(sessionId: string) {
  return j<{
    session: { id: string; status: SessionStatus; round: number; error_message: string | null };
    match: { tmdb_id: number; round: number } | null;
  }>(fetch(`/api/sessions/${sessionId}`));
}

export function submitPreferences(identity: Identity, preferences: PreferenceInput) {
  return j<{ ok: true; triggered: boolean }>(
    fetch(`/api/sessions/${identity.sessionId}/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: identity.role, token: identity.token, preferences }),
    })
  );
}

export function retryGeneration(sessionId: string) {
  return j<{ ok: true }>(fetch(`/api/sessions/${sessionId}/retry-generation`, { method: "POST" }));
}

export function getPool(sessionId: string, round: number) {
  return j<{ pool: TitlePoolItem[] }>(fetch(`/api/sessions/${sessionId}/pool?round=${round}`));
}

export function swipe(identity: Identity, round: number, tmdbId: number, direction: SwipeDirection) {
  return j<{ matched: boolean }>(
    fetch(`/api/sessions/${identity.sessionId}/swipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: identity.role, token: identity.token, round, tmdbId, direction }),
    })
  );
}

export function completeRound(identity: Identity, round: number) {
  return j<{ ok: true; next: string | null }>(
    fetch(`/api/sessions/${identity.sessionId}/round-complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: identity.role, token: identity.token, round }),
    })
  );
}

export function getMatch(sessionId: string) {
  return j<{ match: { tmdb_id: number; round: number; matched_at: string; title: TitlePoolItem } | null }>(
    fetch(`/api/sessions/${sessionId}/match`)
  );
}

export function getTopFive(sessionId: string) {
  return j<{
    topFive: (TitlePoolItem & { score: number; likedBy: ("A" | "B")[] })[];
  }>(fetch(`/api/sessions/${sessionId}/top-five`));
}

export function rateTitle(identity: Identity, tmdbId: number, rating: number, review?: string) {
  return j<{ ok: true }>(
    fetch(`/api/sessions/${identity.sessionId}/rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: identity.role, token: identity.token, tmdbId, rating, review }),
    })
  );
}
