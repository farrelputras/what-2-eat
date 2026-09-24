"use client";

import { useEffect, useRef } from "react";

const ITEM_WIDTH = 160; // matches w-40 on each reel item
const EASING = "cubic-bezier(0.34, 1.25, 0.64, 1)";

interface ShuffleReelProps {
  durationMs?: number;
  names: string[];
  onLand: () => void;
  winnerIndex: number;
}

export function ShuffleReel({ durationMs = 1700, names, onLand, winnerIndex }: ShuffleReelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const onLandRef = useRef(onLand);
  useEffect(() => {
    onLandRef.current = onLand;
  });

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) {
      onLandRef.current();
      return;
    }
    const endX = container.clientWidth / 2 - (winnerIndex * ITEM_WIDTH + ITEM_WIDTH / 2);
    let landed = false;
    function land(): void {
      if (landed) return;
      landed = true;
      onLandRef.current();
    }
    track.addEventListener("transitionend", land);
    const frame = requestAnimationFrame(() => {
      track.style.transform = `translateX(${endX}px)`;
    });
    const fallback = setTimeout(land, durationMs + 400);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
      track.removeEventListener("transitionend", land);
    };
  }, [durationMs, winnerIndex]);

  return (
    <div
      aria-label="Shuffling places"
      className="rounded-lg border bg-card p-5 grid gap-2.5 min-h-44"
      role="status"
    >
      <p className="text-sm text-muted-foreground">Shuffling…</p>
      <div
        ref={containerRef}
        className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]"
      >
        <div
          ref={trackRef}
          aria-hidden="true"
          className="flex w-max"
          style={{ transition: `transform ${durationMs}ms ${EASING}` }}
        >
          {names.map((name, index) => (
            <p
              key={`${index}-${name}`}
              className="flex h-16 w-40 shrink-0 items-center justify-center truncate px-2 text-lg font-medium"
            >
              {name}
            </p>
          ))}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 w-40 -translate-x-1/2 rounded-md border-2 border-primary"
        />
      </div>
    </div>
  );
}
