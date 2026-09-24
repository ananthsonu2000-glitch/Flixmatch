"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, use as usePromise } from "react";
import { useSearchParams } from "next/navigation";
import PreferenceForm from "@/components/PreferenceForm";
import QRShare from "@/components/QRShare";
import WaitingRoom from "@/components/WaitingRoom";
import SwipeDeck from "@/components/SwipeDeck";
import MatchReveal from "@/components/MatchReveal";
import TopFivePicks from "@/components/TopFivePicks";
import {
  completeRound,
  getMatch,
  getPool,
  getSessionState,
  getTopFive,
  retryGeneration,
  submitPreferences,
  swipe,
} from "@/lib/api";
import { loadIdentity, saveIdentity } from "@/lib/identity";
import { useSessionRealtime } from "@/lib/realtime";
import { seededShuffle } from "@/lib/shuffle";
import type { Identity, PreferenceInput, SessionStatus, SwipeDirection, TitlePoolItem, Partner } from "@/lib/types";

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);

  return (
    <Suspense fallback={<WaitingRoom title="Loading your session…" subtitle="" />}>
      <SessionEntry id={id} />
    </Suspense>
  );
}

function SessionEntry({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const identity = useResolvedIdentity(id, searchParams);

  if (!identity) {
    return (
      <WaitingRoom
        showSpinner={false}
        title="Can't find your invite"
        subtitle="Open this link on the device you started this session with, or scan your partner's QR code."
      />
    );
  }

  return <SessionBootstrap id={id} identity={identity} />;
}

function useResolvedIdentity(id: string, searchParams: URLSearchParams): Identity | null {
  return useMemo(() => {
    const stored = loadIdentity(id);
    if (stored) return stored;

    const token = searchParams.get("t");
    const role = searchParams.get("r") as Partner | null;
    if (token && (role === "A" || role === "B")) {
      const identity: Identity = { sessionId: id, role, token };
      saveIdentity(identity);
      return identity;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
}

/** Fetches the real initial state once, then mounts the realtime-driven flow
 * seeded with it — keeps useSessionRealtime's internal state from ever
 * starting out of sync with the server. */
function SessionBootstrap({ id, identity }: { id: string; identity: Identity }) {
  const [initial, setInitial] = useState<{ status: SessionStatus; round: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessionState(id)
      .then((res) => setInitial({ status: res.session.status, round: res.session.round }))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load session"));
  }, [id]);

  if (error) {
    return <WaitingRoom showSpinner={false} title="Something went wrong" subtitle={error} />;
  }
  if (!initial) {
    return <WaitingRoom title="Loading your session…" subtitle="" />;
  }

  return <SessionFlow id={id} identity={identity} initial={initial} />;
}

function SessionFlow({
  id,
  identity,
  initial,
}: {
  id: string;
  identity: Identity;
  initial: { status: SessionStatus; round: number };
}) {
  const [submittingPrefs, setSubmittingPrefs] = useState(false);
  const [pool, setPool] = useState<TitlePoolItem[] | null>(null);
  const [poolRound, setPoolRound] = useState<number | null>(null);
  const [deckFinishedRound, setDeckFinishedRound] = useState<number | null>(null);
  const [matchTitle, setMatchTitle] = useState<TitlePoolItem | null>(null);
  const [topFive, setTopFive] = useState<(TitlePoolItem & { score: number; likedBy: Partner[] })[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMatch = useCallback(() => {
    getMatch(id).then((res) => {
      if (res.match) setMatchTitle(res.match.title);
    });
  }, [id]);

  const refetch = useCallback(() => {
    getSessionState(id).then((res) => {
      setLiveState({ status: res.session.status, round: res.session.round });
      if (res.match) fetchMatch();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fetchMatch]);

  const { state, setLiveState } = useSessionRealtime(id, initial, () => fetchMatch(), refetch);
  const { status, round } = state;

  // Fetch the pool whenever we enter 'swiping' for a round we haven't loaded yet.
  useEffect(() => {
    if (status !== "swiping") return;
    if (poolRound === round) return;
    setPool(null);
    getPool(id, round).then((res) => {
      const shuffled = seededShuffle(res.pool, `${id}:${identity.role}:${round}`);
      setPool(shuffled);
      setPoolRound(round);
    });
  }, [status, round, poolRound, id, identity.role]);

  useEffect(() => {
    if (status === "matched" && !matchTitle) fetchMatch();
  }, [status, matchTitle, fetchMatch]);

  useEffect(() => {
    if (status === "final_choice" && !topFive) {
      getTopFive(id).then((res) => setTopFive(res.topFive));
    }
  }, [status, topFive, id]);

  if (error) {
    return <WaitingRoom showSpinner={false} title="Something went wrong" subtitle={error} />;
  }

  if (status === "expired") {
    return (
      <WaitingRoom
        showSpinner={false}
        title="This session has expired"
        subtitle="Start a fresh one from the home screen."
      />
    );
  }

  if (status === "waiting_for_b") {
    if (identity.role === "A") {
      const joinUrl = `${window.location.origin}/session/${id}/join`;
      return (
        <div className="flex-1 flex flex-col justify-center px-5 py-10 gap-8">
          <div className="text-center">
            <h1 className="text-2xl font-extrabold gradient-text">You&apos;re in</h1>
            <p className="text-sm text-[var(--text-dim)] mt-2">
              Now bring your partner in — they&apos;ll set their own preferences privately.
            </p>
          </div>
          <QRShare joinUrl={joinUrl} />
        </div>
      );
    }

    const handleSubmit = async (prefs: PreferenceInput) => {
      setSubmittingPrefs(true);
      try {
        await submitPreferences(identity, prefs);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to submit preferences");
        setSubmittingPrefs(false);
      }
    };

    if (submittingPrefs) {
      return <WaitingRoom title="Saving your picks…" subtitle="Finding titles you'll both like, next." />;
    }

    return (
      <main className="flex-1 flex flex-col justify-center px-5 py-10">
        <PreferenceForm
          title="What are you in the mood for?"
          subtitle="Your partner already answered — they can't see your picks, and you can't see theirs."
          submitLabel="Submit my preferences"
          submitting={submittingPrefs}
          onSubmit={handleSubmit}
        />
      </main>
    );
  }

  if (status === "both_submitted" || status === "generating_brief") {
    return (
      <WaitingRoomWithRetry
        sessionId={id}
        title="Finding tonight's shortlist"
        subtitle="Reading both your moods and pulling 30 titles you'll both actually want to watch, with real ratings and where to stream them."
      />
    );
  }

  if (status === "swiping") {
    if (!pool) {
      return <WaitingRoom title="Shuffling your deck…" subtitle="" />;
    }

    if (deckFinishedRound === round) {
      return (
        <WaitingRoom
          title="You're all caught up"
          subtitle="Waiting for your partner to finish swiping this round…"
        />
      );
    }

    const handleSwipe = async (item: TitlePoolItem, direction: SwipeDirection) => {
      return swipe(identity, round, item.tmdb_id, direction);
    };

    const handleDeckFinished = async () => {
      setDeckFinishedRound(round);
      try {
        await completeRound(identity, round);
      } catch {
        // realtime/refetch will still catch the transition on the other side
      }
    };

    return <SwipeDeck pool={pool} onSwipe={handleSwipe} onDeckFinished={handleDeckFinished} />;
  }

  if (status === "matched") {
    if (!matchTitle) return <WaitingRoom title="Loading your match…" subtitle="" />;
    return <MatchReveal title={matchTitle} identity={identity} />;
  }

  if (status === "final_choice") {
    if (!topFive) return <WaitingRoom title="Tallying your picks…" subtitle="" />;
    return <TopFivePicks items={topFive} />;
  }

  return null;
}

function WaitingRoomWithRetry({
  sessionId,
  title,
  subtitle,
}: {
  sessionId: string;
  title: string;
  subtitle: string;
}) {
  const [showRetry, setShowRetry] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setShowRetry(true), 25000);
    return () => clearTimeout(t);
  }, []);

  // Poll for a stored failure reason so a stuck generation shows *why*
  // instead of just "taking a while" forever.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getSessionState(sessionId).then((res) => {
        if (!cancelled) setLastError(res.session.error_message);
      });
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <WaitingRoom title={title} subtitle={subtitle} />
      {lastError && (
        <p className="text-sm text-[var(--pass)] max-w-sm">Last attempt failed: {lastError}</p>
      )}
      {showRetry && (
        <button
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            try {
              await retryGeneration(sessionId);
            } catch {
              // ignore — realtime will reflect the actual state
            } finally {
              setRetrying(false);
            }
          }}
          className="btn-secondary rounded-full px-5 py-2 text-sm"
        >
          {retrying ? "Retrying…" : "Taking a while — try again"}
        </button>
      )}
    </div>
  );
}
