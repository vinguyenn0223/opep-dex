import { formatUnits, parseUnits } from "viem";

export function fmt(value: bigint | undefined, decimals = 18, maxFrac = 6): string {
  if (value === undefined) return "0";
  const s = formatUnits(value, decimals);
  const [whole, frac] = s.split(".");
  if (!frac) return whole;
  return `${whole}.${frac.slice(0, maxFrac)}`.replace(/\.?0+$/, "") || "0";
}

export function parse(value: string, decimals = 18): bigint {
  if (!value || value.trim() === "") return 0n;
  try {
    return parseUnits(value as `${number}`, decimals);
  } catch {
    return 0n;
  }
}

export function deadline(minutes = 20): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutes * 60);
}

// Apply a slippage tolerance (bps) to a minimum-out amount.
export function minusSlippage(amount: bigint, bps = 50): bigint {
  return (amount * BigInt(10000 - bps)) / 10000n;
}

export function shortAddr(addr?: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
