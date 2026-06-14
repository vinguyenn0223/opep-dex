"use client";

import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { zeroAddress } from "viem";
import { addresses, tokenMeta } from "@/config/deployment";
import { presaleAbi } from "@/config/abis";
import { fmt, parse } from "@/lib/format";

// The DEX's own presale lives at a fixed address once deployed and funded.
// Set NEXT_PUBLIC_PRESALE_ADDRESS to point the page at a live sale.
const PRESALE =
  (process.env.NEXT_PUBLIC_PRESALE_ADDRESS as `0x${string}`) || zeroAddress;

export default function PresalePage() {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });
  const [amount, setAmount] = useState("");

  const live = PRESALE !== zeroAddress;
  const base = { address: PRESALE, abi: presaleAbi } as const;

  const { data: softCap } = useReadContract({ ...base, functionName: "softCap", query: { enabled: live } });
  const { data: hardCap } = useReadContract({ ...base, functionName: "hardCap", query: { enabled: live } });
  const { data: totalRaised, refetch: refetchRaised } = useReadContract({
    ...base,
    functionName: "totalRaised",
    query: { enabled: live },
  });
  const { data: finalized } = useReadContract({ ...base, functionName: "finalized", query: { enabled: live } });
  const { data: softCapReached } = useReadContract({
    ...base,
    functionName: "softCapReached",
    query: { enabled: live },
  });
  const { data: contributed, refetch: refetchContrib } = useReadContract({
    ...base,
    functionName: "contributed",
    args: [address ?? zeroAddress],
    query: { enabled: live && !!address },
  });
  const { data: claimed } = useReadContract({
    ...base,
    functionName: "claimed",
    args: [address ?? zeroAddress],
    query: { enabled: live && !!address },
  });

  async function onContribute() {
    const hash = await writeContractAsync({
      ...base,
      functionName: "contribute",
      value: parse(amount),
    });
    setTxHash(hash);
    setAmount("");
    refetchRaised();
    refetchContrib();
  }

  async function call(fn: "claim" | "refund") {
    const hash = await writeContractAsync({ ...base, functionName: fn });
    setTxHash(hash);
    refetchRaised();
    refetchContrib();
  }

  if (!live) {
    return (
      <div className="card">
        <div className="card-head">
          <h2>🚀 Presale</h2>
        </div>
        <div className="empty">
          <span className="empty-mark">😴</span>
          <p className="hint">
            No presale live right now. Set
            <code> NEXT_PUBLIC_PRESALE_ADDRESS</code> to wake it up, fren.
          </p>
        </div>
      </div>
    );
  }

  const raised = (totalRaised as bigint) ?? 0n;
  const hc = (hardCap as bigint) ?? 1n;
  const pct = hc > 0n ? Number((raised * 10000n) / hc) / 100 : 0;

  return (
    <div className="card">
      <div className="card-head">
        <h2>🚀 {tokenMeta.symbol} Presale</h2>
        <span className="pill green">early frens</span>
      </div>

      <div className="progress">
        <div className="progress-bar" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="rows">
        <div className="row">
          <span>Raised</span>
          <strong>
            {fmt(raised)} / {fmt(hc)} OPN ({pct.toFixed(1)}%)
          </strong>
        </div>
        <div className="row">
          <span>Soft cap</span>
          <strong>{fmt(softCap as bigint | undefined)} OPN</strong>
        </div>
        <div className="row">
          <span>Your contribution</span>
          <strong>{fmt(contributed as bigint | undefined)} OPN</strong>
        </div>
        <div className="row">
          <span>Status</span>
          <strong>
            {finalized ? (softCapReached ? "Succeeded" : "Failed") : "Live"}
          </strong>
        </div>
      </div>

      {!address ? (
        <div className="empty">
          <span className="empty-mark">🐸</span>
          <p className="hint">Connect your wallet to ape in early, fren.</p>
        </div>
      ) : !finalized ? (
        <>
          <label className="field">
            <span>Contribute (OPN)</span>
            <input
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <button
            className="primary"
            onClick={onContribute}
            disabled={isPending || confirming || parse(amount) === 0n}
          >
            {confirming ? "Aping in…" : "🚀 Ape in"}
          </button>
        </>
      ) : softCapReached ? (
        <button
          className="primary"
          onClick={() => call("claim")}
          disabled={isPending || confirming || !!claimed}
        >
          {claimed ? "Already claimed" : confirming ? "Confirming…" : "Claim tokens"}
        </button>
      ) : (
        <button
          className="primary"
          onClick={() => call("refund")}
          disabled={isPending || confirming || (contributed as bigint) === 0n}
        >
          {confirming ? "Confirming…" : "Refund"}
        </button>
      )}
    </div>
  );
}
