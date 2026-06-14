import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// End-to-end smoke test of every feature, run with the deployer wallet on the
// live OPN testnet. Each step is wrapped so one failure doesn't abort the rest;
// a summary table is printed at the end.

type Result = { feature: string; ok: boolean; note: string };
const results: Result[] = [];

function loadDeployment() {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function step(feature: string, fn: () => Promise<string>) {
  try {
    const note = await fn();
    results.push({ feature, ok: true, note });
    console.log(`  OK  ${feature} — ${note}`);
  } catch (e: any) {
    const msg = (e?.shortMessage || e?.message || String(e)).split("\n")[0];
    results.push({ feature, ok: false, note: msg });
    console.log(`  XX  ${feature} — ${msg}`);
  }
}

async function main() {
  const [me] = await ethers.getSigners();
  const d = loadDeployment();
  const c = d.contracts;
  const fe = ethers.formatEther;

  console.log(`Network: ${network.name} (chainId ${d.chainId})`);
  console.log(`Wallet:  ${me.address}`);
  const opn0 = await ethers.provider.getBalance(me.address);
  console.log(`OPN balance: ${fe(opn0)}\n`);

  const token = await ethers.getContractAt("MemeToken", c.MemeToken);
  const router = await ethers.getContractAt("DexRouter", c.DexRouter);
  const factory = await ethers.getContractAt("DexFactory", c.DexFactory);
  const staking = await ethers.getContractAt("StakingRewards", c.StakingRewards);
  const presale = await ethers.getContractAt("Presale", c.Presale);
  const airdrop = await ethers.getContractAt("MerkleAirdrop", c.MerkleAirdrop);
  const pair = await ethers.getContractAt("DexPair", c.Pair);

  const dl = () => Math.floor(Date.now() / 1000) + 1200;

  // --- 0. Token sanity ---
  await step("Token metadata", async () => {
    const name = await token.name();
    const sym = await token.symbol();
    const bal = await token.balanceOf(me.address);
    return `${name} (${sym}), wallet holds ${fe(bal)}`;
  });

  // --- 1. Pool reserves ---
  await step("DEX pool reserves", async () => {
    const [r0, r1] = await pair.getReserves();
    const t0 = await pair.token0();
    const isToken0 = t0.toLowerCase() === c.MemeToken.toLowerCase();
    const opepe = isToken0 ? r0 : r1;
    const wopn = isToken0 ? r1 : r0;
    return `OPEPE ${fe(opepe)} / WOPN ${fe(wopn)}`;
  });

  // --- 2. Swap quote ---
  await step("Swap quote (getAmountsOut)", async () => {
    const amounts = await router.getAmountsOut(ethers.parseEther("0.001"), [c.WOPN, c.MemeToken]);
    return `0.001 OPN -> ${fe(amounts[1])} OPEPE`;
  });

  // --- 3. Swap OPN -> OPEPE ---
  await step("Swap OPN -> OPEPE", async () => {
    const before = await token.balanceOf(me.address);
    const amounts = await router.getAmountsOut(ethers.parseEther("0.001"), [c.WOPN, c.MemeToken]);
    const minOut = (amounts[1] * 95n) / 100n;
    const tx = await router.swapExactOPNForTokens(
      minOut,
      [c.WOPN, c.MemeToken],
      me.address,
      dl(),
      { value: ethers.parseEther("0.001") }
    );
    await tx.wait();
    const after = await token.balanceOf(me.address);
    return `received ${fe(after - before)} OPEPE (tx ${tx.hash.slice(0, 10)})`;
  });

  // --- 4. Swap OPEPE -> OPN ---
  await step("Swap OPEPE -> OPN", async () => {
    const amtIn = ethers.parseEther("100");
    const allow = await token.allowance(me.address, c.DexRouter);
    if (allow < amtIn) {
      const a = await token.approve(c.DexRouter, ethers.MaxUint256);
      await a.wait();
    }
    const amounts = await router.getAmountsOut(amtIn, [c.MemeToken, c.WOPN]);
    const minOut = (amounts[1] * 95n) / 100n;
    const tx = await router.swapExactTokensForOPN(amtIn, minOut, [c.MemeToken, c.WOPN], me.address, dl());
    await tx.wait();
    return `swapped 100 OPEPE -> ${fe(amounts[1])} OPN (tx ${tx.hash.slice(0, 10)})`;
  });

  // --- 5. Add liquidity ---
  let lpMinted = 0n;
  await step("Add liquidity (OPEPE/OPN)", async () => {
    const lpBefore = await pair.balanceOf(me.address);
    const tx = await router.addLiquidityOPN(
      c.MemeToken,
      ethers.parseEther("1000"),
      0,
      0,
      me.address,
      dl(),
      { value: ethers.parseEther("0.001") }
    );
    await tx.wait();
    const lpAfter = await pair.balanceOf(me.address);
    lpMinted = lpAfter - lpBefore;
    return `minted ${fe(lpMinted)} LP (tx ${tx.hash.slice(0, 10)})`;
  });

  // --- 6. Remove liquidity ---
  await step("Remove liquidity", async () => {
    if (lpMinted === 0n) throw new Error("no LP minted to remove");
    const allow = await pair.allowance(me.address, c.DexRouter);
    if (allow < lpMinted) {
      const a = await pair.approve(c.DexRouter, ethers.MaxUint256);
      await a.wait();
    }
    const tx = await router.removeLiquidity(c.MemeToken, c.WOPN, lpMinted, 0, 0, me.address, dl());
    await tx.wait();
    return `burned ${fe(lpMinted)} LP back to underlying (tx ${tx.hash.slice(0, 10)})`;
  });

  // --- 7. Presale contribute ---
  await step("Presale contribute", async () => {
    const start = await presale.startTime();
    const end = await presale.endTime();
    const nowTs = Math.floor(Date.now() / 1000);
    if (nowTs < Number(start)) throw new Error("presale not started yet");
    if (nowTs > Number(end)) throw new Error("presale ended");
    const before = await presale.contributed(me.address);
    const tx = await presale.contribute({ value: ethers.parseEther("0.02") });
    await tx.wait();
    const after = await presale.contributed(me.address);
    return `contributed ${fe(after - before)} OPN (total ${fe(after)})`;
  });

  // --- 8. Stake ---
  await step("Stake OPEPE", async () => {
    const amt = ethers.parseEther("500");
    const allow = await token.allowance(me.address, c.StakingRewards);
    if (allow < amt) {
      const a = await token.approve(c.StakingRewards, ethers.MaxUint256);
      await a.wait();
    }
    const tx = await staking.stake(amt);
    await tx.wait();
    const bal = await staking.balanceOf(me.address);
    return `staked, balance now ${fe(bal)} (tx ${tx.hash.slice(0, 10)})`;
  });

  // --- 9. Earned + claim reward ---
  await step("Staking earned + getReward", async () => {
    // wait a few seconds so rewards accrue
    await new Promise((r) => setTimeout(r, 6000));
    const earned = await staking.earned(me.address);
    const tx = await staking.getReward();
    await tx.wait();
    return `earned ~${fe(earned)} OPEPE, claimed (tx ${tx.hash.slice(0, 10)})`;
  });

  // --- 10. Withdraw stake ---
  await step("Unstake (withdraw)", async () => {
    const bal = await staking.balanceOf(me.address);
    if (bal === 0n) throw new Error("nothing staked");
    const tx = await staking.withdraw(bal);
    await tx.wait();
    return `withdrew ${fe(bal)} OPEPE (tx ${tx.hash.slice(0, 10)})`;
  });

  // --- 11. Airdrop claim ---
  await step("Airdrop claim", async () => {
    const claimsFile = path.join(__dirname, "..", "deployments", `airdrop-claims.${network.name}.json`);
    const claims = JSON.parse(fs.readFileSync(claimsFile, "utf8"));
    const key = Object.keys(claims).find((k) => k.toLowerCase() === me.address.toLowerCase());
    if (!key) throw new Error("wallet not in airdrop list");
    const claim = claims[key];
    const already = await airdrop.isClaimed(claim.index);
    if (already) return `already claimed index ${claim.index}`;
    const tx = await airdrop.claim(claim.index, key, claim.amount, claim.proof);
    await tx.wait();
    return `claimed ${fe(BigInt(claim.amount))} OPEPE (tx ${tx.hash.slice(0, 10)})`;
  });

  // --- 12. Launchpad read ---
  await step("Launchpad state", async () => {
    const launchpad = await ethers.getContractAt("Launchpad", c.Launchpad);
    const fee = await launchpad.creationFee();
    const len = await launchpad.allSalesLength();
    return `creationFee ${fe(fee)} OPN, ${len} sales created`;
  });

  // --- Summary ---
  console.log("\n========== SMOKE TEST SUMMARY ==========");
  for (const r of results) {
    console.log(`${r.ok ? "[PASS]" : "[FAIL]"} ${r.feature}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} features passed.`);
  const opn1 = await ethers.provider.getBalance(me.address);
  console.log(`Gas spent: ${fe(opn0 - opn1)} OPN`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
