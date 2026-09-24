"use client";

import type { Identity, Partner } from "./types";

const IDENTITY_PREFIX = "matchmaker:identity:";
const PAIR_ID_KEY = "matchmaker:pairId";
const PAIR_CODE_KEY = "matchmaker:pairCode";

export function saveIdentity(identity: Identity) {
  try {
    localStorage.setItem(IDENTITY_PREFIX + identity.sessionId, JSON.stringify(identity));
  } catch {
    // ignore (private browsing etc.) — URL param fallback still carries it
  }
}

export function loadIdentity(sessionId: string): Identity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_PREFIX + sessionId);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function existingRoleFor(sessionId: string): Partner | null {
  return loadIdentity(sessionId)?.role ?? null;
}

export function getDevicePairId(): string | null {
  try {
    return localStorage.getItem(PAIR_ID_KEY);
  } catch {
    return null;
  }
}

export function saveDevicePairId(pairId: string, pairCode: string) {
  try {
    localStorage.setItem(PAIR_ID_KEY, pairId);
    localStorage.setItem(PAIR_CODE_KEY, pairCode);
  } catch {
    // ignore
  }
}

export function getSavedPairCode(): string | null {
  try {
    return localStorage.getItem(PAIR_CODE_KEY);
  } catch {
    return null;
  }
}
