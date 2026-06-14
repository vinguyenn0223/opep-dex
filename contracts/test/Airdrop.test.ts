import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Leaf = keccak256(abi.encodePacked(index, account, amount))
function leafHash(index: number, account: string, amount: bigint): string {
  return ethers.solidityPackedKeccak256(
    ["uint256", "address", "uint256"],
    [index, account, amount]
  );
}

// OZ MerkleProof uses commutative (sorted-pair) hashing.
function hashPair(a: string, b: string): string {
  const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [lo, hi]);
}

// Build a Merkle tree from leaves; returns root and a proof generator.
function buildTree(leaves: string[]) {
  let layers: string[][] = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 === prev.length) {
        next.push(prev[i]); // odd one out promoted
      } else {
        next.push(hashPair(prev[i], prev[i + 1]));
      }
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
      if (pairIndex < layer.length) {
        p.push(layer[pairIndex]);
      }
      idx = Math.floor(idx / 2);
    }
    return p;
  }

  return { root, proof };
}

describe("MerkleAirdrop", () => {
  const SUPPLY = ethers.parseEther("1000000000");

  async function deploy() {
    const signers = await ethers.getSigners();
    const [deployer, treasury, alice, bob, carol] = signers;

    const Token = await ethers.getContractFactory("MemeToken");
    const token = await Token.deploy("OpnPepe", "OPEPE", SUPPLY, treasury.address);
    await token.waitForDeployment();

    // Airdrop allocations.
    const recipients = [
      { index: 0, account: alice.address, amount: ethers.parseEther("1000") },
      { index: 1, account: bob.address, amount: ethers.parseEther("2000") },
      { index: 2, account: carol.address, amount: ethers.parseEther("3000") },
    ];
    const leaves = recipients.map((r) => leafHash(r.index, r.account, r.amount));
    const { root, proof } = buildTree(leaves);

    const now = await time.latest();
    const deadline = now + 7 * 24 * 3600;

    const Airdrop = await ethers.getContractFactory("MerkleAirdrop");
    const airdrop = await Airdrop.deploy(
      await token.getAddress(),
      root,
      deadline,
      deployer.address
    );
    await airdrop.waitForDeployment();

    // Fund the airdrop with the total allocation.
    const total = recipients.reduce((s, r) => s + r.amount, 0n);
    await token.connect(treasury).transfer(await airdrop.getAddress(), total);

    return { token, airdrop, recipients, proof, deployer, alice, bob, carol, deadline };
  }

  it("lets eligible users claim their allocation once", async () => {
    const { token, airdrop, recipients, proof, alice } = await deploy();
    const r = recipients[0];

    expect(await airdrop.isClaimed(0)).to.equal(false);
    await airdrop.claim(r.index, r.account, r.amount, proof(0));
    expect(await token.balanceOf(alice.address)).to.equal(r.amount);
    expect(await airdrop.isClaimed(0)).to.equal(true);

    // Second claim reverts.
    await expect(airdrop.claim(r.index, r.account, r.amount, proof(0))).to.be.revertedWith(
      "already claimed"
    );
  });

  it("rejects a claim with a wrong amount", async () => {
    const { airdrop, recipients, proof } = await deploy();
    const r = recipients[1];
    await expect(
      airdrop.claim(r.index, r.account, ethers.parseEther("9999"), proof(1))
    ).to.be.revertedWith("invalid proof");
  });

  it("lets all recipients claim", async () => {
    const { token, airdrop, recipients, proof, alice, bob, carol } = await deploy();
    await airdrop.claim(0, recipients[0].account, recipients[0].amount, proof(0));
    await airdrop.claim(1, recipients[1].account, recipients[1].amount, proof(1));
    await airdrop.claim(2, recipients[2].account, recipients[2].amount, proof(2));
    expect(await token.balanceOf(alice.address)).to.equal(recipients[0].amount);
    expect(await token.balanceOf(bob.address)).to.equal(recipients[1].amount);
    expect(await token.balanceOf(carol.address)).to.equal(recipients[2].amount);
  });

  it("sweeps leftovers only after the deadline", async () => {
    const { token, airdrop, recipients, proof, deployer, deadline } = await deploy();
    await airdrop.claim(0, recipients[0].account, recipients[0].amount, proof(0));

    await expect(airdrop.sweep()).to.be.revertedWith("window open");

    await time.increaseTo(deadline + 1);
    const before = await token.balanceOf(deployer.address);
    await airdrop.sweep();
    const after = await token.balanceOf(deployer.address);
    // Remaining = 2000 + 3000 = 5000 (alice's 1000 already claimed).
    expect(after - before).to.equal(ethers.parseEther("5000"));
  });
});
