import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// --- Token config (edit name/symbol/supply here) ---
const TOKEN_NAME = process.env.TOKEN_NAME || "OpnPepe";
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "OPEPE";
const TOKEN_SUPPLY = ethers.parseEther(process.env.TOKEN_SUPPLY || "1000000000"); // 1B

// --- Launchpad config ---
const LAUNCHPAD_FEE = ethers.parseEther(process.env.LAUNCHPAD_FEE || "0");

// --- Staking config ---
const STAKING_REWARD = ethers.parseEther(process.env.STAKING_REWARD || "10000000"); // seed reward

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY || deployer.address;
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;

  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Treasury: ${treasury}`);
  console.log("---");

  // 1. Meme token (OPEPE)
  const Token = await ethers.getContractFactory("MemeToken");
  const token = await Token.deploy(TOKEN_NAME, TOKEN_SYMBOL, TOKEN_SUPPLY, treasury);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`MemeToken (${TOKEN_SYMBOL}): ${tokenAddr}`);

  // 2. WOPN (wrapped native)
  const WOPN = await ethers.getContractFactory("WOPN");
  const wopn = await WOPN.deploy();
  await wopn.waitForDeployment();
  const wopnAddr = await wopn.getAddress();
  console.log(`WOPN: ${wopnAddr}`);

  // 3. DEX Factory
  const Factory = await ethers.getContractFactory("DexFactory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log(`DexFactory: ${factoryAddr}`);

  // 4. DEX Router
  const Router = await ethers.getContractFactory("DexRouter");
  const router = await Router.deploy(factoryAddr, wopnAddr);
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log(`DexRouter: ${routerAddr}`);

  // 5. Launchpad
  const Launchpad = await ethers.getContractFactory("Launchpad");
  const launchpad = await Launchpad.deploy(LAUNCHPAD_FEE, feeRecipient, deployer.address);
  await launchpad.waitForDeployment();
  const launchpadAddr = await launchpad.getAddress();
  console.log(`Launchpad: ${launchpadAddr}`);

  // 6. Staking (stake OPEPE, earn OPEPE — swap stakingToken for an LP token later if desired)
  const Staking = await ethers.getContractFactory("StakingRewards");
  const staking = await Staking.deploy(tokenAddr, tokenAddr, deployer.address);
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log(`StakingRewards: ${stakingAddr}`);

  // 7. Airdrop (root set to zero initially; owner sets it after building the tree)
  const ZERO_ROOT = ethers.ZeroHash;
  const Airdrop = await ethers.getContractFactory("MerkleAirdrop");
  const airdrop = await Airdrop.deploy(tokenAddr, ZERO_ROOT, 0, deployer.address);
  await airdrop.waitForDeployment();
  const airdropAddr = await airdrop.getAddress();
  console.log(`MerkleAirdrop: ${airdropAddr}`);

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    treasury,
    contracts: {
      MemeToken: tokenAddr,
      WOPN: wopnAddr,
      DexFactory: factoryAddr,
      DexRouter: routerAddr,
      Launchpad: launchpadAddr,
      StakingRewards: stakingAddr,
      MerkleAirdrop: airdropAddr,
    },
    token: { name: TOKEN_NAME, symbol: TOKEN_SYMBOL },
  };

  // Write to contracts/deployments/<network>.json
  const deployDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deployDir, { recursive: true });
  const file = path.join(deployDir, `${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`---\nDeployment written to ${file}`);

  // Also mirror into the web app so the frontend can import it directly.
  const webDir = path.join(__dirname, "..", "..", "web", "src", "config");
  try {
    fs.mkdirSync(webDir, { recursive: true });
    fs.writeFileSync(path.join(webDir, "deployment.json"), JSON.stringify(out, null, 2));
    console.log(`Mirrored to web/src/config/deployment.json`);
  } catch {
    // web app may not exist yet; ignore
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
