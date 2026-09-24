"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import confetti from "canvas-confetti";
import type { Identity, OttPlatform, TitlePoolItem } from "@/lib/types";
import { rateTitle } from "@/lib/api";

export default function MatchReveal({ title, identity }: { title: TitlePoolItem; identity: Identity }) {
  const [rated, setRated] = useState(false);
  const [rating, setRating] = useState(0);
  const [showRating, setShowRating] = useState(false);

  useEffect(() => {
    const duration = 1200;
    const end = Date.now() + duration;
    const colors = ["#ff5470", "#ff8a5b", "#7c5cff", "#2ee6a6"];
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }, []);

  const submitRating = async (value: number) => {
    setRating(value);
    await rateTitle(identity, title.tmdb_id, value);
    setRated(true);
  };

  return (
    <div className="flex-1 flex flex-col items-center px-5 pb-8 pt-6 overflow-y-auto">
      <p className="uppercase tracking-[0.3em] text-xs font-bold gradient-text mb-3">It&apos;s a match</p>

      <div className="relative w-full max-w-xs aspect-[2/3] rounded-3xl overflow-hidden card-shell shadow-2xl">
        {title.poster_path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w780${title.poster_path}`}
            alt={title.title}
            fill
            className="object-cover"
            sizes="320px"
          />
        ) : (
          <div className="w-full h-full bg-[var(--surface-2)]" />
        )}
      </div>

      <h2 className="text-2xl font-extrabold text-center mt-5">{title.title}</h2>
      <div className="flex items-center gap-3 text-sm text-[var(--text-dim)] mt-1">
        {title.year && <span>{title.year}</span>}
        {title.imdb_rating != null && <span className="text-amber-400 font-semibold">★ {title.imdb_rating.toFixed(1)}</span>}
        {title.runtime && <span>{title.runtime} min</span>}
      </div>
      <p className="text-sm text-[var(--text-dim)] text-center mt-3 max-w-sm">{title.synopsis}</p>

      <div className="w-full max-w-sm mt-6">
        <h3 className="text-sm font-semibold mb-2">Watch it now on</h3>
        <OttList platforms={title.ott_platforms} />
      </div>

      <div className="w-full max-w-sm mt-8">
        {!showRating ? (
          <button onClick={() => setShowRating(true)} className="btn-secondary rounded-full py-3 text-sm w-full">
            Watched it? Rate it for next time
          </button>
        ) : (
          <div className="card-shell rounded-2xl p-4 flex flex-col items-center gap-3">
            {rated ? (
              <p className="text-sm text-[var(--like)] font-medium">Saved — thanks!</p>
            ) : (
              <>
                <p className="text-sm text-[var(--text-dim)]">How was it?</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => submitRating(n)}
                      className={`text-2xl transition-transform active:scale-90 ${
                        n <= rating ? "grayscale-0" : "grayscale opacity-50"
                      }`}
                    >
                      ⭐
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OttList({ platforms }: { platforms: OttPlatform[] }) {
  if (!platforms || platforms.length === 0) {
    return (
      <p className="text-sm text-[var(--text-dim)] card-shell rounded-xl px-3 py-3">
        No current Indian streaming availability found for this title.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {platforms.map((p, i) => (
        <a
          key={`${p.service}-${i}`}
          href={p.link}
          target="_blank"
          rel="noopener noreferrer"
          className="card-shell rounded-xl px-4 py-3 flex items-center justify-between hover:border-[var(--accent)] transition-colors"
        >
          <p className="font-semibold text-sm">{p.service}</p>
          <span className="text-[var(--accent-2)] text-sm font-medium">Open →</span>
        </a>
      ))}
    </div>
  );
}
