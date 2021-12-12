import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { chainName, displayResult, dim, cyan, green } from "./utilities/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, getChainId } = hre;
  const { deploy, get } = deployments;
  const { holo_deployer } = await getNamedAccounts();
  const chainId = parseInt(await getChainId());

  // 31337 is unit testing, 1337 is for coverage
  const isTestEnvironment = chainId === 31337 || chainId === 1337;

  cyan("\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  cyan("          HoloFeeManager - Deploy");
  cyan("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");

  dim(`network: ${chainName(chainId)} (${isTestEnvironment ? "local" : "remote"})`);
  dim(`deployer: ${holo_deployer}`);

  cyan("\nGet Hololoot Token Contract...");
  const HololootToken = await get("Hololoot");

  //  BSC
  const token = HololootToken.address;

  // BUSD on BSC Mainnet
  const wBNB = "0xe9e7cea3dedca5984780bafc599bd69add087d56";

  cyan("\nDeploying HoloFeeManager Contract...");

  const tokenDeployResult = await deploy("HoloFeeManager", {
    from: holo_deployer,
    args: [token, wBNB],
    skipIfAlreadyDeployed: true,
  });

  displayResult("HoloFeeManager", tokenDeployResult);

  green(`\nDone!`);
};

export default func;
func.tags = ["Manager"];
