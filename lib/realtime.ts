"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabaseBrowser } from "./supabase/client";
import type { SessionStatus } from "./types";

interface SessionLiveState {
  status: SessionStatus;
  round: number;
}

interface MatchBroadcastPayload {
  tmdb_id: number;
  round: number;
}

/**
 * Subscribes to a session's live state: Postgres Changes for status/round
 * transitions (durable, reconnect-safe), plus a Broadcast channel for the
 * match event specifically (lower latency for the "hero moment").
 * `refetch` is called on connect/reconnect so a client that missed an event
 * while backgrounded catches up via a normal fetch.
 */
export function useSessionRealtime(
  sessionId: string,
  initial: SessionLiveState,
  onMatchBroadcast: (payload: MatchBroadcastPayload) => void,
  refetch: () => void
) {
  const [state, setState] = useState<SessionLiveState>(initial);
  const onMatchRef = useRef(onMatchBroadcast);
  onMatchRef.current = onMatchBroadcast;
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`session:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as { status: SessionStatus; round: number };
          setState({ status: row.status, round: row.round });
        }
      )
      .on("broadcast", { event: "match" }, (payload) => {
        onMatchRef.current(payload.payload as MatchBroadcastPayload);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refetchRef.current();
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") refetchRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabaseBrowser.removeChannel(channel);
    };
  }, [sessionId]);

  const setLiveState = useCallback((s: SessionLiveState) => setState(s), []);

  return { state, setLiveState };
}
