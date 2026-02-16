import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying SecurityAnchor from ${deployer.address}`);

  const Anchor = await ethers.getContractFactory("SecurityAnchor");
  const anchor = await Anchor.deploy();
  await anchor.waitForDeployment();

  console.log(`SecurityAnchor deployed to ${await anchor.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
