import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Retries verifying the auto-generated DexPair (CREATE2) until Blockscout's
// internal-tx indexer recognizes it as a contract. Run any time:
//   npx hardhat run scripts/verify-pair.ts --network opn

const MAX_ATTEMPTS = Number(process.env.PAIR_VERIFY_ATTEMPTS || "20");
const DELAY_MS = Number(process.env.PAIR_VERIFY_DELAY_MS || "60000"); // 60s

function loadPair(): string {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  return d.contracts.Pair as string;
}

async function main() {
  const pair = loadPair();
  if (!pair) throw new Error("No Pair address in deployment file");
  console.log(`Verifying Pair ${pair} on ${network.name} (up to ${MAX_ATTEMPTS} attempts)`);

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    try {
      await run("verify:verify", { address: pair, constructorArguments: [] });
      console.log(`\nPair verified on attempt ${i}.`);
      return;
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.toLowerCase().includes("already verified")) {
        console.log("\nPair already verified.");
        return;
      }
      console.log(`  attempt ${i}/${MAX_ATTEMPTS} failed: ${msg.split("\n").filter(Boolean).pop()}`);
      if (i < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  console.log("\nGave up — Blockscout's internal-tx indexer hasn't indexed the CREATE2 pair yet. Re-run later.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
