import { ethers, network } from "hardhat";

async function main() {
  const net = await ethers.provider.getNetwork();
  console.log("Network name:", network.name);
  console.log("Chain ID:", net.chainId.toString());

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    console.log("No signer — check PRIVATE_KEY in .env");
    return;
  }
  const deployer = signers[0];
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance (OPN):", ethers.formatEther(bal));

  const latest = await ethers.provider.getBlockNumber();
  console.log("Latest block:", latest);

  if (bal === 0n) {
    console.log("\nWARNING: balance is 0 — fund the wallet from the faucet before deploying.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
