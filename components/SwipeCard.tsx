"use client";

import Image from "next/image";
import { motion, useAnimation, useMotionValue, useTransform, PanInfo } from "framer-motion";
import type { TitlePoolItem } from "@/lib/types";

const SWIPE_THRESHOLD = 120;

export default function SwipeCard({
  item,
  isTop,
  onSwiped,
  zIndex,
  stackOffset,
}: {
  item: TitlePoolItem;
  isTop: boolean;
  onSwiped: (direction: "like" | "pass") => void;
  zIndex: number;
  stackOffset: number;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-18, 18]);
  const likeOpacity = useTransform(x, [20, 120], [0, 1]);
  const passOpacity = useTransform(x, [-120, -20], [1, 0]);
  const controls = useAnimation();

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_THRESHOLD) {
      controls.start({ x: 600, rotate: 25, opacity: 0, transition: { duration: 0.35 } }).then(() =>
        onSwiped("like")
      );
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      controls.start({ x: -600, rotate: -25, opacity: 0, transition: { duration: 0.35 } }).then(() =>
        onSwiped("pass")
      );
    } else {
      controls.start({ x: 0, rotate: 0, transition: { type: "spring", stiffness: 400, damping: 30 } });
    }
  };

  return (
    <motion.div
      className="absolute inset-0"
      style={{
        x: isTop ? x : 0,
        rotate: isTop ? rotate : 0,
        zIndex,
      }}
      animate={
        !isTop
          ? { scale: 1 - stackOffset * 0.04, y: stackOffset * 12, opacity: stackOffset > 2 ? 0 : 1 }
          : controls
      }
      initial={false}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={1}
      onDragEnd={isTop ? handleDragEnd : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <div className="card-shell relative w-full h-full rounded-3xl overflow-hidden select-none shadow-2xl">
        {item.poster_path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w780${item.poster_path}`}
            alt={item.title}
            fill
            sizes="(max-width: 480px) 100vw, 420px"
            className="object-cover pointer-events-none"
            draggable={false}
            priority={isTop}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[var(--surface-2)] text-[var(--text-dim)]">
            No poster
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/40" />

        {isTop && (
          <>
            <motion.div
              style={{ opacity: likeOpacity }}
              className="absolute top-8 left-6 rotate-[-12deg] border-4 border-[var(--like)] text-[var(--like)] px-4 py-1.5 rounded-xl font-extrabold text-2xl tracking-wider"
            >
              LIKE
            </motion.div>
            <motion.div
              style={{ opacity: passOpacity }}
              className="absolute top-8 right-6 rotate-[12deg] border-4 border-[var(--pass)] text-[var(--pass)] px-4 py-1.5 rounded-xl font-extrabold text-2xl tracking-wider"
            >
              PASS
            </motion.div>
          </>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-1.5 pointer-events-none">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-2xl font-extrabold text-white leading-tight">{item.title}</h3>
            {item.year && <span className="text-white/70 font-medium">{item.year}</span>}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {item.imdb_rating != null && (
              <span className="flex items-center gap-1 text-amber-400 font-semibold">
                ★ {item.imdb_rating.toFixed(1)}
              </span>
            )}
            {item.runtime && <span className="text-white/70">{item.runtime} min</span>}
            <span className="text-white/50 uppercase text-xs tracking-wide">
              {item.media_type === "tv" ? "Series" : "Movie"}
            </span>
          </div>
          <p className="text-sm text-white/80 line-clamp-2 mt-1">{item.synopsis}</p>
        </div>
      </div>
    </motion.div>
  );
}
