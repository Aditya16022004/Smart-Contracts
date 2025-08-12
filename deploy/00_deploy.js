const { ethers } = require("hardhat");

// Mock USDT contract for local testing

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy Mock USDT (6 decimals)
  console.log("\n1. Deploying Mock USDT...");
  const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
  const mockUSDT = await MockUSDTFactory.deploy();
  await mockUSDT.waitForDeployment();
  console.log("Mock USDT deployed to:", await mockUSDT.getAddress());

  // Deploy GameToken
  console.log("\n2. Deploying GameToken...");
  const GameToken = await ethers.getContractFactory("GameToken");
  const gameToken = await GameToken.deploy();
  await gameToken.waitForDeployment();
  console.log("GameToken deployed to:", await gameToken.getAddress());

  // Deploy TokenStore with gtPerUsdt = 1e18 (1 USDT = 1 GT)
  console.log("\n3. Deploying TokenStore...");
  const TokenStore = await ethers.getContractFactory("TokenStore");
  const gtPerUsdt = ethers.parseEther("1"); // 1e18 = 1 GT per 1 USDT
  const mockUSDTAddress = await mockUSDT.getAddress();
  const gameTokenAddress = await gameToken.getAddress();
  const tokenStore = await TokenStore.deploy(mockUSDTAddress, gameTokenAddress, gtPerUsdt);
  await tokenStore.waitForDeployment();
  console.log("TokenStore deployed to:", await tokenStore.getAddress());
  console.log("GT per USDT rate:", ethers.formatEther(gtPerUsdt));

  // Grant minter role to TokenStore
  console.log("\n4. Granting minter role to TokenStore...");
  const tokenStoreAddress = await tokenStore.getAddress();
  await gameToken.grantMinterRole(tokenStoreAddress);
  console.log("Minter role granted to TokenStore");

  // Deploy PlayGame with 24 hour timeout
  console.log("\n5. Deploying PlayGame...");
  const PlayGame = await ethers.getContractFactory("PlayGame");
  const timeout = 24 * 60 * 60; // 24 hours in seconds
  const playGame = await PlayGame.deploy(gameTokenAddress, deployer.address, timeout);
  await playGame.waitForDeployment();
  console.log("PlayGame deployed to:", await playGame.getAddress());
  console.log("Timeout period:", timeout, "seconds (24 hours)");

  // Mint some USDT to deployer for testing
  console.log("\n6. Minting USDT to deployer for testing...");
  const usdtAmount = ethers.parseUnits("1000", 6); // 1000 USDT
  await mockUSDT.mint(deployer.address, usdtAmount);
  console.log("Minted", ethers.formatUnits(usdtAmount, 6), "USDT to deployer");

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("\nContract Addresses:");
  console.log("Mock USDT:", mockUSDT.address);
  console.log("GameToken:", gameToken.address);
  console.log("TokenStore:", tokenStore.address);
  console.log("PlayGame:", playGame.address);
  console.log("\nOperator Address:", deployer.address);

  console.log("\n=== .env EXAMPLE ===");
  console.log(`RPC_URL=http://127.0.0.1:8545`);
  console.log(`BACKEND_PRIVATE_KEY=${deployer.privateKey}`);
  console.log(`GAME_TOKEN_ADDRESS=${gameToken.address}`);
  console.log(`TOKEN_STORE_ADDRESS=${tokenStore.address}`);
  console.log(`PLAY_GAME_ADDRESS=${playGame.address}`);
  console.log(`USDT_ADDRESS=${mockUSDT.address}`);
  console.log(`OPERATOR_ADDRESS=${deployer.address}`);
  console.log(`PORT=8080`);

  console.log("\n=== TESTING NOTES ===");
  console.log("1. USDT has 6 decimals, GT has 18 decimals");
  console.log("2. Conversion rate: 1 USDT = 1 GT (when gtPerUsdt = 1e18)");
  console.log("3. Deployer has 1000 USDT for testing");
  console.log("4. Deployer is the operator for PlayGame");
  console.log("5. Timeout is 24 hours for refunds");

  const mockUSDTAddr = await mockUSDT.getAddress();
  const gameTokenAddr = await gameToken.getAddress();
  const tokenStoreAddr = await tokenStore.getAddress();
  const playGameAddr = await playGame.getAddress();

  return {
    mockUSDT: mockUSDTAddr,
    gameToken: gameTokenAddr,
    tokenStore: tokenStoreAddr,
    playGame: playGameAddr,
    operator: deployer.address
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
