import { expect } from "chai";
import { ethers } from "hardhat";

const SUPPLY = ethers.parseEther("1000000000");

async function deployDex() {
  const [deployer, lp, trader] = await ethers.getSigners();

  const Factory = await ethers.getContractFactory("DexFactory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();

  const WOPN = await ethers.getContractFactory("WOPN");
  const wopn = await WOPN.deploy();
  await wopn.waitForDeployment();

  const Router = await ethers.getContractFactory("DexRouter");
  const router = await Router.deploy(await factory.getAddress(), await wopn.getAddress());
  await router.waitForDeployment();

  const Token = await ethers.getContractFactory("MemeToken");
  const tokenA = await Token.deploy("TokenA", "TKA", SUPPLY, deployer.address);
  const tokenB = await Token.deploy("TokenB", "TKB", SUPPLY, deployer.address);
  await tokenA.waitForDeployment();
  await tokenB.waitForDeployment();

  return { deployer, lp, trader, factory, wopn, router, tokenA, tokenB };
}

describe("DEX core", () => {
  it("creates a pair via factory", async () => {
    const { factory, tokenA, tokenB } = await deployDex();
    await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
    const pair = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    expect(pair).to.not.equal(ethers.ZeroAddress);
    expect(await factory.allPairsLength()).to.equal(1n);
  });

  it("adds liquidity and mints LP tokens", async () => {
    const { deployer, router, tokenA, tokenB, factory } = await deployDex();
    const amount = ethers.parseEther("10000");

    await tokenA.approve(await router.getAddress(), amount);
    await tokenB.approve(await router.getAddress(), amount);

    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
    await router.addLiquidity(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      amount,
      amount,
      0,
      0,
      deployer.address,
      deadline
    );

    const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    const pair = await ethers.getContractAt("DexPair", pairAddr);
    expect(await pair.balanceOf(deployer.address)).to.be.gt(0n);
  });

  it("swaps tokens through the router", async () => {
    const { deployer, trader, router, tokenA, tokenB, factory } = await deployDex();
    const liq = ethers.parseEther("100000");

    await tokenA.approve(await router.getAddress(), liq);
    await tokenB.approve(await router.getAddress(), liq);
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
    await router.addLiquidity(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      liq,
      liq,
      0,
      0,
      deployer.address,
      deadline
    );

    const swapIn = ethers.parseEther("1000");
    await tokenA.transfer(trader.address, swapIn);
    await tokenA.connect(trader).approve(await router.getAddress(), swapIn);

    const before = await tokenB.balanceOf(trader.address);
    await router
      .connect(trader)
      .swapExactTokensForTokens(
        swapIn,
        0,
        [await tokenA.getAddress(), await tokenB.getAddress()],
        trader.address,
        deadline
      );
    const after = await tokenB.balanceOf(trader.address);
    expect(after - before).to.be.gt(0n);
  });

  it("removes liquidity back to underlying tokens", async () => {
    const { deployer, router, tokenA, tokenB, factory } = await deployDex();
    const amount = ethers.parseEther("10000");

    await tokenA.approve(await router.getAddress(), amount);
    await tokenB.approve(await router.getAddress(), amount);
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
    await router.addLiquidity(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      amount,
      amount,
      0,
      0,
      deployer.address,
      deadline
    );

    const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    const pair = await ethers.getContractAt("DexPair", pairAddr);
    const lpBal = await pair.balanceOf(deployer.address);

    await pair.approve(await router.getAddress(), lpBal);
    const aBefore = await tokenA.balanceOf(deployer.address);
    await router.removeLiquidity(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      lpBal,
      0,
      0,
      deployer.address,
      deadline
    );
    const aAfter = await tokenA.balanceOf(deployer.address);
    expect(aAfter - aBefore).to.be.gt(0n);
  });
});
