import hardhat from "hardhat";
const { ethers, run, network } = hardhat;
import * as fs from "fs";
import * as path from "path";

// Reads the deployed Presale's constructor params back off-chain and verifies it.
async function main() {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const presaleAddr = d.contracts.Presale as string;
  const tokenAddr = d.contracts.MemeToken as string;
  const deployer = d.deployer as string;

  const p = await ethers.getContractAt("Presale", presaleAddr);

  const rate = await p.rate();
  const softCap = await p.softCap();
  const hardCap = await p.hardCap();
  const minPerWallet = await p.minPerWallet();
  const maxPerWallet = await p.maxPerWallet();
  const startTime = await p.startTime();
  const endTime = await p.endTime();

  const args = [
    tokenAddr,
    rate,
    softCap,
    hardCap,
    minPerWallet,
    maxPerWallet,
    startTime,
    endTime,
    deployer,
  ];

  console.log("Presale:", presaleAddr);
  console.log("Constructor args:", args.map(String));

  try {
    await run("verify:verify", {
      address: presaleAddr,
      constructorArguments: args,
    });
    console.log("Presale verified.");
  } catch (e: any) {
    if (String(e?.message || e).toLowerCase().includes("already verified")) {
      console.log("Presale already verified.");
    } else {
      throw e;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
