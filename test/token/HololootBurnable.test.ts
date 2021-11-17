import { waffle } from "hardhat";
import { expect } from "chai";
import { Wallet } from "ethers";

import TokenArtifacts from "../../artifacts/contracts/Hololoot.sol/Hololoot.json";
import { Hololoot } from "../../typechain";
import { getBigNumber } from "../utilities";

const { provider, deployContract } = waffle;

describe("Hololoot Burnable", () => {
  const [deployer, alice] = provider.getWallets() as Wallet[];

  let token: Hololoot;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const one_hundred = getBigNumber(100);

  async function makeSUT() {
    return (await deployContract(deployer, TokenArtifacts, [deployer.address])) as Hololoot;
  }

  beforeEach(async () => {
    token = await makeSUT();
    await token.transfer(alice.address, getBigNumber(99_999_900));
  });

  describe("burn", () => {
    it("should revert if burn amount exceeds balance", async function () {
      await expect(token.connect(alice).burn(getBigNumber(99_999_950))).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });

    it("should burn correctly", async function () {
      await expect(token.connect(alice).burn(getBigNumber(99_999_900)))
        .to.emit(token, "Transfer")
        .withArgs(alice.address, ZERO_ADDRESS, getBigNumber(99_999_900));

      await expect(token.burn(one_hundred)).to.emit(token, "Transfer").withArgs(deployer.address, ZERO_ADDRESS, one_hundred);

      expect(await token.totalSupply()).to.be.equal(0);
    });
  });

  describe("burnFrom", () => {
    it("should revert if burn amount exceeds allowance", async function () {
      await token.connect(deployer).approve(alice.address, getBigNumber(50));
      await expect(token.connect(alice).burnFrom(deployer.address, one_hundred)).to.be.revertedWith("ERC20: burn amount exceeds allowance");
    });

    it("should revert if burn amount exceeds balance", async function () {
      await token.connect(deployer).approve(alice.address, getBigNumber(150));
      await expect(token.connect(alice).burnFrom(deployer.address, getBigNumber(150))).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });

    it("should burnFrom correctly", async function () {
      await token.connect(alice).approve(deployer.address, getBigNumber(200));
      await expect(token.burnFrom(alice.address, one_hundred)).to.emit(token, "Transfer").withArgs(alice.address, ZERO_ADDRESS, one_hundred);

      await expect(token.burnFrom(alice.address, one_hundred)).to.emit(token, "Transfer").withArgs(alice.address, ZERO_ADDRESS, one_hundred);

      expect(await token.totalSupply()).to.be.equal(getBigNumber(99_999_800));
    });
  });
});
