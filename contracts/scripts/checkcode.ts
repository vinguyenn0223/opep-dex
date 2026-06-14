import { ethers } from "hardhat";

async function main() {
  const addrs = {
    MemeToken: "0x7dA69148f610c362b2C21764b82a1d5c2566A8ef",
    WOPN: "0x979AB6D65199F10C30C1909007Fc012791A39A63",
    DexFactory: "0xD0cf4cda1a2b8956BDF54ebAa2804d399094278f",
    DexRouter: "0x0Be716BEB23154b52d00F52d7D95a099e0FED151",
    Launchpad: "0x97fcCf7635038b6af8f51741278BAEc1aE2673C9",
    StakingRewards: "0x27Fe6Cc7E887E70655B96d23Fc2cd29283238D94",
    MerkleAirdrop: "0xdA48B038459308A4FA2E2C21e15Ab9204629c09a",
  };
  for (const [name, addr] of Object.entries(addrs)) {
    const code = await ethers.provider.getCode(addr);
    console.log(`${name}: ${code === "0x" ? "NO CODE" : code.length + " bytes"} @ ${addr}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
