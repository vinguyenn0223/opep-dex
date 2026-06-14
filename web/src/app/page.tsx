"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { maxUint256, zeroAddress } from "viem";
import { addresses, tokenMeta } from "@/config/deployment";
import { routerAbi, erc20Abi } from "@/config/abis";
import { fmt, parse, deadline, minusSlippage } from "@/lib/format";

type Dir = "buy" | "sell"; // buy = OPN -> OPEPE, sell = OPEPE -> OPN

export default function SwapPage() {
  const { address } = useAccount();
  const [dir, setDir] = useState<Dir>("buy");
  const [amountIn, setAmountIn] = useState("");
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  const token = addresses.MemeToken;
  const wopn = addresses.WOPN;
  const amountInWei = parse(amountIn);

  // path: buy = [WOPN, token], sell = [token, WOPN]
  const path = useMemo(
    () => (dir === "buy" ? [wopn, token] : [token, wopn]) as `0x${string}`[],
    [dir, token, wopn]
  );

  const { data: amounts } = useReadContract({
    address: addresses.DexRouter,
    abi: routerAbi,
    functionName: "getAmountsOut",
    args: [amountInWei, path],
    query: { enabled: amountInWei > 0n },
  });

  const amountOut = amounts ? (amounts as bigint[])[1] : 0n;

  // For sells we need an allowance on the token.
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, addresses.DexRouter],
    query: { enabled: !!address && dir === "sell" },
  });

  const needsApproval = dir === "sell" && (allowance === undefined || (allowance as bigint) < amountInWei);

  async function onApprove() {
    const hash = await writeContractAsync({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [addresses.DexRouter, maxUint256],
    });
    setTxHash(hash);
    await refetchAllowance();
  }

  async function onSwap() {
    if (!address || amountInWei === 0n) return;
    const minOut = minusSlippage(amountOut);
    const dl = deadline();
    let hash: `0x${string}`;
    if (dir === "buy") {
      hash = await writeContractAsync({
        address: addresses.DexRouter,
        abi: routerAbi,
        functionName: "swapExactOPNForTokens",
        args: [minOut, path, address, dl],
        value: amountInWei,
      });
    } else {
      hash = await writeContractAsync({
        address: addresses.DexRouter,
        abi: routerAbi,
        functionName: "swapExactTokensForOPN",
        args: [amountInWei, minOut, path, address, dl],
      });
    }
    setTxHash(hash);
    setAmountIn("");
  }

  const inSym = dir === "buy" ? "OPN" : tokenMeta.symbol;
  const outSym = dir === "buy" ? tokenMeta.symbol : "OPN";

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-mark">🐸</div>
        <h1 className="hero-title">{tokenMeta.symbol} DEX</h1>
        <p className="hero-sub">
          The cutest meme DEX on OPN Chain. Swap, pool, stake &amp; claim — ribbit.
        </p>
        <div className="bubble">gm frens, ready to ape? 🐸💚</div>
      </section>

      <div className="card">
      <div className="card-head">
        <h2><span>🔄</span> Swap</h2>
        <button className="ghost" onClick={() => setDir(dir === "buy" ? "sell" : "buy")}>
          ⇅ Flip
        </button>
      </div>

      <label className="field">
        <span>From ({inSym})</span>
        <input
          inputMode="decimal"
          placeholder="0.0"
          value={amountIn}
          onChange={(e) => setAmountIn(e.target.value)}
        />
      </label>

      <div className="quote">
        <span>To ({outSym})</span>
        <strong>{fmt(amountOut)}</strong>
      </div>

      {!address ? (
        <div className="empty">
          <span className="empty-mark">🐸</span>
          <p className="hint">Connect your wallet to start swapping, fren.</p>
        </div>
      ) : needsApproval ? (
        <button className="primary" onClick={onApprove} disabled={isPending || confirming}>
          Approve {tokenMeta.symbol}
        </button>
      ) : (
        <button
          className="primary"
          onClick={onSwap}
          disabled={isPending || confirming || amountInWei === 0n}
        >
          {confirming ? "Confirming…" : `Swap ${inSym} → ${outSym}`}
        </button>
      )}

      <p className="hint small">Slippage tolerance 0.5%. Deadline 20 min.</p>
      </div>
    </div>
  );
}
