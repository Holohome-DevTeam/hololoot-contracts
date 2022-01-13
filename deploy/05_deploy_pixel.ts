import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { chainName, displayResult, dim, cyan, green, yellow } from "./utilities/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, getChainId, ethers } = hre;
  const { deploy } = deployments;
  const { token_deployer, admin } = await getNamedAccounts();
  const chainId = parseInt(await getChainId());

  // 31337 is unit testing, 1337 is for coverage
  const isTestEnvironment = chainId === 31337 || chainId === 1337;

  cyan("\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  cyan("              Holopixel - Deploy");
  cyan("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");

  dim(`network: ${chainName(chainId)} (${isTestEnvironment ? "local" : "remote"})`);
  dim(`deployer: ${token_deployer}`);

  cyan("\nDeploying Pixel Contract...");

  const tokenDeployResult = await deploy("Holopixel", {
    from: token_deployer,
    args: [admin],
    skipIfAlreadyDeployed: true,
  });

  displayResult("Holopixel", tokenDeployResult);

  const tokenContract = await ethers.getContractAt("Holopixel", tokenDeployResult.address);
  dim(`Admin: ${admin}`);
  yellow("\nAdmin balance:\n" + (await tokenContract.balanceOf(admin)).toString());

  green(`\nDone!`);
};

export default func;
func.tags = ["Pixel"];
