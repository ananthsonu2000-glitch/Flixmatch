"use client";

import { useMemo, useState } from "react";
import SwipeCard from "./SwipeCard";
import type { SwipeDirection, TitlePoolItem } from "@/lib/types";

const VISIBLE_STACK = 3;

export default function SwipeDeck({
  pool,
  onSwipe,
  onDeckFinished,
}: {
  pool: TitlePoolItem[];
  onSwipe: (item: TitlePoolItem, direction: SwipeDirection) => Promise<{ matched: boolean }>;
  onDeckFinished: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const remaining = pool.length - index;
  const visible = useMemo(() => pool.slice(index, index + VISIBLE_STACK), [pool, index]);

  const advance = async (item: TitlePoolItem, direction: SwipeDirection) => {
    if (busy) return;
    setBusy(true);
    try {
      await onSwipe(item, direction);
    } finally {
      setBusy(false);
      const next = index + 1;
      setIndex(next);
      if (next >= pool.length) onDeckFinished();
    }
  };

  const current = pool[index];

  if (!current) return null;

  return (
    <div className="flex-1 flex flex-col items-center px-5 pb-6 pt-2">
      <div className="w-full max-w-sm flex items-center justify-between text-xs text-[var(--text-dim)] mb-3 px-1">
        <span>{remaining} left</span>
        <div className="h-1 flex-1 mx-3 rounded-full bg-[var(--surface)] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-all"
            style={{ width: `${(index / pool.length) * 100}%` }}
          />
        </div>
        <span>{pool.length}</span>
      </div>

      <div className="relative w-full max-w-sm aspect-[3/4.6]">
        {visible.map((item, i) => (
          <SwipeCard
            key={item.tmdb_id}
            item={item}
            isTop={i === 0}
            zIndex={visible.length - i}
            stackOffset={i}
            onSwiped={(direction) => advance(item, direction)}
          />
        ))}
      </div>

      <div className="flex items-center gap-6 mt-6">
        <button
          aria-label="Pass"
          disabled={busy}
          onClick={() => advance(current, "pass")}
          className="w-16 h-16 rounded-full btn-secondary flex items-center justify-center text-2xl text-[var(--pass)] disabled:opacity-40"
        >
          ✕
        </button>
        <button
          aria-label="Like"
          disabled={busy}
          onClick={() => advance(current, "like")}
          className="w-16 h-16 rounded-full btn-primary flex items-center justify-center text-2xl disabled:opacity-40"
        >
          ♥
        </button>
      </div>
    </div>
  );
}
