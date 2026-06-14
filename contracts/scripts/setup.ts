import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// On-chain setup after deploy:
//  1. Seed an OPEPE/OPN liquidity pool on the DEX.
//  2. Fund the staking contract and start a reward period.
//  3. Deploy a Presale for OPEPE and fund it with tokens.
//
// Amounts are conservative testnet defaults; override via env.
const SEED_OPEPE = ethers.parseEther(process.env.SEED_OPEPE || "1000000"); // 1M OPEPE into LP
const SEED_OPN = ethers.parseEther(process.env.SEED_OPN || "1"); // 1 OPN into LP
const STAKING_FUND = ethers.parseEther(process.env.STAKING_FUND || "10000000"); // 10M OPEPE rewards

// Presale params
const PRESALE_RATE = ethers.parseEther(process.env.PRESALE_RATE || "1000"); // 1000 OPEPE per 1 OPN
const PRESALE_SOFTCAP = ethers.parseEther(process.env.PRESALE_SOFTCAP || "1");
const PRESALE_HARDCAP = ethers.parseEther(process.env.PRESALE_HARDCAP || "10");
const PRESALE_MIN = ethers.parseEther(process.env.PRESALE_MIN || "0.01");
const PRESALE_MAX = ethers.parseEther(process.env.PRESALE_MAX || "5");

function loadDeployment() {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveDeployment(d: any) {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(d, null, 2));
  const webDir = path.join(__dirname, "..", "..", "web", "src", "config");
  try {
    fs.writeFileSync(path.join(webDir, "deployment.json"), JSON.stringify(d, null, 2));
  } catch {
    // ignore
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const d = loadDeployment();
  const c = d.contracts;
  console.log(`Network: ${network.name}  Deployer: ${deployer.address}`);

  const token = await ethers.getContractAt("MemeToken", c.MemeToken);
  const router = await ethers.getContractAt("DexRouter", c.DexRouter);
  const staking = await ethers.getContractAt("StakingRewards", c.StakingRewards);
  const factory = await ethers.getContractAt("DexFactory", c.DexFactory);

  // --- 1. Seed liquidity ---
  console.log("\n[1/3] Seeding OPEPE/OPN liquidity...");
  const allowance = await token.allowance(deployer.address, c.DexRouter);
  if (allowance < SEED_OPEPE) {
    const tx = await token.approve(c.DexRouter, ethers.MaxUint256);
    await tx.wait();
    console.log("  approved router");
  }
  const deadline = Math.floor(Date.now() / 1000) + 1200;
  const addTx = await router.addLiquidityOPN(
    c.MemeToken,
    SEED_OPEPE,
    0,
    0,
    deployer.address,
    deadline,
    { value: SEED_OPN }
  );
  await addTx.wait();
  const pair = await factory.getPair(c.MemeToken, c.WOPN);
  console.log(`  liquidity added. Pair: ${pair}`);

  // --- 2. Fund + notify staking ---
  console.log("\n[2/3] Funding staking rewards...");
  const fundTx = await token.transfer(c.StakingRewards, STAKING_FUND);
  await fundTx.wait();
  const notifyTx = await staking.notifyRewardAmount(STAKING_FUND);
  await notifyTx.wait();
  console.log(`  staking funded with ${ethers.formatEther(STAKING_FUND)} OPEPE, 7-day period started`);

  // --- 3. Deploy + fund presale ---
  console.log("\n[3/3] Deploying presale...");
  const now = Math.floor(Date.now() / 1000);
  const start = now + 60;
  const end = now + 7 * 24 * 3600;
  const Presale = await ethers.getContractFactory("Presale");
  const presale = await Presale.deploy(
    c.MemeToken,
    PRESALE_RATE,
    PRESALE_SOFTCAP,
    PRESALE_HARDCAP,
    PRESALE_MIN,
    PRESALE_MAX,
    start,
    end,
    deployer.address
  );
  await presale.waitForDeployment();
  const presaleAddr = await presale.getAddress();

  const tokensForHardcap = (PRESALE_HARDCAP * PRESALE_RATE) / ethers.parseEther("1");
  const fundPresaleTx = await token.transfer(presaleAddr, tokensForHardcap);
  await fundPresaleTx.wait();
  console.log(`  Presale: ${presaleAddr}`);
  console.log(`  funded with ${ethers.formatEther(tokensForHardcap)} OPEPE`);

  // Persist new addresses.
  d.contracts.Pair = pair;
  d.contracts.Presale = presaleAddr;
  saveDeployment(d);
  console.log("\nSetup complete. Deployment file updated.");
  console.log(`\nSet in web/.env.local:\n  NEXT_PUBLIC_PRESALE_ADDRESS=${presaleAddr}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
