"use client";

import Image from "next/image";
import type { TitlePoolItem, Partner } from "@/lib/types";

type TopFiveItem = TitlePoolItem & { score: number; likedBy: Partner[] };

export default function TopFivePicks({ items }: { items: TopFiveItem[] }) {
  return (
    <div className="flex-1 flex flex-col items-center px-5 pb-8 pt-6 overflow-y-auto">
      <p className="uppercase tracking-[0.3em] text-xs font-bold gradient-text mb-2">No mutual match yet</p>
      <h2 className="text-2xl font-extrabold text-center">You two decide</h2>
      <p className="text-sm text-[var(--text-dim)] text-center mt-2 max-w-sm">
        Two rounds down, no perfect overlap. Here are the top 5 by what you each responded to —
        pick one together.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--text-dim)] mt-8">No liked titles to rank yet.</p>
      ) : (
        <div className="w-full max-w-sm flex flex-col gap-3 mt-6">
          {items.map((item, i) => (
            <div key={item.tmdb_id} className="card-shell rounded-2xl p-3 flex gap-3">
              <div className="relative w-16 h-24 rounded-lg overflow-hidden shrink-0 bg-[var(--surface-2)]">
                {item.poster_path && (
                  <Image
                    src={`https://image.tmdb.org/t/p/w185${item.poster_path}`}
                    alt={item.title}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--accent-2)]">#{i + 1}</span>
                  <h3 className="font-bold text-sm truncate">{item.title}</h3>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--text-dim)] mt-0.5">
                  {item.year && <span>{item.year}</span>}
                  {item.imdb_rating != null && <span className="text-amber-400">★ {item.imdb_rating.toFixed(1)}</span>}
                </div>
                <p className="text-xs text-[var(--text-dim)] line-clamp-2 mt-1">{item.synopsis}</p>
                <p className="text-xs mt-1.5 font-medium text-[var(--like)]">
                  Liked by {item.likedBy.map((p) => (p === "A" ? "Partner A" : "Partner B")).join(" & ")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
