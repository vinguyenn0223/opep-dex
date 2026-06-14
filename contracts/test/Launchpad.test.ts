import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Launchpad", () => {
  const SUPPLY = ethers.parseEther("1000000000");
  const RATE = ethers.parseEther("1000"); // 1000 tokens per 1 OPN
  const SOFTCAP = ethers.parseEther("10");
  const HARDCAP = ethers.parseEther("100");
  const MIN = ethers.parseEther("0.1");
  const MAX = ethers.parseEther("50");
  const FEE = ethers.parseEther("1");

  async function deploy() {
    const [deployer, feeRecipient, creator, alice] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MemeToken");
    const token = await Token.deploy("ProjectX", "PX", SUPPLY, creator.address);
    await token.waitForDeployment();

    const Launchpad = await ethers.getContractFactory("Launchpad");
    const launchpad = await Launchpad.deploy(FEE, feeRecipient.address, deployer.address);
    await launchpad.waitForDeployment();

    return { token, launchpad, deployer, feeRecipient, creator, alice };
  }

  function saleParams(tokenAddr: string, start: number, end: number) {
    return {
      token: tokenAddr,
      rate: RATE,
      softCap: SOFTCAP,
      hardCap: HARDCAP,
      minPerWallet: MIN,
      maxPerWallet: MAX,
      startTime: start,
      endTime: end,
    };
  }

  it("creates a sale, funds the presale with tokens, and charges the fee", async () => {
    const { token, launchpad, feeRecipient, creator } = await deploy();
    const now = await time.latest();
    const start = now + 60;
    const end = start + 3600;

    const tokensNeeded = (HARDCAP * RATE) / ethers.parseEther("1");
    await token.connect(creator).approve(await launchpad.getAddress(), tokensNeeded);

    const feeBefore = await ethers.provider.getBalance(feeRecipient.address);
    const tx = await launchpad
      .connect(creator)
      .createSale(saleParams(await token.getAddress(), start, end), { value: FEE });
    await tx.wait();

    expect(await launchpad.allSalesLength()).to.equal(1n);

    const info = await launchpad.sales(0);
    expect(info.creator).to.equal(creator.address);
    expect(info.token).to.equal(await token.getAddress());

    // Presale was funded with the tokens needed for the hard cap.
    expect(await token.balanceOf(info.presale)).to.equal(tokensNeeded);

    // Fee landed with the recipient.
    const feeAfter = await ethers.provider.getBalance(feeRecipient.address);
    expect(feeAfter - feeBefore).to.equal(FEE);

    // Presale is owned by the creator.
    const presale = await ethers.getContractAt("Presale", info.presale);
    expect(await presale.owner()).to.equal(creator.address);
  });

  it("refunds fee overpayment and tracks sales by creator", async () => {
    const { token, launchpad, creator } = await deploy();
    const now = await time.latest();
    const start = now + 60;
    const end = start + 3600;

    const tokensNeeded = (HARDCAP * RATE) / ethers.parseEther("1");
    await token.connect(creator).approve(await launchpad.getAddress(), tokensNeeded);

    await launchpad
      .connect(creator)
      .createSale(saleParams(await token.getAddress(), start, end), {
        value: FEE + ethers.parseEther("0.5"),
      });

    const ids = await launchpad.getSalesByCreator(creator.address);
    expect(ids.length).to.equal(1);
    expect(ids[0]).to.equal(0n);
  });

  it("reverts when the creation fee is underpaid", async () => {
    const { token, launchpad, creator } = await deploy();
    const now = await time.latest();
    const start = now + 60;
    const end = start + 3600;

    await expect(
      launchpad
        .connect(creator)
        .createSale(saleParams(await token.getAddress(), start, end), {
          value: ethers.parseEther("0.5"),
        })
    ).to.be.revertedWith("fee");
  });
});
