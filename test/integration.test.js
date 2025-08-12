const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TriX Integration Tests", function () {
  let mockUSDT;
  let gameToken;
  let tokenStore;
  let playGame;
  let owner;
  let operator;
  let player1;
  let player2;
  let user3;

  beforeEach(async function () {
    [owner, operator, player1, player2, user3] = await ethers.getSigners();
    
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
    
    // Deploy PlayGame with 24 hour timeout
    const PlayGame = await ethers.getContractFactory("PlayGame");
    const timeout = 24 * 60 * 60; // 24 hours
    playGame = await PlayGame.deploy(gameToken.address, operator.address, timeout);
    await playGame.deployed();
    
    // Mint USDT to players for testing
    await mockUSDT.mint(player1.address, ethers.utils.parseUnits("1000", 6));
    await mockUSDT.mint(player2.address, ethers.utils.parseUnits("1000", 6));
  });

  describe("Complete Game Flow", function () {
    it("Should complete full game cycle: purchase -> match -> stake -> settle", async function () {
      const matchId = ethers.utils.id("integration-test-match");
      const stake = ethers.utils.parseEther("100");
      const usdtAmount = ethers.utils.parseUnits("200", 6); // 200 USDT
      
      // Step 1: Players buy GT with USDT
      console.log("Step 1: Players buying GT with USDT...");
      
      // Player 1 buys GT
      await mockUSDT.connect(player1).approve(tokenStore.address, usdtAmount);
      await tokenStore.connect(player1).buy(usdtAmount);
      
      // Player 2 buys GT
      await mockUSDT.connect(player2).approve(tokenStore.address, usdtAmount);
      await tokenStore.connect(player2).buy(usdtAmount);
      
      // Verify GT balances
      expect(await gameToken.balanceOf(player1.address)).to.equal(ethers.utils.parseEther("200"));
      expect(await gameToken.balanceOf(player2.address)).to.equal(ethers.utils.parseEther("200"));
      
      // Step 2: Create match
      console.log("Step 2: Creating match...");
      await playGame.createMatch(matchId, player1.address, player2.address, stake);
      
      const match = await playGame.getMatch(matchId);
      expect(match.p1).to.equal(player1.address);
      expect(match.p2).to.equal(player2.address);
      expect(match.stake).to.equal(stake);
      expect(match.status).to.equal(0); // CREATED
      
      // Step 3: Players stake
      console.log("Step 3: Players staking...");
      
      // Player 1 stakes
      await gameToken.connect(player1).approve(playGame.address, stake);
      await playGame.connect(player1).stake(matchId);
      
      // Player 2 stakes
      await gameToken.connect(player2).approve(playGame.address, stake);
      await playGame.connect(player2).stake(matchId);
      
      // Verify match status updated
      const stakedMatch = await playGame.getMatch(matchId);
      expect(stakedMatch.status).to.equal(1); // STAKED
      expect(stakedMatch.p1Staked).to.be.true;
      expect(stakedMatch.p2Staked).to.be.true;
      expect(stakedMatch.startTime).to.be.gt(0);
      
      // Verify GT balances after staking
      expect(await gameToken.balanceOf(player1.address)).to.equal(ethers.utils.parseEther("100"));
      expect(await gameToken.balanceOf(player2.address)).to.equal(ethers.utils.parseEther("100"));
      expect(await gameToken.balanceOf(playGame.address)).to.equal(stake.mul(2));
      
      // Step 4: Operator commits result
      console.log("Step 4: Committing result...");
      const player1InitialBalance = await gameToken.balanceOf(player1.address);
      
      await playGame.connect(operator).commitResult(matchId, player1.address);
      
      // Verify winner received 2x stake
      expect(await gameToken.balanceOf(player1.address)).to.equal(player1InitialBalance.add(stake.mul(2)));
      
      // Verify match status
      const settledMatch = await playGame.getMatch(matchId);
      expect(settledMatch.status).to.equal(2); // SETTLED
      
      // Verify PlayGame contract has no GT left
      expect(await gameToken.balanceOf(playGame.address)).to.equal(0);
    });

    it("Should handle refund flow when match times out", async function () {
      const matchId = ethers.utils.id("refund-test-match");
      const stake = ethers.utils.parseEther("50");
      const usdtAmount = ethers.utils.parseUnits("100", 6);
      
      // Players buy GT
      await mockUSDT.connect(player1).approve(tokenStore.address, usdtAmount);
      await mockUSDT.connect(player2).approve(tokenStore.address, usdtAmount);
      await tokenStore.connect(player1).buy(usdtAmount);
      await tokenStore.connect(player2).buy(usdtAmount);
      
      // Create and stake match
      await playGame.createMatch(matchId, player1.address, player2.address, stake);
      await gameToken.connect(player1).approve(playGame.address, stake);
      await gameToken.connect(player2).approve(playGame.address, stake);
      await playGame.connect(player1).stake(matchId);
      await playGame.connect(player2).stake(matchId);
      
      // Fast forward time past timeout
      await ethers.provider.send("evm_increaseTime", [25 * 60 * 60]); // 25 hours
      await ethers.provider.send("evm_mine");
      
      // Refund players
      const p1InitialBalance = await gameToken.balanceOf(player1.address);
      const p2InitialBalance = await gameToken.balanceOf(player2.address);
      
      await playGame.refund(matchId);
      
      // Verify refunds
      expect(await gameToken.balanceOf(player1.address)).to.equal(p1InitialBalance.add(stake));
      expect(await gameToken.balanceOf(player2.address)).to.equal(p2InitialBalance.add(stake));
      
      const refundedMatch = await playGame.getMatch(matchId);
      expect(refundedMatch.status).to.equal(3); // REFUNDED
    });

    it("Should prevent double commit of results", async function () {
      const matchId = ethers.utils.id("double-commit-test");
      const stake = ethers.utils.parseEther("50");
      const usdtAmount = ethers.utils.parseUnits("100", 6);
      
      // Setup match
      await mockUSDT.connect(player1).approve(tokenStore.address, usdtAmount);
      await mockUSDT.connect(player2).approve(tokenStore.address, usdtAmount);
      await tokenStore.connect(player1).buy(usdtAmount);
      await tokenStore.connect(player2).buy(usdtAmount);
      
      await playGame.createMatch(matchId, player1.address, player2.address, stake);
      await gameToken.connect(player1).approve(playGame.address, stake);
      await gameToken.connect(player2).approve(playGame.address, stake);
      await playGame.connect(player1).stake(matchId);
      await playGame.connect(player2).stake(matchId);
      
      // First commit should succeed
      await playGame.connect(operator).commitResult(matchId, player1.address);
      
      // Second commit should fail
      await expect(
        playGame.connect(operator).commitResult(matchId, player2.address)
      ).to.be.revertedWith("Match not staked");
    });

    it("Should handle partial staking scenario", async function () {
      const matchId = ethers.utils.id("partial-stake-test");
      const stake = ethers.utils.parseEther("50");
      const usdtAmount = ethers.utils.parseUnits("100", 6);
      
      // Setup match
      await mockUSDT.connect(player1).approve(tokenStore.address, usdtAmount);
      await tokenStore.connect(player1).buy(usdtAmount);
      
      await playGame.createMatch(matchId, player1.address, player2.address, stake);
      await gameToken.connect(player1).approve(playGame.address, stake);
      await playGame.connect(player1).stake(matchId);
      
      // Match should still be in CREATED status
      const match = await playGame.getMatch(matchId);
      expect(match.status).to.equal(0); // CREATED
      expect(match.p1Staked).to.be.true;
      expect(match.p2Staked).to.be.false;
      
      // Operator should not be able to commit result
      await expect(
        playGame.connect(operator).commitResult(matchId, player1.address)
      ).to.be.revertedWith("Match not staked");
    });
  });

  describe("Token Conversion Accuracy", function () {
    it("Should handle different conversion rates correctly", async function () {
      // Test 2:1 conversion rate
      await tokenStore.updateGtPerUsdt(ethers.utils.parseEther("2"));
      
      const usdtAmount = ethers.utils.parseUnits("100", 6); // 100 USDT
      const expectedGT = ethers.utils.parseEther("200"); // 200 GT
      
      await mockUSDT.connect(player1).approve(tokenStore.address, usdtAmount);
      await tokenStore.connect(player1).buy(usdtAmount);
      
      expect(await gameToken.balanceOf(player1.address)).to.equal(expectedGT);
    });

    it("Should handle fractional USDT amounts", async function () {
      const usdtAmount = ethers.utils.parseUnits("0.5", 6); // 0.5 USDT
      const expectedGT = ethers.utils.parseEther("0.5"); // 0.5 GT
      
      await mockUSDT.connect(player1).approve(tokenStore.address, usdtAmount);
      await tokenStore.connect(player1).buy(usdtAmount);
      
      expect(await gameToken.balanceOf(player1.address)).to.equal(expectedGT);
    });
  });

  describe("Event Emission", function () {
    it("Should emit all expected events in correct order", async function () {
      const matchId = ethers.utils.id("event-test-match");
      const stake = ethers.utils.parseEther("50");
      const usdtAmount = ethers.utils.parseUnits("100", 6);
      
      // Buy GT
      await mockUSDT.connect(player1).approve(tokenStore.address, usdtAmount);
      await mockUSDT.connect(player2).approve(tokenStore.address, usdtAmount);
      
      // Should emit Purchase events
      await expect(tokenStore.connect(player1).buy(usdtAmount))
        .to.emit(tokenStore, "Purchase")
        .withArgs(player1.address, usdtAmount, ethers.utils.parseEther("100"));
      
      await expect(tokenStore.connect(player2).buy(usdtAmount))
        .to.emit(tokenStore, "Purchase")
        .withArgs(player2.address, usdtAmount, ethers.utils.parseEther("100"));
      
      // Create match
      await expect(playGame.createMatch(matchId, player1.address, player2.address, stake))
        .to.emit(playGame, "MatchCreated")
        .withArgs(matchId, player1.address, player2.address, stake);
      
      // Stake
      await gameToken.connect(player1).approve(playGame.address, stake);
      await gameToken.connect(player2).approve(playGame.address, stake);
      
      await expect(playGame.connect(player1).stake(matchId))
        .to.emit(playGame, "Staked")
        .withArgs(matchId, player1.address, stake);
      
      await expect(playGame.connect(player2).stake(matchId))
        .to.emit(playGame, "Staked")
        .withArgs(matchId, player2.address, stake);
      
      // Commit result
      await expect(playGame.connect(operator).commitResult(matchId, player1.address))
        .to.emit(playGame, "Settled")
        .withArgs(matchId, player1.address, stake.mul(2));
    });
  });

  describe("Security and Access Control", function () {
    it("Should enforce proper access controls", async function () {
      const matchId = ethers.utils.id("security-test");
      const stake = ethers.utils.parseEther("50");
      
      // Non-owner cannot create match
      await expect(
        playGame.connect(player1).createMatch(matchId, player1.address, player2.address, stake)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      // Non-operator cannot commit results
      await playGame.createMatch(matchId, player1.address, player2.address, stake);
      await gameToken.connect(player1).approve(playGame.address, stake);
      await gameToken.connect(player2).approve(playGame.address, stake);
      await playGame.connect(player1).stake(matchId);
      await playGame.connect(player2).stake(matchId);
      
      await expect(
        playGame.connect(player1).commitResult(matchId, player1.address)
      ).to.be.revertedWith("Only operator can commit results");
      
      // Non-owner cannot update conversion rate
      await expect(
        tokenStore.connect(player1).updateGtPerUsdt(ethers.utils.parseEther("2"))
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
