import { waffle } from "hardhat";
import { expect } from "chai";
import { Wallet } from "ethers";

import TokenArtifacts from "../../artifacts/contracts/Hololoot.sol/Hololoot.json";
import FeeManagerMockArtifacts from "../../artifacts/contracts/mocks/FeeManagerMock.sol/FeeManagerMock.json";

import { Hololoot, FeeManagerMock } from "../../typechain";
import { getBigNumber, advanceTimeAndBlock } from "../utilities";

const { provider, deployContract } = waffle;

describe("Hololoot FeeManager", () => {
  const [deployer, alice, bob] = provider.getWallets() as Wallet[];

  let token: Hololoot;
  let fee: FeeManagerMock;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const one_hundred = getBigNumber(100);

  async function makeSUT() {
    return (await deployContract(deployer, TokenArtifacts, [deployer.address])) as Hololoot;
  }

  beforeEach(async () => {
    token = await makeSUT();

    fee = (await deployContract(deployer, FeeManagerMockArtifacts, [token.address])) as FeeManagerMock;
    await fee.setSync(true);

    await token.changeFeeContract(fee.address, true);
    await token.setTransferFeeBPS(500);
  });

  describe("onlyOwner", () => {
    it("should revert if restricted function's caller is not owner", async () => {
      await expect(token.connect(alice).setExcludedFromFees(alice.address, true)).to.be.revertedWith("caller is not the owner");
      await expect(token.connect(alice).setTransferFeeBPS(50)).to.be.revertedWith("caller is not the owner");
      await expect(token.connect(alice).changeFeeContract(alice.address, false)).to.be.revertedWith("caller is not the owner");
    });
  });

  describe("isExcludedFromFees", () => {
    it("should exclude only deployer address from fees when deployed", async function () {
      const _token: Hololoot = await makeSUT();

      expect(await _token.isExcludedFromFees(deployer.address)).to.be.equal(true);
      expect(await _token.isExcludedFromFees(fee.address)).to.be.equal(false);
    });
  });

  describe("setExcludedFromFees", () => {
    it("should revert if address zero is passed as account argument", async function () {
      await expect(token.setExcludedFromFees(ZERO_ADDRESS, true)).to.be.revertedWith("Zero address");
      await expect(token.setExcludedFromFees(ZERO_ADDRESS, false)).to.be.revertedWith("Zero address");
    });

    it("should exclude and include address from fees and emit events", async function () {
      expect(await token.isExcludedFromFees(alice.address)).to.be.equal(false);

      await expect(token.connect(deployer).setExcludedFromFees(alice.address, true))
        .to.emit(token, "MarkedExcluded")
        .withArgs(alice.address, true);

      expect(await token.isExcludedFromFees(alice.address)).to.be.equal(true);

      await expect(token.connect(deployer).setExcludedFromFees(alice.address, false))
        .to.emit(token, "MarkedExcluded")
        .withArgs(alice.address, false);

      expect(await token.isExcludedFromFees(alice.address)).to.be.equal(false);
    });
  });

  describe("transfer without fee", () => {
    it("it should transfer without fee from address that is excluded", async function () {
      await expect(token.transfer(alice.address, one_hundred)).to.emit(token, "Transfer").withArgs(deployer.address, alice.address, one_hundred);

      expect(await token.balanceOf(fee.address)).to.be.equal(0);
      expect(await token.balanceOf(alice.address)).to.be.equal(one_hundred);
      expect(await token.balanceOf(deployer.address)).to.be.equal(getBigNumber(99999900));
    });

    it("it should transfer without fee to address that is excluded", async function () {
      await token.transfer(alice.address, one_hundred);
      await token.connect(deployer).setExcludedFromFees(bob.address, true);

      await expect(token.connect(alice).transfer(bob.address, one_hundred))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, bob.address, one_hundred);

      expect(await token.balanceOf(fee.address)).to.be.equal(0);
      expect(await token.balanceOf(alice.address)).to.be.equal(0);
      expect(await token.balanceOf(bob.address)).to.be.equal(one_hundred);
    });

    it("it should transfer without fee when both addresses are excluded", async function () {
      await expect(token.transfer(fee.address, one_hundred)).to.emit(token, "Transfer").withArgs(deployer.address, fee.address, one_hundred);

      expect(await token.balanceOf(fee.address)).to.be.equal(one_hundred);
      expect(await token.balanceOf(deployer.address)).to.be.equal(getBigNumber(99999900));
    });

    it("it should transfer without fee when fee is set to 0", async function () {
      await token.connect(deployer).setTransferFeeBPS(0);
      await token.transfer(alice.address, one_hundred);

      await expect(token.connect(alice).transfer(bob.address, one_hundred))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, bob.address, one_hundred);

      expect(await token.balanceOf(fee.address)).to.be.equal(0);
      expect(await token.balanceOf(alice.address)).to.be.equal(0);
      expect(await token.balanceOf(bob.address)).to.be.equal(one_hundred);
    });

    it("it should transfer without fee if feeContract is zero address", async function () {
      const _token: Hololoot = await makeSUT();
      await advanceTimeAndBlock(3 * 24 * 3600 + 30 * 60);
      await _token.setRestrictionActive(false);
      await _token.transfer(alice.address, one_hundred);

      await expect(_token.connect(alice).transfer(bob.address, one_hundred))
        .to.emit(_token, "Transfer")
        .withArgs(alice.address, bob.address, one_hundred);

      expect(await _token.balanceOf(fee.address)).to.be.equal(0);
      expect(await _token.balanceOf(alice.address)).to.be.equal(0);
      expect(await _token.balanceOf(bob.address)).to.be.equal(one_hundred);
    });
  });

  describe("transferFrom without fee", () => {
    it("it should transferFrom without fee from address that is excluded", async function () {
      await token.approve(alice.address, one_hundred);

      await expect(token.connect(alice).transferFrom(deployer.address, bob.address, one_hundred))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, bob.address, one_hundred);

      expect(await token.balanceOf(fee.address)).to.be.equal(0);
      expect(await token.balanceOf(bob.address)).to.be.equal(one_hundred);
      expect(await token.balanceOf(deployer.address)).to.be.equal(getBigNumber(99999900));
    });
  });

  describe("transfer with fee", () => {
    it("it should transfer with fee when address is not excluded", async function () {
      await token.setExcludedFromFees(deployer.address, false);

      await expect(token.transfer(alice.address, one_hundred))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(95))
        .and.to.emit(token, "Transfer")
        .withArgs(deployer.address, fee.address, getBigNumber(5));

      expect(await token.balanceOf(alice.address)).to.be.equal(getBigNumber(95));
      expect(await token.balanceOf(fee.address)).to.be.equal(getBigNumber(5));
      expect(await token.balanceOf(deployer.address)).to.be.equal(getBigNumber(99999900));

      await expect(token.transfer(bob.address, getBigNumber(200)))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, bob.address, getBigNumber(190))
        .and.to.emit(token, "Transfer")
        .withArgs(deployer.address, fee.address, getBigNumber(10));

      expect(await token.balanceOf(bob.address)).to.be.equal(getBigNumber(190));
      expect(await token.balanceOf(fee.address)).to.be.equal(getBigNumber(15));
      expect(await token.balanceOf(deployer.address)).to.be.equal(getBigNumber(99999700));
    });
  });

  describe("setTransferFeeBPS", () => {
    it("it should revert when new fee exceed a limit", async function () {
      await expect(token.setTransferFeeBPS(1002)).to.be.revertedWith("Fee is outside of range 0-1000");
    });

    it("it should correctly change the fee basis points", async function () {
      await expect(token.setTransferFeeBPS(100)).to.emit(token, "FeeBPS").withArgs(100);
    });

    it("it should use new fee correctly on fee-on-transfer transaction", async function () {
      await token.setTransferFeeBPS(70);
      await token.setExcludedFromFees(deployer.address, false);

      await expect(token.transfer(alice.address, one_hundred))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(993, 17))
        .and.to.emit(token, "Transfer")
        .withArgs(deployer.address, fee.address, getBigNumber(7, 17));
    });
  });

  describe("changeFeeContract", () => {
    it("it should correctly change the fee contract address", async function () {
      await token.setExcludedFromFees(deployer.address, false);

      await expect(token.changeFeeContract(alice.address, false)).to.emit(token, "FeeContractChanged").withArgs(alice.address, false);

      expect(await token.feeContract()).to.be.equal(alice.address);

      await expect(token.transfer(bob.address, one_hundred))
        .to.emit(token, "Transfer")
        .withArgs(deployer.address, bob.address, getBigNumber(95))
        .and.to.emit(token, "Transfer")
        .withArgs(deployer.address, alice.address, getBigNumber(5));
    });
  });
});
