import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Sends a state-changing tx to the Launchpad so Blockscout's indexer registers
// the address as a contract (a precondition for source verification on this
// explorer). setCreationFee is owner-only and cheap.
async function main() {
  const deployFile = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const deployment = JSON.parse(fs.readFileSync(deployFile, "utf8"));
  const launchpadAddr = deployment.contracts.Launchpad as string;

  const [deployer] = await ethers.getSigners();
  const launchpad = await ethers.getContractAt("Launchpad", launchpadAddr, deployer);

  const current = await launchpad.creationFee();
  console.log(`Launchpad: ${launchpadAddr}`);
  console.log(`Current creationFee: ${current}`);

  const tx = await launchpad.setCreationFee(current);
  await tx.wait();
  console.log(`setCreationFee tx: ${tx.hash}`);
  console.log("Launchpad touched — Blockscout should index it as a contract shortly.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
