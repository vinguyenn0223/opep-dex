import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Leaf = keccak256(abi.encodePacked(index, account, amount)) — must match MerkleAirdrop.sol.
function leafHash(index: number, account: string, amount: bigint): string {
  return ethers.solidityPackedKeccak256(
    ["uint256", "address", "uint256"],
    [index, account, amount]
  );
}

// OZ MerkleProof verifies with commutative (sorted-pair) hashing.
function hashPair(a: string, b: string): string {
  const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [lo, hi]);
}

function buildTree(leaves: string[]) {
  const layers: string[][] = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 === prev.length) next.push(prev[i]);
      else next.push(hashPair(prev[i], prev[i + 1]));
    }
    layers.push(next);
  }
  const root = layers[layers.length - 1][0];
  function proof(index: number): string[] {
    const p: string[] = [];
    let idx = index;
    for (let l = 0; l < layers.length - 1; l++) {
      const layer = layers[l];
      const pairIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (pairIndex < layer.length) p.push(layer[pairIndex]);
      idx = Math.floor(idx / 2);
    }
    return p;
  }
  return { root, proof };
}

type Recipient = { address: string; amount: string };

async function main() {
  // 1. Load recipients (address + amount in whole tokens).
  const recipientsFile = path.join(__dirname, "..", "airdrop-recipients.json");
  const raw = JSON.parse(fs.readFileSync(recipientsFile, "utf8")) as Recipient[];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("airdrop-recipients.json is empty or invalid");
  }

  // 2. Build leaves (index = position in the list).
  const entries = raw.map((r, index) => ({
    index,
    account: ethers.getAddress(r.address),
    amount: ethers.parseEther(r.amount),
  }));
  const leaves = entries.map((e) => leafHash(e.index, e.account, e.amount));
  const { root, proof } = buildTree(leaves);

  const total = entries.reduce((s, e) => s + e.amount, 0n);
  console.log(`Recipients: ${entries.length}`);
  console.log(`Total allocation: ${ethers.formatEther(total)} tokens`);
  console.log(`Merkle root: ${root}`);

  // 3. Build the claims file for the frontend: { [address]: { index, amount, proof } }
  const claims: Record<string, { index: number; amount: string; proof: string[] }> = {};
  for (const e of entries) {
    claims[e.account] = {
      index: e.index,
      amount: e.amount.toString(),
      proof: proof(e.index),
    };
  }

  // Write claims to both contracts/ (record) and web/ (frontend reads this).
  const outRecord = path.join(__dirname, "..", "deployments", `airdrop-claims.${network.name}.json`);
  fs.mkdirSync(path.dirname(outRecord), { recursive: true });
  fs.writeFileSync(outRecord, JSON.stringify(claims, null, 2));
  const webClaims = path.join(__dirname, "..", "..", "web", "src", "config", "airdrop.json");
  try {
    fs.writeFileSync(webClaims, JSON.stringify(claims, null, 2));
    console.log(`Claims written to web/src/config/airdrop.json`);
  } catch {
    console.log(`Claims written to ${outRecord} (web mirror skipped)`);
  }

  // 4. Set the root on the deployed MerkleAirdrop contract.
  const deployFile = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const deployment = JSON.parse(fs.readFileSync(deployFile, "utf8"));
  const airdropAddr = deployment.contracts.MerkleAirdrop as string;
  const tokenAddr = deployment.contracts.MemeToken as string;

  const [deployer] = await ethers.getSigners();
  const airdrop = await ethers.getContractAt("MerkleAirdrop", airdropAddr, deployer);

  const tx = await airdrop.setMerkleRoot(root);
  await tx.wait();
  console.log(`setMerkleRoot tx: ${tx.hash}`);

  // 5. Fund the airdrop contract with the total allocation (if not already funded).
  const token = await ethers.getContractAt("MemeToken", tokenAddr, deployer);
  const balance: bigint = await token.balanceOf(airdropAddr);
  if (balance < total) {
    const fundTx = await token.transfer(airdropAddr, total - balance);
    await fundTx.wait();
    console.log(`Funded airdrop with ${ethers.formatEther(total - balance)} tokens (tx: ${fundTx.hash})`);
  } else {
    console.log(`Airdrop already holds ${ethers.formatEther(balance)} tokens — no funding needed`);
  }

  console.log("Airdrop ready. Recipients can now claim on the /airdrop page.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
