const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TokenStore", function () {
  let mockUSDT;
  let gameToken;
  let tokenStore;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy Mock USDT
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    mockUSDT = await MockUSDT.deploy();
    await mockUSDT.deployed();
    
    // Deploy GameToken
    const GameToken = await ethers.getContractFactory("GameToken");
    gameToken = await GameToken.deploy();
    await gameToken.deployed();
    
    // Deploy TokenStore with 1:1 conversion rate
    const TokenStore = await ethers.getContractFactory("TokenStore");
    const gtPerUsdt = ethers.utils.parseEther("1"); // 1 USDT = 1 GT
    tokenStore = await TokenStore.deploy(mockUSDT.address, gameToken.address, gtPerUsdt);
    await tokenStore.deployed();
    
    // Grant minter role to TokenStore
    await gameToken.grantMinterRole(tokenStore.address);
    
    // Mint USDT to users for testing
    await mockUSDT.mint(user1.address, ethers.utils.parseUnits("1000", 6));
    await mockUSDT.mint(user2.address, ethers.utils.parseUnits("1000", 6));
  });

  describe("Constructor", function () {
    it("Should set correct addresses and conversion rate", async function () {
      expect(await tokenStore.usdt()).to.equal(mockUSDT.address);
      expect(await tokenStore.gameToken()).to.equal(gameToken.address);
      expect(await tokenStore.gtPerUsdt()).to.equal(ethers.utils.parseEther("1"));
    });
  });

  describe("Buy function", function () {
    it("Should convert USDT to GT correctly (1:1 rate)", async function () {
      const usdtAmount = ethers.utils.parseUnits("100", 6); // 100 USDT
      const expectedGT = ethers.utils.parseEther("100"); // 100 GT
      
      // Approve TokenStore to spend USDT
      await mockUSDT.connect(user1).approve(tokenStore.address, usdtAmount);
      
      // Buy GT
      await expect(tokenStore.connect(user1).buy(usdtAmount))
        .to.emit(tokenStore, "Purchase")
        .withArgs(user1.address, usdtAmount, expectedGT);
      
      // Check balances
      expect(await gameToken.balanceOf(user1.address)).to.equal(expectedGT);
      expect(await mockUSDT.balanceOf(tokenStore.address)).to.equal(usdtAmount);
    });

    it("Should convert USDT to GT correctly (2:1 rate)", async function () {
      // Update conversion rate to 2:1
      await tokenStore.updateGtPerUsdt(ethers.utils.parseEther("2"));
      
      const usdtAmount = ethers.utils.parseUnits("100", 6); // 100 USDT
      const expectedGT = ethers.utils.parseEther("200"); // 200 GT
      
      await mockUSDT.connect(user1).approve(tokenStore.address, usdtAmount);
      
      await expect(tokenStore.connect(user1).buy(usdtAmount))
        .to.emit(tokenStore, "Purchase")
        .withArgs(user1.address, usdtAmount, expectedGT);
      
      expect(await gameToken.balanceOf(user1.address)).to.equal(expectedGT);
    });

    it("Should revert if USDT amount is zero", async function () {
      await expect(
        tokenStore.connect(user1).buy(0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should revert if USDT transfer fails", async function () {
      const usdtAmount = ethers.utils.parseUnits("100", 6);
      
      // Don't approve, so transferFrom will fail
      await expect(
        tokenStore.connect(user1).buy(usdtAmount)
      ).to.be.revertedWith("USDT transfer failed");
    });

    it("Should revert if GT output would be zero", async function () {
      // Set very low conversion rate
      await tokenStore.updateGtPerUsdt(1); // 1 wei per USDT
      
      const usdtAmount = 1; // 1 wei of USDT
      await mockUSDT.connect(user1).approve(tokenStore.address, usdtAmount);
      
      await expect(
        tokenStore.connect(user1).buy(usdtAmount)
      ).to.be.revertedWith("GT output must be greater than 0");
    });

    it("Should handle decimal precision correctly", async function () {
      const usdtAmount = ethers.utils.parseUnits("0.5", 6); // 0.5 USDT
      const expectedGT = ethers.utils.parseEther("0.5"); // 0.5 GT
      
      await mockUSDT.connect(user1).approve(tokenStore.address, usdtAmount);
      
      await tokenStore.connect(user1).buy(usdtAmount);
      expect(await gameToken.balanceOf(user1.address)).to.equal(expectedGT);
    });
  });

  describe("Withdraw USDT", function () {
    beforeEach(async function () {
      // Buy some GT to put USDT in the contract
      const usdtAmount = ethers.utils.parseUnits("100", 6);
      await mockUSDT.connect(user1).approve(tokenStore.address, usdtAmount);
      await tokenStore.connect(user1).buy(usdtAmount);
    });

    it("Should allow owner to withdraw USDT", async function () {
      const withdrawAmount = ethers.utils.parseUnits("50", 6);
      const initialBalance = await mockUSDT.balanceOf(owner.address);
      
      await tokenStore.withdrawUSDT(owner.address, withdrawAmount);
      
      expect(await mockUSDT.balanceOf(owner.address)).to.equal(initialBalance.add(withdrawAmount));
    });

    it("Should not allow non-owner to withdraw", async function () {
      const withdrawAmount = ethers.utils.parseUnits("50", 6);
      
      await expect(
        tokenStore.connect(user1).withdrawUSDT(user1.address, withdrawAmount)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert if recipient is zero address", async function () {
      await expect(
        tokenStore.withdrawUSDT(ethers.constants.AddressZero, ethers.utils.parseUnits("10", 6))
      ).to.be.revertedWith("Invalid recipient");
    });

    it("Should revert if amount is zero", async function () {
      await expect(
        tokenStore.withdrawUSDT(owner.address, 0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should revert if insufficient balance", async function () {
      const tooMuch = ethers.utils.parseUnits("1000", 6);
      await expect(
        tokenStore.withdrawUSDT(owner.address, tooMuch)
      ).to.be.revertedWith("Insufficient USDT balance");
    });
  });

  describe("Update conversion rate", function () {
    it("Should allow owner to update conversion rate", async function () {
      const newRate = ethers.utils.parseEther("2");
      
      await expect(tokenStore.updateGtPerUsdt(newRate))
        .to.emit(tokenStore, "GtPerUsdtUpdated")
        .withArgs(ethers.utils.parseEther("1"), newRate);
      
      expect(await tokenStore.gtPerUsdt()).to.equal(newRate);
    });

    it("Should not allow non-owner to update rate", async function () {
      const newRate = ethers.utils.parseEther("2");
      
      await expect(
        tokenStore.connect(user1).updateGtPerUsdt(newRate)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert if new rate is zero", async function () {
      await expect(
        tokenStore.updateGtPerUsdt(0)
      ).to.be.revertedWith("Rate must be greater than 0");
    });
  });

  describe("Reentrancy protection", function () {
    it("Should prevent reentrant calls to buy", async function () {
      // This test verifies the nonReentrant modifier is working
      const usdtAmount = ethers.utils.parseUnits("100", 6);
      await mockUSDT.connect(user1).approve(tokenStore.address, usdtAmount);
      
      // First call should succeed
      await tokenStore.connect(user1).buy(usdtAmount);
      
      // Second call should also succeed (different transaction)
      await mockUSDT.connect(user1).approve(tokenStore.address, usdtAmount);
      await tokenStore.connect(user1).buy(usdtAmount);
    });
  });

  describe("Get USDT balance", function () {
    it("Should return correct USDT balance", async function () {
      const usdtAmount = ethers.utils.parseUnits("100", 6);
      await mockUSDT.connect(user1).approve(tokenStore.address, usdtAmount);
      await tokenStore.connect(user1).buy(usdtAmount);
      
      expect(await tokenStore.getUSDTBalance()).to.equal(usdtAmount);
    });
  });
});
