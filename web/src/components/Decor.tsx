"use client";

import { useMemo } from "react";

// Floating background emojis — purely decorative meme vibe.
const EMOJIS = ["🐸", "🍃", "💚", "🪙", "✨", "🌿", "💸", "🐸", "🟢", "🍀"];

export function Decor() {
  // Deterministic positions so SSR and client markup match (no hydration warning).
  const items = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const seed = (i * 9301 + 49297) % 233280;
        const rnd = seed / 233280;
        return {
          emoji: EMOJIS[i % EMOJIS.length],
          left: Math.round(rnd * 100),
          delay: Math.round(rnd * 22),
          duration: 18 + Math.round(rnd * 16),
          size: 24 + Math.round(rnd * 26),
        };
      }),
    []
  );

  return (
    <div className="decor" aria-hidden>
      {items.map((it, i) => (
        <span
          key={i}
          style={{
            left: `${it.left}%`,
            animationDelay: `${it.delay}s`,
            animationDuration: `${it.duration}s`,
            fontSize: `${it.size}px`,
          }}
        >
          {it.emoji}
        </span>
      ))}
    </div>
  );
}
