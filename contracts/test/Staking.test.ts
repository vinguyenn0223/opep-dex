import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("StakingRewards", () => {
  const SUPPLY = ethers.parseEther("1000000000");
  const REWARD = ethers.parseEther("604800"); // 1 token/sec over 7 days (604800s)
  const STAKE = ethers.parseEther("100");

  async function deploy() {
    const [deployer, treasury, alice, bob] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MemeToken");
    // staking token and rewards token (reuse MemeToken for both)
    const stakeToken = await Token.deploy("StakeLP", "SLP", SUPPLY, treasury.address);
    await stakeToken.waitForDeployment();
    const rewardToken = await Token.deploy("OpnPepe", "OPEPE", SUPPLY, treasury.address);
    await rewardToken.waitForDeployment();

    const Staking = await ethers.getContractFactory("StakingRewards");
    const staking = await Staking.deploy(
      await rewardToken.getAddress(),
      await stakeToken.getAddress(),
      deployer.address
    );
    await staking.waitForDeployment();

    // Fund staking contract with rewards, then notify.
    await rewardToken.connect(treasury).transfer(await staking.getAddress(), REWARD);

    // Give alice and bob some stake tokens.
    await stakeToken.connect(treasury).transfer(alice.address, STAKE);
    await stakeToken.connect(treasury).transfer(bob.address, STAKE);

    return { staking, stakeToken, rewardToken, deployer, treasury, alice, bob };
  }

  it("stakes and accrues rewards over time", async () => {
    const { staking, stakeToken, alice } = await deploy();
    await staking.notifyRewardAmount(REWARD);

    await stakeToken.connect(alice).approve(await staking.getAddress(), STAKE);
    await staking.connect(alice).stake(STAKE);
    expect(await staking.balanceOf(alice.address)).to.equal(STAKE);

    // Advance ~1 day; alice is the only staker so she earns ~1 token/sec.
    await time.increase(86400);
    const earned = await staking.earned(alice.address);
    // ~86400 tokens (allow small rounding)
    expect(earned).to.be.greaterThan(ethers.parseEther("86000"));
    expect(earned).to.be.lessThan(ethers.parseEther("86500"));
  });

  it("splits rewards between two stakers proportionally", async () => {
    const { staking, stakeToken, alice, bob } = await deploy();
    await staking.notifyRewardAmount(REWARD);

    await stakeToken.connect(alice).approve(await staking.getAddress(), STAKE);
    await stakeToken.connect(bob).approve(await staking.getAddress(), STAKE);
    await staking.connect(alice).stake(STAKE);
    await staking.connect(bob).stake(STAKE);

    await time.increase(86400);
    const a = await staking.earned(alice.address);
    const b = await staking.earned(bob.address);
    // Equal stakes -> roughly equal rewards. Alice stakes one block (1s)
    // before bob, so she earns ~1 token (rewardRate) more; allow a small margin.
    const diff = a > b ? a - b : b - a;
    expect(diff).to.be.lessThanOrEqual(ethers.parseEther("2"));
  });

  it("pays out rewards on getReward and unstakes on exit", async () => {
    const { staking, stakeToken, rewardToken, alice } = await deploy();
    await staking.notifyRewardAmount(REWARD);

    await stakeToken.connect(alice).approve(await staking.getAddress(), STAKE);
    await staking.connect(alice).stake(STAKE);

    await time.increase(86400);
    await staking.connect(alice).exit();

    // Stake returned.
    expect(await stakeToken.balanceOf(alice.address)).to.equal(STAKE);
    // Rewards paid.
    expect(await rewardToken.balanceOf(alice.address)).to.be.greaterThan(
      ethers.parseEther("86000")
    );
    expect(await staking.balanceOf(alice.address)).to.equal(0n);
  });
});
