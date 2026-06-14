"use client";

import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { maxUint256, zeroAddress } from "viem";
import { addresses, tokenMeta } from "@/config/deployment";
import { stakingAbi, erc20Abi } from "@/config/abis";
import { fmt, parse } from "@/lib/format";

// Which token is staked. The deploy script wires StakingRewards to stake the
// OPEPE token by default; override with NEXT_PUBLIC_STAKING_TOKEN if you point
// it at an LP token instead.
const STAKING_TOKEN =
  (process.env.NEXT_PUBLIC_STAKING_TOKEN as `0x${string}`) || addresses.MemeToken;

export default function StakePage() {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });
  const [amount, setAmount] = useState("");

  const staking = addresses.StakingRewards;
  const amountWei = parse(amount);

  const { data: staked, refetch: refetchStaked } = useReadContract({
    address: staking,
    abi: stakingAbi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: { enabled: !!address },
  });

  const { data: earned, refetch: refetchEarned } = useReadContract({
    address: staking,
    abi: stakingAbi,
    functionName: "earned",
    args: [address ?? zeroAddress],
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const { data: totalStaked } = useReadContract({
    address: staking,
    abi: stakingAbi,
    functionName: "totalSupply",
  });

  const { data: walletBalance } = useReadContract({
    address: STAKING_TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: { enabled: !!address },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: STAKING_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, staking],
    query: { enabled: !!address },
  });

  const needsApproval = allowance === undefined || (allowance as bigint) < amountWei;

  function refetchAll() {
    refetchStaked();
    refetchEarned();
  }

  async function onApprove() {
    const hash = await writeContractAsync({
      address: STAKING_TOKEN,
      abi: erc20Abi,
      functionName: "approve",
      args: [staking, maxUint256],
    });
    setTxHash(hash);
    refetchAllowance();
  }

  async function onStake() {
    if (!address || amountWei === 0n) return;
    const hash = await writeContractAsync({
      address: staking,
      abi: stakingAbi,
      functionName: "stake",
      args: [amountWei],
    });
    setTxHash(hash);
    setAmount("");
    refetchAll();
  }

  async function onWithdraw() {
    if (!address || amountWei === 0n) return;
    const hash = await writeContractAsync({
      address: staking,
      abi: stakingAbi,
      functionName: "withdraw",
      args: [amountWei],
    });
    setTxHash(hash);
    setAmount("");
    refetchAll();
  }

  async function onClaim() {
    const hash = await writeContractAsync({
      address: staking,
      abi: stakingAbi,
      functionName: "getReward",
    });
    setTxHash(hash);
    refetchAll();
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>🥩 Stake {tokenMeta.symbol}</h2>
          <span className="pill green">earn while u sleep</span>
        </div>
        <div className="rows">
          <div className="row">
            <span>Your stake</span>
            <strong>{fmt(staked as bigint | undefined)}</strong>
          </div>
          <div className="row">
            <span>Wallet balance</span>
            <strong>{fmt(walletBalance as bigint | undefined)}</strong>
          </div>
          <div className="row">
            <span>Total staked</span>
            <strong>{fmt(totalStaked as bigint | undefined)}</strong>
          </div>
          <div className="row highlight">
            <span>Earned rewards</span>
            <strong>{fmt(earned as bigint | undefined)} {tokenMeta.symbol}</strong>
          </div>
        </div>

        <label className="field">
          <span>Amount</span>
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        {!address ? (
          <div className="empty">
            <span className="empty-mark">🥩</span>
            <p className="hint">Connect your wallet to stake &amp; farm those rewards, fren.</p>
          </div>
        ) : (
          <div className="btn-row">
            {needsApproval ? (
              <button className="primary" onClick={onApprove} disabled={isPending || confirming}>
                Approve
              </button>
            ) : (
              <button
                className="primary"
                onClick={onStake}
                disabled={isPending || confirming || amountWei === 0n}
              >
                {confirming ? "Confirming…" : "Stake"}
              </button>
            )}
            <button
              className="ghost"
              onClick={onWithdraw}
              disabled={isPending || confirming || amountWei === 0n}
            >
              Withdraw
            </button>
          </div>
        )}

        {address && (
          <button
            className="secondary"
            onClick={onClaim}
            disabled={isPending || confirming || ((earned as bigint) ?? 0n) === 0n}
          >
            🤑 Harvest rewards
          </button>
        )}
      </div>
    </div>
  );
}
