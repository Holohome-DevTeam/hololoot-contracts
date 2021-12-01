import { waffle } from "hardhat";
import { expect } from "chai";
import { Wallet, BigNumber, constants } from "ethers";

import TokenArtifacts from "../../artifacts/contracts/Hololoot.sol/Hololoot.json";
import { Hololoot } from "../../typechain";
import { getBigNumber } from "../utilities";

const { provider, deployContract } = waffle;
const { MaxUint256 } = constants;

describe("Hololoot ERC20", () => {
  const [deployer, alice, bob, staking] = provider.getWallets() as Wallet[];

  let token: Hololoot;

  const ONE_HUNDRED_MILLION_TOKENS: BigNumber = getBigNumber(100_000_000);
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const one_hundred = getBigNumber(100);

  async function makeSUT() {
    return (await deployContract(deployer, TokenArtifacts, [deployer.address])) as Hololoot;
  }

  beforeEach(async () => {
    token = await makeSUT();
  });

  it("should initialize as expected", async function () {
    const _token = await makeSUT();
    expect(await _token.name()).to.be.equal("Hololoot Coin");
    expect(await _token.symbol()).to.be.equal("HOL");
    expect(await _token.decimals()).to.be.equal(18);
    expect(await _token.totalSupply()).to.be.equal(ONE_HUNDRED_MILLION_TOKENS);
  });

  it("should distribute tokens correctly", async function () {
    expect(await token.balanceOf(deployer.address)).to.be.equal(ONE_HUNDRED_MILLION_TOKENS);
  });

  describe("balanceOf", () => {
    it("should correctly return user balance", async function () {
      await token.transfer(alice.address, 1007);

      expect(await token.balanceOf(alice.address)).to.be.equal(1007);
      expect(await token.balanceOf(deployer.address)).to.be.equal(ONE_HUNDRED_MILLION_TOKENS.sub(1007));
    });
  });

  describe("transfer", () => {
    it("should revert if transfer to the zero address", async function () {
      await expect(token.transfer(ZERO_ADDRESS, getBigNumber(200))).to.be.revertedWith("ERC20: transfer to the zero address");
    });

    it("should revert if transfer amount exceeds balance", async function () {
      await expect(token.connect(alice).transfer(bob.address, 1007)).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should revert if amount is 0", async function () {
      await expect(token.transfer(alice.address, 0)).to.be.revertedWith("Transfer amount is 0");
    });

    it("should transfer correctly with emit events", async function () {
      await expect(token.transfer(alice.address, getBigNumber(200)))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(200));
    });
  });

  describe("transferFrom", () => {
    it("should revert when amount exceeds allowance", async function () {
      await token.transfer(alice.address, getBigNumber(200));
      await token.connect(alice).approve(bob.address, getBigNumber(100));

      await expect(token.connect(bob).transferFrom(alice.address, bob.address, getBigNumber(150))).to.be.revertedWith(
        "ERC20: transfer amount exceeds allowance"
      );
    });

    it("should not decrease allowance after transferFrom when allowance set to MaxUint256", async function () {
      await token.approve(alice.address, MaxUint256);
      await token.connect(alice).transferFrom(deployer.address, alice.address, one_hundred);

      expect(await token.allowance(deployer.address, alice.address)).to.be.equal(MaxUint256);
    });

    it("should decrease allowance after transferFrom when allowance not set to MaxUint256", async function () {
      await token.approve(alice.address, MaxUint256.sub(1));
      await token.connect(alice).transferFrom(deployer.address, alice.address, one_hundred);

      expect(await token.allowance(deployer.address, alice.address)).to.be.equal(MaxUint256.sub(1).sub(one_hundred));
    });

    it("should correctly transferFrom and emit events", async function () {
      await token.transfer(alice.address, getBigNumber(200));
      await token.connect(alice).approve(staking.address, getBigNumber(200));

      await expect(token.connect(staking).transferFrom(alice.address, staking.address, getBigNumber(100)))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, staking.address, getBigNumber(100))
        .and.to.emit(token, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(100));

      expect(await token.balanceOf(alice.address)).to.be.equal(getBigNumber(100));

      await expect(token.connect(staking).transferFrom(alice.address, bob.address, getBigNumber(50)))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, bob.address, getBigNumber(50))
        .and.to.emit(token, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(50));

      expect(await token.balanceOf(alice.address)).to.be.equal(getBigNumber(50));
    });
  });

  describe("approve", () => {
    it("should revert when approve to the zero address", async function () {
      await expect(token.approve(ZERO_ADDRESS, getBigNumber(200))).to.be.revertedWith("ERC20: approve to the zero address");
    });

    it("should correctly update allowance", async function () {
      await expect(token.connect(alice).approve(staking.address, getBigNumber(100)))
        .to.emit(token, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(100));
      expect(await token.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(100));

      await expect(token.connect(alice).approve(staking.address, getBigNumber(40)))
        .to.emit(token, "Approval")
        .withArgs(alice.address, staking.address, getBigNumber(40));
      expect(await token.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(40));
    });
  });

  describe("increaseAllowance", () => {
    it("should correctly increase allowance", async function () {
      await token.connect(alice).approve(staking.address, getBigNumber(100));
      await token.connect(alice).increaseAllowance(staking.address, getBigNumber(40));

      expect(await token.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(140));
    });
  });

  describe("decreaseAllowance", () => {
    it("should revert if amount to decrease is greater than allowance", async function () {
      await token.connect(alice).approve(staking.address, getBigNumber(100));

      await expect(token.connect(alice).decreaseAllowance(staking.address, getBigNumber(110))).to.be.revertedWith(
        "ERC20: decreased allowance below zero"
      );
    });

    it("should correctly decrease allowance", async function () {
      await token.connect(alice).approve(staking.address, getBigNumber(100));
      await token.connect(alice).decreaseAllowance(staking.address, getBigNumber(40));

      expect(await token.allowance(alice.address, staking.address)).to.be.equal(getBigNumber(60));
    });
  });
});
