import { waffle } from "hardhat";
import { expect } from "chai";

import TokenArtifacts from "../../artifacts/contracts/Hololoot.sol/Hololoot.json";

import { Hololoot } from "../../typechain";
import { Wallet, BigNumber } from "ethers";
import { getBigNumber, latest, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;

describe("Hololoot Anti-bot", () => {
  const [deployer, alice, bob, carol, uniswap] = provider.getWallets() as Wallet[];

  let token: Hololoot;

  const FIVE_HUNDRED_MILLION_TOKENS: BigNumber = getBigNumber(500_000_000);
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const one_hundred = getBigNumber(100);

  async function makeSUT() {
    return (await deployContract(deployer, TokenArtifacts, [deployer.address])) as Hololoot;
  }

  beforeEach(async () => {
    token = await makeSUT();
    await token.initAntibot();
  });

  describe("onlyOwner", () => {
    it("should revert if restricted function's caller is not owner", async () => {
      await expect(token.connect(alice).setTradingStart(1)).to.be.revertedWith("caller is not the owner");
      await expect(token.connect(alice).setMaxTransferAmount(1)).to.be.revertedWith("caller is not the owner");
      await expect(token.connect(alice).setRestrictionActive(false)).to.be.revertedWith("caller is not the owner");
      await expect(token.connect(alice).unthrottleAccount(alice.address, true)).to.be.revertedWith("caller is not the owner");
      await expect(token.connect(alice).whitelistAccount(alice.address, true)).to.be.revertedWith("caller is not the owner");
      await expect(token.connect(alice).initAntibot()).to.be.revertedWith("caller is not the owner");
    });
  });

  describe("initAntibot", () => {
    it("should initialize correctly", async () => {
      expect(await token.isUnthrottled(deployer.address)).to.be.equal(true);
    });

    it("should revert if already initialized", async () => {
      await expect(token.initAntibot()).to.be.revertedWith("Protection: Already initialized");
    });
  });

  describe("before trading time", () => {
    describe("transfer", () => {
      it("transfer should revert when executed before trading time and transaction is not from or to the owner", async function () {
        await expect(token.connect(alice).transfer(bob.address, one_hundred)).to.be.revertedWith("Protection: Transfers disabled");
      });

      it("transfer should be executed if transaction is to or from the owner address", async function () {
        await expect(token.transfer(alice.address, getBigNumber(150000)))
          .to.emit(token, "Transfer")
          .withArgs(deployer.address, alice.address, getBigNumber(150000));

        await expect(token.connect(alice).transfer(deployer.address, getBigNumber(150000)))
          .to.emit(token, "Transfer")
          .withArgs(alice.address, deployer.address, getBigNumber(150000));
      });

      it("transfer should be executed if transaction is to or from the unthrottle address", async function () {
        await token.transfer(alice.address, getBigNumber(150000));

        await token.unthrottleAccount(alice.address, true);

        await expect(token.connect(alice).transfer(bob.address, getBigNumber(150000)))
          .to.emit(token, "Transfer")
          .withArgs(alice.address, bob.address, getBigNumber(150000));

        await expect(token.connect(bob).transfer(alice.address, getBigNumber(150000)))
          .to.emit(token, "Transfer")
          .withArgs(bob.address, alice.address, getBigNumber(150000));
      });
    });

    describe("transferFrom", () => {
      it("transferFrom should be reverted when executed before trading time and transaction is not from or to the owner", async function () {
        await token.transfer(alice.address, getBigNumber(150000));
        await token.connect(alice).approve(bob.address, getBigNumber(150000));

        await expect(token.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(150000))).to.be.revertedWith(
          "Protection: Transfers disabled"
        );
      });

      it("transferFrom should be executed if transaction is to or from the owner address", async function () {
        await token.approve(bob.address, getBigNumber(150000));
        await expect(token.connect(bob).transferFrom(deployer.address, bob.address, getBigNumber(150000)))
          .to.emit(token, "Transfer")
          .withArgs(deployer.address, bob.address, getBigNumber(150000));
      });
    });
  });

  describe("during restriction time", () => {
    beforeEach(async () => {
      const now = await latest();
      await token.setTradingStart(now);
    });

    it("transfer should revert when amount exceeds max limit", async function () {
      await token.transfer(uniswap.address, getBigNumber(150000));

      // transfer
      await expect(token.connect(uniswap).transfer(alice.address, getBigNumber(150000))).to.be.revertedWith("Protection: Limit exceeded");

      // prevents 1 tx per 30 sec limit
      await advanceTimeAndBlock(30);

      // transferFrom
      await token.connect(alice).approve(bob.address, getBigNumber(150000));
      await expect(token.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(150000))).to.be.revertedWith(
        "Protection: Limit exceeded"
      );
    });

    it("should transfer correctly when amount under max limit", async function () {
      // transfer
      await expect(token.transfer(alice.address, getBigNumber(50000)))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(50000));

      // prevents 1 tx per 30 sec limit
      await advanceTimeAndBlock(30);

      // transferFrom
      await token.connect(alice).approve(bob.address, getBigNumber(50000));
      await expect(token.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(50000)))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(50000));
    });

    it("should revert when more then one transfer per min for the same address when not whitelisted", async function () {
      await token.transfer(uniswap.address, getBigNumber(50000));

      await token.connect(uniswap).transfer(alice.address, getBigNumber(50000));

      await token.connect(alice).approve(bob.address, getBigNumber(50000));
      await expect(token.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(50000))).to.be.revertedWith(
        "Protection: 30 sec/tx allowed"
      );
    });

    it("whitelisted account should transfer to different accounts without transaction limits", async function () {
      await token.whitelistAccount(uniswap.address, true);
      await token.transfer(uniswap.address, getBigNumber(50000));

      await expect(token.connect(uniswap).transfer(alice.address, getBigNumber(1000)))
        .to.emit(token, "Transfer")
        .withArgs(uniswap.address, alice.address, getBigNumber(1000));

      await expect(token.connect(uniswap).transfer(bob.address, getBigNumber(1000)))
        .to.emit(token, "Transfer")
        .withArgs(uniswap.address, bob.address, getBigNumber(1000));

      await token.connect(uniswap).approve(carol.address, getBigNumber(10000));
      await expect(token.connect(carol).transferFrom(uniswap.address, carol.address, getBigNumber(10000)))
        .to.emit(token, "Transfer")
        .withArgs(uniswap.address, carol.address, getBigNumber(10000));
    });

    it("whitelisted account should receive from different accounts without transaction limits", async function () {
      await token.transfer(alice.address, getBigNumber(1000));
      await advanceTimeAndBlock(60);
      await token.transfer(bob.address, getBigNumber(1000));
      await advanceTimeAndBlock(60);
      await token.transfer(carol.address, getBigNumber(1000));
      await advanceTimeAndBlock(60);

      await token.whitelistAccount(uniswap.address, true);

      // transfer
      await expect(token.connect(alice).transfer(uniswap.address, getBigNumber(1000)))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, uniswap.address, getBigNumber(1000));

      // transferFrom
      await token.connect(bob).approve(uniswap.address, getBigNumber(1000));
      await expect(token.connect(uniswap).transferFrom(bob.address, uniswap.address, getBigNumber(1000)))
        .to.emit(token, "Transfer")
        .withArgs(bob.address, uniswap.address, getBigNumber(1000));
    });

    it("transfers between whitelisted accounts should not be restricted by amount of transactions per min", async function () {
      await token.whitelistAccount(deployer.address, true);
      await token.whitelistAccount(uniswap.address, true);

      // transfer
      await expect(token.transfer(uniswap.address, getBigNumber(1000)))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, uniswap.address, getBigNumber(1000));

      // transferFrom
      await token.connect(uniswap).approve(deployer.address, getBigNumber(1000));
      await expect(token.connect(deployer).transferFrom(uniswap.address, deployer.address, getBigNumber(1000)))
        .to.emit(token, "Transfer")
        .withArgs(uniswap.address, deployer.address, getBigNumber(1000));
    });

    it("sender to the whitelisted account should be restricted by amount of transactions per min", async function () {
      await token.transfer(alice.address, getBigNumber(10000));
      await advanceTimeAndBlock(60);

      await token.whitelistAccount(uniswap.address, true);

      // transfer 1
      await expect(token.connect(alice).transfer(uniswap.address, getBigNumber(1000)))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, uniswap.address, getBigNumber(1000));

      // transfer 2
      await expect(token.connect(alice).transfer(uniswap.address, getBigNumber(1000))).to.be.revertedWith("Protection: 30 sec/tx allowed");
    });

    it("receiver from the whitelisted account should be restricted by amount of transactions per min", async function () {
      await token.whitelistAccount(uniswap.address, true);
      await token.transfer(uniswap.address, getBigNumber(10000));

      // transfer 1
      await expect(token.connect(uniswap).transfer(alice.address, getBigNumber(1000)))
        .to.emit(token, "Transfer")
        .withArgs(uniswap.address, alice.address, getBigNumber(1000));

      // transfer 2
      await expect(token.connect(uniswap).transfer(alice.address, getBigNumber(1000))).to.be.revertedWith("Protection: 30 sec/tx allowed");
    });
  });

  describe("without transfer amount limit", () => {
    beforeEach(async () => {
      const now = await latest();
      await token.setTradingStart(now);
      await token.setMaxTransferAmount(0);
    });

    it("should transfer correctly without amount limits", async function () {
      // transfer
      await expect(token.transfer(alice.address, getBigNumber(1000000)))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(1000000));

      await advanceTimeAndBlock(30);

      // transferFrom
      await token.connect(alice).approve(bob.address, getBigNumber(1000000));
      await expect(token.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(1000000)))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(1000000));
    });
  });

  describe("setTradingStart", () => {
    let tradingTimeEnd;

    beforeEach(async () => {
      const now = await latest();
      tradingTimeEnd = now.add(3600);
      await token.setTradingStart(tradingTimeEnd);
      await token.transfer(alice.address, getBigNumber(200000));
    });

    it("should change trading time correctly", async function () {
      await expect(token.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Transfers disabled");

      await token.setTradingStart(tradingTimeEnd.add(3600));

      // time after initial trading and restriction lift time
      await advanceTimeAndBlock(3600);
      // should still be disabled
      await expect(token.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Transfers disabled");

      await advanceTimeAndBlock(3600);
      // should be restricted by limit
      await expect(token.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Limit exceeded");

      // should transfer correctly
      await expect(token.connect(alice).transfer(bob.address, getBigNumber(50000)))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(50000));
    });

    it("it should revert when trading time already started", async function () {
      await advanceTimeAndBlock(3600);
      await expect(token.setTradingStart(1000)).to.be.revertedWith("To late");
    });
  });

  describe("setMaxTransferAmount", () => {
    beforeEach(async () => {
      const now = await latest();
      await token.setTradingStart(now);
    });

    it("it should correctly change max restriction amount", async function () {
      await token.transfer(alice.address, getBigNumber(200000));

      await expect(token.connect(alice).transfer(bob.address, getBigNumber(200000))).to.be.revertedWith("Protection: Limit exceeded");

      await expect(token.setMaxTransferAmount(getBigNumber(200000)))
        .to.emit(token, "MaxTransferAmountChanged")
        .withArgs(getBigNumber(200000));

      await expect(token.connect(alice).transfer(bob.address, getBigNumber(200000)))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(200000));
    });
  });

  describe("whitelistAccount", () => {
    it("should revert if address zero is passed as account argument", async function () {
      await expect(token.whitelistAccount(ZERO_ADDRESS, true)).to.be.revertedWith("Zero address");
      await expect(token.whitelistAccount(ZERO_ADDRESS, false)).to.be.revertedWith("Zero address");
    });

    it("should correctly add and remove user from whitelist and correctly emit event", async function () {
      expect(await token.isWhitelisted(uniswap.address)).to.be.equal(false);

      await expect(token.whitelistAccount(uniswap.address, true)).to.emit(token, "MarkedWhitelisted").withArgs(uniswap.address, true);

      expect(await token.isWhitelisted(uniswap.address)).to.be.equal(true);

      await expect(token.whitelistAccount(uniswap.address, false)).to.emit(token, "MarkedWhitelisted").withArgs(uniswap.address, false);
    });
  });

  describe("unthrottleAccount", () => {
    beforeEach(async () => {
      const now = await latest();
      await token.setTradingStart(now);
    });

    it("should revert if address zero is passed as account argument", async function () {
      await expect(token.unthrottleAccount(ZERO_ADDRESS, true)).to.be.revertedWith("Zero address");
      await expect(token.unthrottleAccount(ZERO_ADDRESS, false)).to.be.revertedWith("Zero address");
    });

    it("should set unthrottled and emit event correctly", async function () {
      await expect(token.unthrottleAccount(alice.address, true)).to.emit(token, "MarkedUnthrottled").withArgs(alice.address, true);

      expect(await token.isUnthrottled(alice.address)).to.be.equal(true);

      await expect(token.unthrottleAccount(alice.address, false)).to.emit(token, "MarkedUnthrottled").withArgs(alice.address, false);

      expect(await token.isUnthrottled(alice.address)).to.be.equal(false);
    });
  });

  describe("restriction active", () => {
    beforeEach(async () => {
      const now = await latest();
      await token.setTradingStart(now);
    });

    it("should emit event correctly", async function () {
      await expect(token.setRestrictionActive(false)).to.emit(token, "RestrictionActiveChanged").withArgs(false);
    });

    it("should revert if restriction is active", async function () {
      await token.transfer(uniswap.address, getBigNumber(1000000));

      // reverted on amount exceeded
      await expect(token.connect(uniswap).transfer(alice.address, getBigNumber(1000000))).to.be.revertedWith("Protection: Limit exceeded");

      // transfer
      await expect(token.connect(uniswap).transfer(alice.address, getBigNumber(1000)))
        .to.emit(token, "Transfer")
        .withArgs(uniswap.address, alice.address, getBigNumber(1000));

      // revert on 30 sec/tx allowed
      await expect(token.connect(uniswap).transfer(alice.address, getBigNumber(1000))).to.be.revertedWith("Protection: 30 sec/tx allowed");
    });

    it("should not be restricted when restriction is not active", async function () {
      await token.setRestrictionActive(false);

      // no revert on amount exceeded
      await expect(token.transfer(alice.address, getBigNumber(1000000)))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(1000000));

      // no revert on 1 tx/min allowed
      await expect(token.transfer(alice.address, getBigNumber(1000)))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(1000));
    });
  });
});
