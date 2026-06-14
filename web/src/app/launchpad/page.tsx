"use client";

import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { maxUint256, zeroAddress } from "viem";
import { addresses } from "@/config/deployment";
import { launchpadAbi, erc20Abi } from "@/config/abis";
import { fmt, parse, shortAddr } from "@/lib/format";

type Form = {
  token: string;
  rate: string;
  softCap: string;
  hardCap: string;
  minPerWallet: string;
  maxPerWallet: string;
  durationHours: string;
  startInMinutes: string;
};

const EMPTY: Form = {
  token: "",
  rate: "1000",
  softCap: "10",
  hardCap: "100",
  minPerWallet: "0.1",
  maxPerWallet: "50",
  durationHours: "168",
  startInMinutes: "10",
};

export default function LaunchpadPage() {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });
  const [form, setForm] = useState<Form>(EMPTY);

  const launchpad = addresses.Launchpad;
  const base = { address: launchpad, abi: launchpadAbi } as const;

  const { data: fee } = useReadContract({ ...base, functionName: "creationFee" });
  const { data: count, refetch: refetchCount } = useReadContract({
    ...base,
    functionName: "allSalesLength",
  });

  const tokenAddr = (form.token || zeroAddress) as `0x${string}`;
  const hardCapWei = parse(form.hardCap);
  const rateWei = parse(form.rate);
  // tokens the launchpad must pull = hardCap * rate / 1e18
  const tokensNeeded = (hardCapWei * rateWei) / 10n ** 18n;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, launchpad],
    query: { enabled: !!address && tokenAddr !== zeroAddress },
  });

  const needsApproval =
    tokenAddr !== zeroAddress && (allowance === undefined || (allowance as bigint) < tokensNeeded);

  function set<K extends keyof Form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onApprove() {
    const hash = await writeContractAsync({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: "approve",
      args: [launchpad, maxUint256],
    });
    setTxHash(hash);
    refetchAllowance();
  }

  async function onCreate() {
    if (!address || tokenAddr === zeroAddress) return;
    const now = Math.floor(Date.now() / 1000);
    const start = BigInt(now + Number(form.startInMinutes) * 60);
    const end = start + BigInt(Number(form.durationHours) * 3600);

    const params = {
      token: tokenAddr,
      rate: rateWei,
      softCap: parse(form.softCap),
      hardCap: hardCapWei,
      minPerWallet: parse(form.minPerWallet),
      maxPerWallet: parse(form.maxPerWallet),
      startTime: start,
      endTime: end,
    };

    const hash = await writeContractAsync({
      ...base,
      functionName: "createSale",
      args: [params],
      value: (fee as bigint) ?? 0n,
    });
    setTxHash(hash);
    refetchCount();
  }

  const total = Number((count as bigint) ?? 0n);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>🚀 Launchpad</h2>
          <span className="pill yellow">launch ur coin</span>
        </div>
        <p className="hint">
          Got a meme of your own? Deploy a presale in one click — the launchpad spins up a Presale
          you own and pulls <strong>{fmt(tokensNeeded)}</strong> tokens to cover the hard cap.
          Approve that amount first. Creation fee: {fmt(fee as bigint | undefined)} OPN.
        </p>

        <label className="field">
          <span>Token address</span>
          <input
            placeholder="0x…"
            value={form.token}
            onChange={(e) => set("token", e.target.value)}
          />
        </label>

        <div className="grid2">
          <label className="field">
            <span>Rate (tokens per OPN)</span>
            <input value={form.rate} onChange={(e) => set("rate", e.target.value)} />
          </label>
          <label className="field">
            <span>Soft cap (OPN)</span>
            <input value={form.softCap} onChange={(e) => set("softCap", e.target.value)} />
          </label>
          <label className="field">
            <span>Hard cap (OPN)</span>
            <input value={form.hardCap} onChange={(e) => set("hardCap", e.target.value)} />
          </label>
          <label className="field">
            <span>Min per wallet (OPN)</span>
            <input value={form.minPerWallet} onChange={(e) => set("minPerWallet", e.target.value)} />
          </label>
          <label className="field">
            <span>Max per wallet (OPN)</span>
            <input value={form.maxPerWallet} onChange={(e) => set("maxPerWallet", e.target.value)} />
          </label>
          <label className="field">
            <span>Duration (hours)</span>
            <input value={form.durationHours} onChange={(e) => set("durationHours", e.target.value)} />
          </label>
          <label className="field">
            <span>Starts in (minutes)</span>
            <input
              value={form.startInMinutes}
              onChange={(e) => set("startInMinutes", e.target.value)}
            />
          </label>
        </div>

        {!address ? (
          <div className="empty">
            <span className="empty-mark">🚀</span>
            <p className="hint">Connect your wallet to launch your own meme, fren.</p>
          </div>
        ) : needsApproval ? (
          <button className="primary" onClick={onApprove} disabled={isPending || confirming}>
            Approve token
          </button>
        ) : (
          <button
            className="primary"
            onClick={onCreate}
            disabled={isPending || confirming || tokenAddr === zeroAddress}
          >
            {confirming ? "Confirming…" : "🚀 Launch it"}
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>🌱 Sales ({total})</h2>
        </div>
        {total === 0 ? (
          <div className="empty">
            <span className="empty-mark">🌱</span>
            <p className="hint">No launches yet. Be the first to plant a seed.</p>
          </div>
        ) : (
          <SaleList count={total} />
        )}
      </div>
    </div>
  );
}

function SaleList({ count }: { count: number }) {
  return (
    <div className="rows">
      {Array.from({ length: count }, (_, i) => (
        <SaleRow key={i} index={i} />
      ))}
    </div>
  );
}

function SaleRow({ index }: { index: number }) {
  const { data } = useReadContract({
    address: addresses.Launchpad,
    abi: launchpadAbi,
    functionName: "sales",
    args: [BigInt(index)],
  });
  const sale = data as
    | [`0x${string}`, `0x${string}`, `0x${string}`, bigint, bigint]
    | undefined;
  if (!sale) return null;
  const [presale, token, creator, , end] = sale;
  const ended = Number(end) * 1000 < Date.now();
  return (
    <div className="row">
      <span>
        #{index} · {shortAddr(token)}
      </span>
      <strong>
        {shortAddr(presale)} · by {shortAddr(creator)} · {ended ? "ended" : "live"}
      </strong>
    </div>
  );
}
