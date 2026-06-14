"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { addresses, tokenMeta } from "@/config/deployment";
import { airdropAbi } from "@/config/abis";
import { fmt } from "@/lib/format";
import claims from "@/config/airdrop.json";

// airdrop.json shape: { [address]: { index, amount, proof } }
type Claim = { index: number; amount: string; proof: `0x${string}`[] };
type Claims = Record<string, Claim>;

export default function AirdropPage() {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  const list = claims as Claims;
  const claim = useMemo(() => {
    if (!address) return undefined;
    // keys may be checksummed differently; match case-insensitively.
    const key = Object.keys(list).find((k) => k.toLowerCase() === address.toLowerCase());
    return key ? list[key] : undefined;
  }, [address, list]);

  const { data: isClaimed, refetch } = useReadContract({
    address: addresses.MerkleAirdrop,
    abi: airdropAbi,
    functionName: "isClaimed",
    args: [BigInt(claim?.index ?? 0)],
    query: { enabled: !!claim },
  });

  async function onClaim() {
    if (!address || !claim) return;
    const hash = await writeContractAsync({
      address: addresses.MerkleAirdrop,
      abi: airdropAbi,
      functionName: "claim",
      args: [BigInt(claim.index), address, BigInt(claim.amount), claim.proof],
    });
    setTxHash(hash);
    refetch();
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>🎁 Free Pepes</h2>
        <span className="pill pink">gib airdrop</span>
      </div>

      {!address ? (
        <div className="empty">
          <span className="empty-mark">🪂</span>
          <p className="hint">Connect your wallet to see if you got Pepe&apos;d.</p>
        </div>
      ) : !claim ? (
        <div className="empty">
          <span className="empty-mark">😢</span>
          <p className="hint">No allocation for this wallet. Better luck next drop, fren.</p>
        </div>
      ) : (
        <div className="stack">
          <div className="rows">
            <div className="row highlight">
              <span>Your allocation</span>
              <strong>
                {fmt(BigInt(claim.amount))} {tokenMeta.symbol}
              </strong>
            </div>
            <div className="row">
              <span>Status</span>
              <strong>{isClaimed ? "Claimed" : "Unclaimed"}</strong>
            </div>
          </div>
          <button
            className="primary"
            onClick={onClaim}
            disabled={isPending || confirming || !!isClaimed}
          >
            {isClaimed ? "Already claimed ✅" : confirming ? "Confirming…" : "Claim my Pepes 🐸"}
          </button>
        </div>
      )}
    </div>
  );
}
