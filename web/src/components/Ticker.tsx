"use client";

// Scrolling meme ticker. Doubled content so the marquee loops seamlessly.
const PHRASES = [
  "gm frens 🐸",
  "OPEPE to the pond 🚀",
  "1000x not financial advice 💸",
  "ribbit ribbit 🟢",
  "stake & vibe ✨",
  "feels good man 🍃",
  "wen lambo? wen pond 🪙",
  "powered by OPN Chain 💚",
];

export function Ticker() {
  const line = PHRASES.join("   •   ");
  return (
    <div className="ticker" aria-hidden>
      <div className="ticker-track">
        <span>{line}</span>
        <span>{line}</span>
      </div>
    </div>
  );
}
