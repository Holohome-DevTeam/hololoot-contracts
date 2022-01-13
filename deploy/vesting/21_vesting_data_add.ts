import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { chainName, dim, cyan, green, yellow } from "../utilities/utils";
import { SaleData } from "../utilities/vesting/types";
import { BigNumber } from "ethers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, getChainId, ethers } = hre;
  const { get } = deployments;
  const { holo_deployer } = await getNamedAccounts();
  const signer = ethers.provider.getSigner(holo_deployer);

  const chainId = parseInt(await getChainId());

  const { getSaleData } = await import(`../utilities/vesting/${chainName(chainId)}`);

  // 31337 is unit testing, 1337 is for coverage
  const isTestEnvironment = chainId === 31337 || chainId === 1337;

  cyan("\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  cyan("                Vesting Data");
  cyan("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");

  dim(`network: ${chainName(chainId)} (${isTestEnvironment ? "local" : "remote"})`);
  dim(`deployer: ${holo_deployer}`);

  dim("\nExtracting Vesting Contract...");

  const vestingDeployment = await get("Vesting");
  const vestingContract = await ethers.getContractAt("Vesting", vestingDeployment.address, signer);

  const vestingCount: BigNumber = await vestingContract.getVestingsCount();

  if (vestingCount.isZero()) {
    let data: SaleData;

    cyan("\nConfiguring Marketing...");

    data = getSaleData("marketing");
    await addSaleData(data);

    cyan("\nConfiguring Advisory...");

    data = getSaleData("advisory");
    await addSaleData(data);
  } else {
    yellow("Vestings already added: " + vestingCount);
  }

  async function addSaleData(data: SaleData) {
    let transaction;
    const range = 100;

    let first = 0;
    let last = 0;
    let dataLength = data.address.length;

    yellow("Addresses: " + dataLength);
    yellow("Total amount: " + data.total);
    yellow("Start time: " + data.start_time);
    yellow("End time: " + data.end_time);

    do {
      if (dataLength > range) {
        last += range;
      } else {
        last += dataLength;
      }

      console.log("\nData check for entry: " + last);

      transaction = await vestingContract.massAddHolders(
        data.address.slice(first, last),
        data.start_amount.slice(first, last),
        data.total_amount.slice(first, last),
        data.start_time,
        data.end_time
      );
      first += range;
      dataLength -= range;

      await transaction.wait(2);
    } while (dataLength > 0);

    yellow((await vestingContract.getVestingsCount()).toString());
  }

  green(`Done!`);
};

export default func;
func.tags = ["AddVesting"];
func.dependencies = ["Vesting"];
