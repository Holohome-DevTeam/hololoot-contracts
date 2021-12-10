import { waffle } from "hardhat";
import { expect } from "chai";

import StakingArtifacts from "../../artifacts/contracts/staking/Staking.sol/Staking.json";
import TokenArtifacts from "../../artifacts/contracts/Hololoot.sol/Hololoot.json";

import { Staking, Hololoot } from "../../typechain";
import { Wallet } from "ethers";
import { getBigNumber, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;

const ERR_NOTHING_STAKED: string = "nothing staked";
const ERR_CANNOT_UNSTAKE: string = "cannot unstake";

describe("Staking contract math", () => {
  const [deployer, alice, bob, carol, don, eva, fiona, fee] = provider.getWallets() as Wallet[];

  let staking: Staking;
  let token: Hololoot;

  const one_day = 24 * 60 * 60;
  const seven_days = 7 * 24 * 60 * 60;
  const thirty_days = 30 * 24 * 60 * 60;

  beforeEach(async () => {
    token = (await deployContract(deployer, TokenArtifacts, [deployer.address])) as Hololoot;
    staking = (await deployContract(deployer, StakingArtifacts, [])) as Staking;

    // init
    await staking.init(token.address, fee.address);
    await staking.updatePeriodLength(seven_days);
    await staking.updateTimeToUnstake(seven_days);
    await staking.updateFee(1000);

    // update test account alice balance and allowances
    await token.transfer(alice.address, getBigNumber(1000));
    await token.connect(alice).approve(staking.address, getBigNumber(1000));

    // update test account bob balance and allowances
    await token.transfer(bob.address, getBigNumber(1000));
    await token.connect(bob).approve(staking.address, getBigNumber(1000));

    // update test account carol balance and allowances
    await token.transfer(carol.address, getBigNumber(1000));
    await token.connect(carol).approve(staking.address, getBigNumber(1000));

    // update test account don balance and allowances
    await token.transfer(don.address, getBigNumber(1000));
    await token.connect(don).approve(staking.address, getBigNumber(1000));

    // update test account eva balance and allowances
    await token.transfer(eva.address, getBigNumber(1000));
    await token.connect(eva).approve(staking.address, getBigNumber(1000));

    // update test account fiona balance and allowances
    await token.transfer(fiona.address, getBigNumber(1000000));
    await token.connect(fiona).approve(staking.address, getBigNumber(1000000));
  });

  describe("Math test", () => {
    it("it should work", async () => {
      await token.approve(staking.address, getBigNumber(6048));
      await staking.notifyRewardAmount(getBigNumber(6048));

      await advanceTimeAndBlock(one_day);

      await staking.connect(alice).addStake(getBigNumber(100));
      await staking.connect(bob).addStake(getBigNumber(100));

      await expect(staking.connect(carol).claim()).to.be.revertedWith(ERR_NOTHING_STAKED);
      await expect(staking.connect(carol).unstakeWithFee()).to.be.revertedWith(ERR_NOTHING_STAKED);

      await expect(staking.connect(carol).requestUnstake()).to.be.reverted;

      await advanceTimeAndBlock(one_day);

      await staking.connect(don).addStake(getBigNumber(100));
      await staking.connect(eva).addStake(getBigNumber(100));
      await staking.connect(fiona).addStake(getBigNumber(200));

      await advanceTimeAndBlock(one_day);

      await advanceTimeAndBlock(one_day);

      await staking.connect(alice).requestUnstake();

      await advanceTimeAndBlock(one_day);

      await expect(staking.connect(alice).addStake(getBigNumber(100))).to.be.reverted;

      await staking.connect(bob).claim();
      await expect(staking.connect(carol).claim()).to.be.revertedWith(ERR_NOTHING_STAKED);
      await expect(staking.connect(carol).restake()).to.be.reverted;

      await staking.connect(don).claim();
      await staking.connect(fiona).restake();

      await advanceTimeAndBlock(one_day);

      await staking.connect(fiona).addStake(getBigNumber(200));

      await advanceTimeAndBlock(one_day);

      await token.transfer(staking.address, getBigNumber(10000));
      await token.approve(staking.address, getBigNumber(6048));
      await staking.notifyRewardAmount(getBigNumber(6048));

      await advanceTimeAndBlock(one_day);

      await staking.connect(bob).claim();

      await staking.connect(don).claim();
      await staking.connect(fiona).restake();

      await advanceTimeAndBlock(one_day);

      await staking.connect(fiona).requestUnstake();

      await advanceTimeAndBlock(one_day);

      await staking.connect(eva).restake();

      await expect(staking.connect(alice).unstake()).to.be.reverted;

      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);

      await expect(staking.connect(alice).unstakeWithFee()).to.be.reverted;
      await staking.connect(alice).unstake();
      await expect(staking.connect(fiona).unstake()).to.be.revertedWith(ERR_CANNOT_UNSTAKE);
      await expect(staking.connect(carol).unstake()).to.be.revertedWith(ERR_NOTHING_STAKED);

      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);

      await token.transfer(staking.address, getBigNumber(10000));
      await token.approve(staking.address, getBigNumber(6048));
      await staking.notifyRewardAmount(getBigNumber(6048));

      await staking.connect(alice).addStake(getBigNumber(100));
      await staking.connect(bob).addStake(getBigNumber(100));
      await staking.connect(carol).addStake(getBigNumber(100));
      await staking.connect(don).addStake(getBigNumber(100));
      await staking.connect(eva).addStake(getBigNumber(100));

      await advanceTimeAndBlock(one_day);

      await staking.connect(fiona).claim();
      await staking.connect(fiona).unstake();
      await expect(staking.connect(fiona).claim()).to.be.reverted;
      await expect(staking.connect(fiona).restake()).to.be.reverted;

      await staking.connect(alice).claimTo(bob.address);
      await staking.connect(bob).restake();
      await staking.connect(carol).restake();
      await staking.connect(don).restake();
      await staking.connect(eva).restake();

      // + 20000 SNP
      await staking.connect(fiona).addStake(getBigNumber(200000));
      await staking.connect(fiona).requestUnstake();
      await staking.connect(fiona).unstakeWithFee();

      await advanceTimeAndBlock(seven_days);

      await token.approve(staking.address, getBigNumber(6048));
      await staking.notifyRewardAmount(getBigNumber(6048));

      await staking.connect(alice).restake();
      await staking.connect(bob).restake();
      await staking.connect(carol).restake();
      await staking.connect(don).restake();
      await staking.connect(eva).restake();

      await advanceTimeAndBlock(seven_days);

      await token.approve(staking.address, getBigNumber(6048));
      await staking.notifyRewardAmount(getBigNumber(6048));

      await staking.connect(alice).claim();
      await staking.connect(bob).claim();
      await staking.connect(carol).claim();
      await staking.connect(don).claim();
      await staking.connect(eva).claim();
      await expect(staking.connect(fiona).restake()).to.be.revertedWith(ERR_NOTHING_STAKED);

      await staking.connect(alice).claim();
      await staking.connect(bob).claim();
      await staking.connect(carol).claim();
      await staking.connect(don).claim();
      await staking.connect(eva).claim();
      await expect(staking.connect(fiona).claim()).to.be.revertedWith(ERR_NOTHING_STAKED);

      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);

      await staking.connect(alice).claim();
      await staking.connect(bob).claim();
      await staking.connect(carol).claim();
      await staking.connect(don).claim();
      await staking.connect(eva).claim();
      await expect(staking.connect(fiona).claim()).to.be.revertedWith(ERR_NOTHING_STAKED);

      await token.approve(staking.address, getBigNumber(6048));
      await staking.notifyRewardAmount(getBigNumber(6048));

      await staking.connect(alice).requestUnstake();

      await token.transfer(staking.address, getBigNumber(20000));

      await advanceTimeAndBlock(seven_days);

      await expect(staking.connect(alice).addStake(getBigNumber(10))).to.be.reverted;

      await expect(staking.connect(bob).addStake(0)).to.be.reverted;
      await staking.connect(bob).addStake(getBigNumber(10));

      await staking.connect(eva).requestUnstake();
      await expect(staking.connect(eva).requestUnstake()).to.be.reverted;

      await staking.connect(eva).claim();
      await expect(staking.connect(eva).claim()).to.be.reverted;
      await expect(staking.connect(eva).restake()).to.be.reverted;

      await advanceTimeAndBlock(one_day);
      await advanceTimeAndBlock(one_day);

      await staking.connect(bob).restake();

      await staking.claimable(don.address);
      await staking.claimable(eva.address);

      await staking.connect(alice).unstake();
      await staking.connect(alice).addStake(getBigNumber(10));
      await staking.connect(alice).requestUnstake();
      await staking.connect(alice).unstakeWithFee();

      await advanceTimeAndBlock(seven_days);

      await expect(staking.connect(bob).claim()).to.be.revertedWith("nothing to claim");
      await staking.connect(carol).claim();
      await staking.connect(don).claim();
      await expect(staking.connect(fiona).claim()).to.be.revertedWith(ERR_NOTHING_STAKED);

      await advanceTimeAndBlock(thirty_days);

      await expect(staking.connect(alice).requestUnstake()).to.be.reverted;
      await staking.connect(bob).requestUnstake();
      await staking.connect(carol).requestUnstake();
      await staking.connect(don).requestUnstake();
      await expect(staking.connect(eva).requestUnstake()).to.be.reverted;
      await expect(staking.connect(fiona).requestUnstake()).to.be.reverted;

      await advanceTimeAndBlock(seven_days);

      await expect(staking.connect(alice).unstake()).to.be.reverted;
      await staking.connect(bob).unstake();
      await staking.connect(carol).unstake();
      await staking.connect(don).unstake();
      await staking.connect(eva).unstake();
      await expect(staking.connect(fiona).unstake()).to.be.revertedWith(ERR_NOTHING_STAKED);

      const stakedTokens = await staking.stakedTokens();

      expect(stakedTokens).to.be.equal(0);
    });
  });
});
