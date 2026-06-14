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
import { routerAbi, erc20Abi, factoryAbi, pairAbi } from "@/config/abis";
import { fmt, parse, deadline, minusSlippage } from "@/lib/format";

export default function LiquidityPage() {
  const { address } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  const [opnAmount, setOpnAmount] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [lpToRemove, setLpToRemove] = useState("");

  const token = addresses.MemeToken;
  const opnWei = parse(opnAmount);
  const tokenWei = parse(tokenAmount);

  const { data: pair } = useReadContract({
    address: addresses.DexFactory,
    abi: factoryAbi,
    functionName: "getPair",
    args: [token, addresses.WOPN],
  });
  const pairAddr = (pair as `0x${string}`) ?? zeroAddress;
  const hasPair = pairAddr !== zeroAddress;

  const { data: lpBalance, refetch: refetchLp } = useReadContract({
    address: pairAddr,
    abi: pairAbi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: { enabled: !!address && hasPair },
  });

  const { data: reserves } = useReadContract({
    address: pairAddr,
    abi: pairAbi,
    functionName: "getReserves",
    query: { enabled: hasPair },
  });

  const { data: tokenAllowance, refetch: refetchTokenAllowance } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, addresses.DexRouter],
    query: { enabled: !!address },
  });

  const { data: lpAllowance, refetch: refetchLpAllowance } = useReadContract({
    address: pairAddr,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, addresses.DexRouter],
    query: { enabled: !!address && hasPair },
  });

  const needTokenApproval = tokenAllowance === undefined || (tokenAllowance as bigint) < tokenWei;
  const lpWei = parse(lpToRemove);
  const needLpApproval = lpAllowance === undefined || (lpAllowance as bigint) < lpWei;

  async function approve(spenderToken: `0x${string}`, refetch: () => void) {
    const hash = await writeContractAsync({
      address: spenderToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [addresses.DexRouter, maxUint256],
    });
    setTxHash(hash);
    refetch();
  }

  async function onAdd() {
    if (!address || opnWei === 0n || tokenWei === 0n) return;
    const hash = await writeContractAsync({
      address: addresses.DexRouter,
      abi: routerAbi,
      functionName: "addLiquidityOPN",
      args: [
        token,
        tokenWei,
        minusSlippage(tokenWei),
        minusSlippage(opnWei),
        address,
        deadline(),
      ],
      value: opnWei,
    });
    setTxHash(hash);
    setOpnAmount("");
    setTokenAmount("");
    refetchLp();
  }

  async function onRemove() {
    if (!address || lpWei === 0n) return;
    const hash = await writeContractAsync({
      address: addresses.DexRouter,
      abi: routerAbi,
      functionName: "removeLiquidity",
      args: [token, addresses.WOPN, lpWei, 0n, 0n, address, deadline()],
    });
    setTxHash(hash);
    setLpToRemove("");
    refetchLp();
  }

  const r = reserves as [bigint, bigint, number] | undefined;

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>💧 Add liquidity</h2>
          <span className="pill green">earn fees</span>
        </div>
        <label className="field">
          <span>OPN</span>
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={opnAmount}
            onChange={(e) => setOpnAmount(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{tokenMeta.symbol}</span>
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={tokenAmount}
            onChange={(e) => setTokenAmount(e.target.value)}
          />
        </label>

        {!address ? (
          <div className="empty">
            <span className="empty-mark">💧</span>
            <p className="hint">Connect wallet to ape into the pool, fren.</p>
          </div>
        ) : needTokenApproval ? (
          <button
            className="primary"
            onClick={() => approve(token, refetchTokenAllowance)}
            disabled={isPending || confirming}
          >
            Approve {tokenMeta.symbol}
          </button>
        ) : (
          <button
            className="primary"
            onClick={onAdd}
            disabled={isPending || confirming || opnWei === 0n || tokenWei === 0n}
          >
            {confirming ? "Confirming…" : "Add liquidity"}
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Your position</h2>
        </div>
        <div className="rows">
          <div className="row">
            <span>LP balance</span>
            <strong>{fmt(lpBalance as bigint | undefined)}</strong>
          </div>
          {r && (
            <div className="row">
              <span>Pool reserves</span>
              <strong>
                {fmt(r[0])} / {fmt(r[1])}
              </strong>
            </div>
          )}
        </div>

        <label className="field">
          <span>LP to remove</span>
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={lpToRemove}
            onChange={(e) => setLpToRemove(e.target.value)}
          />
        </label>

        {!address ? null : !hasPair ? (
          <p className="hint">No pool yet. Add liquidity first.</p>
        ) : needLpApproval ? (
          <button
            className="primary"
            onClick={() => approve(pairAddr, refetchLpAllowance)}
            disabled={isPending || confirming}
          >
            Approve LP
          </button>
        ) : (
          <button
            className="primary"
            onClick={onRemove}
            disabled={isPending || confirming || lpWei === 0n}
          >
            {confirming ? "Confirming…" : "Remove liquidity"}
          </button>
        )}
      </div>
    </div>
  );
}
