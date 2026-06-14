import { expect } from "chai";
import { ethers } from "hardhat";

describe("MemeToken (OPEPE)", () => {
  const NAME = "OpnPepe";
  const SYMBOL = "OPEPE";
  const SUPPLY = ethers.parseEther("1000000000"); // 1B

  async function deploy() {
    const [deployer, treasury, user] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MemeToken");
    const token = await Token.deploy(NAME, SYMBOL, SUPPLY, treasury.address);
    await token.waitForDeployment();
    return { token, deployer, treasury, user };
  }

  it("mints full supply to treasury", async () => {
    const { token, treasury } = await deploy();
    expect(await token.name()).to.equal(NAME);
    expect(await token.symbol()).to.equal(SYMBOL);
    expect(await token.totalSupply()).to.equal(SUPPLY);
    expect(await token.balanceOf(treasury.address)).to.equal(SUPPLY);
  });

  it("transfers and burns", async () => {
    const { token, treasury, user } = await deploy();
    const amount = ethers.parseEther("100");
    await token.connect(treasury).transfer(user.address, amount);
    expect(await token.balanceOf(user.address)).to.equal(amount);

    await token.connect(user).burn(amount);
    expect(await token.balanceOf(user.address)).to.equal(0n);
    expect(await token.totalSupply()).to.equal(SUPPLY - amount);
  });
});
