import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { chainName, displayResult, dim, cyan, green, yellow } from "./utilities/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments, getChainId, ethers } = hre;
  const { deploy } = deployments;
  const { token_deployer, temp_admin } = await getNamedAccounts();
  const chainId = parseInt(await getChainId());

  // 31337 is unit testing, 1337 is for coverage
  const isTestEnvironment = chainId === 31337 || chainId === 1337;

  cyan("\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  cyan("              Hololoot - Deploy");
  cyan("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");

  dim(`network: ${chainName(chainId)} (${isTestEnvironment ? "local" : "remote"})`);
  dim(`deployer: ${token_deployer}`);

  cyan("\nDeploying Token Contract...");

  const tokenDeployResult = await deploy("Hololoot", {
    from: token_deployer,
    args: [temp_admin],
    skipIfAlreadyDeployed: true,
  });

  displayResult("Hololoot", tokenDeployResult);

  const tokenContract = await ethers.getContractAt("Hololoot", tokenDeployResult.address);
  dim(`Admin: ${temp_admin}`);
  yellow("\nAdmin balance:\n" + (await tokenContract.balanceOf(temp_admin)).toString());

  green(`\nDone!`);
};

export default func;
func.tags = ["Token"];
