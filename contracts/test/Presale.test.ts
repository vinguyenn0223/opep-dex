import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Presale", () => {
  const SUPPLY = ethers.parseEther("1000000000");
  const RATE = ethers.parseEther("1000"); // 1000 tokens per 1 OPN
  const SOFTCAP = ethers.parseEther("10");
  const HARDCAP = ethers.parseEther("100");
  const MIN = ethers.parseEther("0.1");
  const MAX = ethers.parseEther("50");

  async function deploy() {
    const [deployer, treasury, alice, bob] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MemeToken");
    const token = await Token.deploy("OpnPepe", "OPEPE", SUPPLY, treasury.address);
    await token.waitForDeployment();

    const now = await time.latest();
    const start = now + 60;
    const end = start + 3600;

    const Presale = await ethers.getContractFactory("Presale");
    const presale = await Presale.deploy(
      await token.getAddress(),
      RATE,
      SOFTCAP,
      HARDCAP,
      MIN,
      MAX,
      start,
      end,
      deployer.address
    );
    await presale.waitForDeployment();

    // Fund presale with tokens for the full hardcap.
    const tokensForHardcap = (HARDCAP * RATE) / ethers.parseEther("1");
    await token.connect(treasury).transfer(await presale.getAddress(), tokensForHardcap);

    return { token, presale, deployer, treasury, alice, bob, start, end };
  }

  it("accepts contributions within the window and caps", async () => {
    const { presale, alice, start } = await deploy();
    await time.increaseTo(start + 1);
    await presale.connect(alice).contribute({ value: ethers.parseEther("5") });
    expect(await presale.contributed(alice.address)).to.equal(ethers.parseEther("5"));
    expect(await presale.totalRaised()).to.equal(ethers.parseEther("5"));
  });

  it("rejects below min and above max per wallet", async () => {
    const { presale, alice, start } = await deploy();
    await time.increaseTo(start + 1);
    await expect(
      presale.connect(alice).contribute({ value: ethers.parseEther("0.05") })
    ).to.be.revertedWith("below min");
    await expect(
      presale.connect(alice).contribute({ value: ethers.parseEther("60") })
    ).to.be.revertedWith("above max");
  });

  it("happy path: softcap reached, buyers claim, owner withdraws", async () => {
    const { token, presale, deployer, alice, bob, start, end } = await deploy();
    await time.increaseTo(start + 1);
    await presale.connect(alice).contribute({ value: ethers.parseEther("8") });
    await presale.connect(bob).contribute({ value: ethers.parseEther("4") });

    await time.increaseTo(end + 1);
    await presale.finalize();
    expect(await presale.softCapReached()).to.equal(true);

    await presale.connect(alice).claim();
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("8000"));

    const before = await ethers.provider.getBalance(deployer.address);
    const tx = await presale.connect(deployer).ownerWithdraw();
    const rc = await tx.wait();
    const gas = rc!.gasUsed * rc!.gasPrice;
    const after = await ethers.provider.getBalance(deployer.address);
    expect(after - before + gas).to.equal(ethers.parseEther("12"));
  });

  it("failure path: softcap missed, buyers refund", async () => {
    const { presale, alice, start, end } = await deploy();
    await time.increaseTo(start + 1);
    await presale.connect(alice).contribute({ value: ethers.parseEther("5") });

    await time.increaseTo(end + 1);
    await presale.finalize();
    expect(await presale.softCapReached()).to.equal(false);

    const before = await ethers.provider.getBalance(alice.address);
    const tx = await presale.connect(alice).refund();
    const rc = await tx.wait();
    const gas = rc!.gasUsed * rc!.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);
    expect(after - before + gas).to.equal(ethers.parseEther("5"));
  });
});
