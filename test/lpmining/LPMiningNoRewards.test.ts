import { waffle } from "hardhat";
import { expect } from "chai";

import LPMiningArtifacts from "../../artifacts/contracts/staking/LPMining.sol/LPMining.json";
import TokenArtifacts from "../../artifacts/contracts/Hololoot.sol/Hololoot.json";
import ERC20MockArtifact from "../../artifacts/contracts/mocks/ERC20Mock.sol/ERC20Mock.json";

import { LPMining, Hololoot, ERC20Mock } from "../../typechain";
import { Wallet } from "ethers";
import { getBigNumber, latest, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;

const ERR_WITHDRAWING: string = "cannot when withdrawing";
const ERR_NO_STAKE: string = "nothing staked";
const ERR_NO_RESTAKE: string = "nothing to restake";
const ERR_NO_CLAIM: string = "nothing to claim";
const ERR_ZERO_AMOUNT: string = "zero amount";
const ERR_UNSTAKE: string = "cannot unstake";
const ERR_UNSTAKE_FIRST: string = "unstake first";

const ERR_TRANSFER_FROM: string = "SafeERC20: TransferFrom failed";

describe("LPMining contract without rewards", () => {
  const [deployer, alice, bob, carol, fee] = provider.getWallets() as Wallet[];

  let staking: LPMining;
  let token: Hololoot;
  let lpToken: ERC20Mock;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  const seven_days = 7 * 24 * 60 * 60;

  beforeEach(async () => {
    lpToken = (await deployContract(deployer, ERC20MockArtifact, ["LP", "Pair", 18, getBigNumber(25000000)])) as ERC20Mock;
    token = (await deployContract(deployer, TokenArtifacts, [deployer.address])) as Hololoot;
    staking = (await deployContract(deployer, LPMiningArtifacts, [])) as LPMining;

    // init
    await staking.init(lpToken.address, token.address, fee.address);
    await staking.updatePeriodLength(seven_days);
    await staking.updateTimeToUnstake(seven_days);
    await staking.updateFee(1000);

    // init antibot + whitelist + exclude
    await token.initAntibot();
    await token.whitelistAccount(staking.address, true);
    await token.setExcludedFromFees(staking.address, true);

    // update test account alice balance and allowances
    await lpToken.transfer(alice.address, getBigNumber(1000));
    await lpToken.connect(alice).approve(staking.address, getBigNumber(1000));

    // update test account bob balance and allowances
    await lpToken.transfer(bob.address, getBigNumber(1000));
    await lpToken.connect(bob).approve(staking.address, getBigNumber(1000));

    // update test account carol balance and allowances
    await lpToken.transfer(carol.address, getBigNumber(1000));
    await lpToken.connect(carol).approve(staking.address, getBigNumber(1000));
  });

  describe("init", () => {
    it("should revert when _stakingToken address is 0", async function () {
      const _staking = (await deployContract(deployer, LPMiningArtifacts, [])) as LPMining;
      await expect(_staking.init(ZERO_ADDRESS, token.address, fee.address)).to.be.revertedWith("_stakingToken address cannot be 0");
    });

    it("should revert when _rewardsToken address is 0", async function () {
      const _staking = (await deployContract(deployer, LPMiningArtifacts, [])) as LPMining;
      await expect(_staking.init(lpToken.address, ZERO_ADDRESS, fee.address)).to.be.revertedWith("_rewardsToken address cannot be 0");
    });

    it("should revert when _feeCollector address is 0", async function () {
      const _staking = (await deployContract(deployer, LPMiningArtifacts, [])) as LPMining;
      await expect(_staking.init(lpToken.address, token.address, ZERO_ADDRESS)).to.be.revertedWith("_feeCollector address cannot be 0");
    });

    it("should revert when already initialized", async function () {
      await expect(staking.init(lpToken.address, token.address, fee.address)).to.be.revertedWith("init already done");
    });
  });

  describe("when initialized", () => {
    it("contract should have expected values", async function () {
      expect(await staking.stakingToken()).to.be.equal(lpToken.address);
      expect(await staking.rewardsToken()).to.be.equal(token.address);
      expect(await staking.feeCollector()).to.be.equal(fee.address);
      const timeToUnstake = await staking.timeToUnstake();
      expect(timeToUnstake["value"]).to.be.equal(seven_days);
      const unstakeFee = await staking.unstakeFee();
      expect(unstakeFee["value"]).to.be.equal(1000);
    });
  });

  describe("notifyRewardAmount", () => {
    it("should revert if not executed by rewards distributor", async () => {
      await expect(staking.connect(alice).notifyRewardAmount(getBigNumber(6048))).to.be.revertedWith("caller is not reward distributor");
    });

    it("rewards distributor should add rewards correctly", async () => {
      await token.approve(staking.address, getBigNumber(6048));
      await expect(staking.notifyRewardAmount(getBigNumber(6048)))
        .to.emit(staking, "Recalculation")
        .withArgs(getBigNumber(6048));
    });
  });

  describe("when adding tokens to stake", () => {
    it("addStake should revert when insufficient allowance is set", async () => {
      await expect(staking.connect(alice).addStake(getBigNumber(2000))).to.be.revertedWith(ERR_TRANSFER_FROM);
    });

    it("addStake should revert when insufficient balance", async () => {
      await token.connect(alice).approve(staking.address, getBigNumber(2000));
      await expect(staking.connect(alice).addStake(getBigNumber(2000))).to.be.revertedWith(ERR_TRANSFER_FROM);
    });

    it("addStake should revert with 0 amount", async () => {
      await expect(staking.connect(alice).addStake(0)).to.be.revertedWith(ERR_ZERO_AMOUNT);
    });

    it("addStake should revert when withdrawing", async () => {
      await staking.connect(alice).addStake(getBigNumber(1));
      await staking.connect(alice).requestUnstake();
      await expect(staking.connect(alice).addStake(getBigNumber(1))).to.be.revertedWith(ERR_WITHDRAWING);
    });
  });

  describe("without any stake", () => {
    it("requesting claim should revert", async () => {
      await expect(staking.connect(alice).claim()).to.be.revertedWith(ERR_NO_STAKE);
    });

    it("requesting unstake should revert", async () => {
      await expect(staking.connect(alice).unstake()).to.be.revertedWith(ERR_NO_STAKE);
    });

    it("requesting unstakeWithFee should revert", async () => {
      await expect(staking.connect(alice).unstakeWithFee()).to.be.revertedWith(ERR_NO_STAKE);
    });

    it("requesting requestUnstake should revert", async () => {
      await expect(staking.connect(alice).requestUnstake()).to.be.revertedWith(ERR_NO_STAKE);
    });
  });

  describe("Before staking start - when no rewards are added", () => {
    describe("when adding token stake", () => {
      it("user can add token stake correctly but rewards will not be counted", async () => {
        const start = await latest();
        await expect(staking.connect(alice).addStake(getBigNumber(100)))
          .to.emit(staking, "StakeAdded")
          .withArgs(alice.address, getBigNumber(100))
          .and.to.emit(lpToken, "Transfer")
          .withArgs(alice.address, staking.address, getBigNumber(100));

        const aliceStake = await staking.tokenStake(alice.address);
        expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
        expect(aliceStake["stakeStart"]).to.be.equal(start.add(1));

        expect(await staking.stakedTokens()).to.be.equal(getBigNumber(100));
        expect(await staking.rewardRate()).to.be.equal(0);
        expect(await staking.rewardPerTokenStored()).to.be.equal(0);
      });
    });

    describe("after adding only token stake", () => {
      beforeEach(async () => {
        await staking.connect(alice).addStake(getBigNumber(100));
        await staking.connect(bob).addStake(getBigNumber(100));
        await staking.connect(carol).addStake(getBigNumber(100));
      });

      it("claimable should return 0 as there are no rewards", async () => {
        const claimable = await staking.claimable(alice.address);
        expect(claimable).to.be.equal(0);
      });

      it("user can add new tokens to token stake but rewards still not be counted", async () => {
        await expect(staking.connect(alice).addStake(getBigNumber(100)))
          .to.emit(staking, "StakeAdded")
          .withArgs(alice.address, getBigNumber(100))
          .and.to.emit(lpToken, "Transfer")
          .withArgs(alice.address, staking.address, getBigNumber(100));

        const aliceStake = await staking.tokenStake(alice.address);
        expect(aliceStake["tokens"]).to.be.equal(getBigNumber(200));

        expect(await staking.stakedTokens()).to.be.equal(getBigNumber(400));
        expect(await staking.rewardRate()).to.be.equal(0);
        expect(await staking.rewardPerTokenStored()).to.be.equal(0);
      });

      it("should revert on claim as there are no tokens to claim", async () => {
        await expect(staking.connect(alice).claim()).to.be.revertedWith(ERR_NO_CLAIM);
      });

      it("unstakeWithFee should do nothing if not withdrawing", async () => {
        await expect(staking.connect(alice).unstakeWithFee()).to.not.emit(staking, "StakeRemoved");
      });

      describe("while requesting unstake", () => {
        it("should correctly request unstake but rewards will not be counted", async () => {
          const start = await latest();
          await expect(staking.connect(alice).requestUnstake()).to.emit(staking, "StakeRemoveRequested").withArgs(alice.address);

          const aliceStake = await staking.tokenStake(alice.address);
          expect(aliceStake["tokens"]).to.be.equal(getBigNumber(100));
          expect(aliceStake["rewards"]).to.be.equal(0);
          expect(aliceStake["isWithdrawing"]).to.be.equal(true);
          expect(aliceStake["withdrawalPossibleAt"]).to.be.equal(start.add(1).add(seven_days));
        });

        describe("after request unstake", () => {
          beforeEach(async () => {
            await staking.connect(alice).requestUnstake();
          });

          it("claimable should return 0 as there were no rewards", async () => {
            const claimable = await staking.claimable(alice.address);
            expect(claimable).to.be.equal(0);
          });

          it("should revert on next requestUnstake as user is already withdrawing", async () => {
            await expect(staking.connect(alice).requestUnstake()).to.be.revertedWith(ERR_WITHDRAWING);
          });

          describe("before 7 days of unstake period", () => {
            it("should revert when requesting unstake", async () => {
              await expect(staking.connect(alice).unstake()).to.be.revertedWith(ERR_UNSTAKE);
            });

            it("unstakeWithFee should correctly unstake tokens with 10% fee", async () => {
              await expect(staking.connect(alice).unstakeWithFee())
                .to.emit(staking, "StakeRemoved")
                .withArgs(alice.address, getBigNumber(100))
                .and.to.emit(lpToken, "Transfer")
                .withArgs(staking.address, alice.address, getBigNumber(90))
                .and.to.emit(lpToken, "Transfer")
                .withArgs(staking.address, fee.address, getBigNumber(10));

              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(0);
              expect(aliceStake["stakeStart"]).to.be.equal(0);

              expect(await staking.stakedTokens()).to.be.equal(getBigNumber(200));
              expect(await staking.rewardRate()).to.be.equal(0);
              expect(await staking.rewardPerTokenStored()).to.be.equal(0);

              expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(200));
              expect(await lpToken.balanceOf(fee.address)).to.be.equal(getBigNumber(10));
            });
          });

          describe("after 7 days of unstake period", () => {
            beforeEach(async () => {
              await advanceTimeAndBlock(seven_days);
            });

            it("unstake should correctly withdraw staked tokens without any rewards", async () => {
              await expect(staking.connect(alice).unstake())
                .to.emit(staking, "StakeRemoved")
                .withArgs(alice.address, getBigNumber(100))
                .and.to.emit(lpToken, "Transfer")
                .withArgs(staking.address, alice.address, getBigNumber(100));

              const aliceStake = await staking.tokenStake(alice.address);
              expect(aliceStake["tokens"]).to.be.equal(0);
              expect(aliceStake["stakeStart"]).to.be.equal(0);

              expect(await staking.stakedTokens()).to.be.equal(getBigNumber(200));
              expect(await staking.rewardRate()).to.be.equal(0);
              expect(await staking.rewardPerTokenStored()).to.be.equal(0);

              expect(await lpToken.balanceOf(staking.address)).to.be.equal(getBigNumber(200));
            });

            it("unstakeWithFee should revert as there is an option to unstake without fee", async () => {
              await expect(staking.connect(alice).unstakeWithFee()).to.be.revertedWith(ERR_UNSTAKE_FIRST);
            });
          });
        });
      });
    });
  });
});
