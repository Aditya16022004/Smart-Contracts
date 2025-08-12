const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PlayGame", function () {
  let gameToken;
  let playGame;
  let owner;
  let operator;
  let p1;
  let p2;
  let user3;

  beforeEach(async function () {
    [owner, operator, p1, p2, user3] = await ethers.getSigners();
    
    // Deploy GameToken
    const GameToken = await ethers.getContractFactory("GameToken");
    gameToken = await GameToken.deploy();
    await gameToken.deployed();
    
    // Deploy PlayGame with 24 hour timeout
    const PlayGame = await ethers.getContractFactory("PlayGame");
    const timeout = 24 * 60 * 60; // 24 hours
    playGame = await PlayGame.deploy(gameToken.address, operator.address, timeout);
    await playGame.deployed();
    
    // Mint GT to players for testing
    await gameToken.mint(p1.address, ethers.utils.parseEther("1000"));
    await gameToken.mint(p2.address, ethers.utils.parseEther("1000"));
  });

  describe("Constructor", function () {
    it("Should set correct addresses and timeout", async function () {
      expect(await playGame.gameToken()).to.equal(gameToken.address);
      expect(await playGame.operator()).to.equal(operator.address);
      expect(await playGame.timeout()).to.equal(24 * 60 * 60);
    });
  });

  describe("Create Match", function () {
    const matchId = ethers.utils.id("test-match");
    const stake = ethers.utils.parseEther("100");

    it("Should create match correctly", async function () {
      await expect(playGame.createMatch(matchId, p1.address, p2.address, stake))
        .to.emit(playGame, "MatchCreated")
        .withArgs(matchId, p1.address, p2.address, stake);
      
      const match = await playGame.getMatch(matchId);
      expect(match.id).to.equal(matchId);
      expect(match.p1).to.equal(p1.address);
      expect(match.p2).to.equal(p2.address);
      expect(match.stake).to.equal(stake);
      expect(match.status).to.equal(0); // CREATED
      expect(match.p1Staked).to.be.false;
      expect(match.p2Staked).to.be.false;
      expect(match.startTime).to.equal(0);
    });

    it("Should not allow non-owner to create match", async function () {
      await expect(
        playGame.connect(p1).createMatch(matchId, p1.address, p2.address, stake)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert if match ID is zero", async function () {
      await expect(
        playGame.createMatch(ethers.constants.HashZero, p1.address, p2.address, stake)
      ).to.be.revertedWith("Invalid match ID");
    });

    it("Should revert if player addresses are invalid", async function () {
      await expect(
        playGame.createMatch(matchId, ethers.constants.AddressZero, p2.address, stake)
      ).to.be.revertedWith("Invalid player addresses");
      
      await expect(
        playGame.createMatch(matchId, p1.address, ethers.constants.AddressZero, stake)
      ).to.be.revertedWith("Invalid player addresses");
    });

    it("Should revert if players are the same", async function () {
      await expect(
        playGame.createMatch(matchId, p1.address, p1.address, stake)
      ).to.be.revertedWith("Players must be different");
    });

    it("Should revert if stake is zero", async function () {
      await expect(
        playGame.createMatch(matchId, p1.address, p2.address, 0)
      ).to.be.revertedWith("Stake must be greater than 0");
    });

    it("Should revert if match already exists", async function () {
      await playGame.createMatch(matchId, p1.address, p2.address, stake);
      
      await expect(
        playGame.createMatch(matchId, p1.address, p2.address, stake)
      ).to.be.revertedWith("Match already exists");
    });
  });

  describe("Stake", function () {
    const matchId = ethers.utils.id("test-match");
    const stake = ethers.utils.parseEther("100");

    beforeEach(async function () {
      await playGame.createMatch(matchId, p1.address, p2.address, stake);
    });

    it("Should allow p1 to stake", async function () {
      await gameToken.connect(p1).approve(playGame.address, stake);
      
      await expect(playGame.connect(p1).stake(matchId))
        .to.emit(playGame, "Staked")
        .withArgs(matchId, p1.address, stake);
      
      const match = await playGame.getMatch(matchId);
      expect(match.p1Staked).to.be.true;
      expect(match.p2Staked).to.be.false;
      expect(match.status).to.equal(0); // Still CREATED
    });

    it("Should allow p2 to stake", async function () {
      await gameToken.connect(p2).approve(playGame.address, stake);
      
      await expect(playGame.connect(p2).stake(matchId))
        .to.emit(playGame, "Staked")
        .withArgs(matchId, p2.address, stake);
      
      const match = await playGame.getMatch(matchId);
      expect(match.p1Staked).to.be.false;
      expect(match.p2Staked).to.be.true;
      expect(match.status).to.equal(0); // Still CREATED
    });

    it("Should update status to STAKED when both players stake", async function () {
      await gameToken.connect(p1).approve(playGame.address, stake);
      await gameToken.connect(p2).approve(playGame.address, stake);
      
      await playGame.connect(p1).stake(matchId);
      await playGame.connect(p2).stake(matchId);
      
      const match = await playGame.getMatch(matchId);
      expect(match.p1Staked).to.be.true;
      expect(match.p2Staked).to.be.true;
      expect(match.status).to.equal(1); // STAKED
      expect(match.startTime).to.be.gt(0);
    });

    it("Should not allow non-players to stake", async function () {
      await gameToken.connect(user3).approve(playGame.address, stake);
      
      await expect(
        playGame.connect(user3).stake(matchId)
      ).to.be.revertedWith("Not a player in this match");
    });

    it("Should not allow staking twice", async function () {
      await gameToken.connect(p1).approve(playGame.address, stake);
      await playGame.connect(p1).stake(matchId);
      
      await expect(
        playGame.connect(p1).stake(matchId)
      ).to.be.revertedWith("Already staked");
    });

    it("Should not allow staking if match doesn't exist", async function () {
      const fakeMatchId = ethers.utils.id("fake-match");
      await gameToken.connect(p1).approve(playGame.address, stake);
      
      await expect(
        playGame.connect(p1).stake(fakeMatchId)
      ).to.be.revertedWith("Match does not exist");
    });

    it("Should not allow staking if match is not in CREATED status", async function () {
      await gameToken.connect(p1).approve(playGame.address, stake);
      await gameToken.connect(p2).approve(playGame.address, stake);
      
      await playGame.connect(p1).stake(matchId);
      await playGame.connect(p2).stake(matchId);
      
      // Try to stake again after match is STAKED
      await expect(
        playGame.connect(p1).stake(matchId)
      ).to.be.revertedWith("Match not in created status");
    });

    it("Should transfer exact stake amount", async function () {
      const initialBalance = await gameToken.balanceOf(p1.address);
      await gameToken.connect(p1).approve(playGame.address, stake);
      
      await playGame.connect(p1).stake(matchId);
      
      expect(await gameToken.balanceOf(p1.address)).to.equal(initialBalance.sub(stake));
      expect(await gameToken.balanceOf(playGame.address)).to.equal(stake);
    });
  });

  describe("Commit Result", function () {
    const matchId = ethers.utils.id("test-match");
    const stake = ethers.utils.parseEther("100");

    beforeEach(async function () {
      await playGame.createMatch(matchId, p1.address, p2.address, stake);
      await gameToken.connect(p1).approve(playGame.address, stake);
      await gameToken.connect(p2).approve(playGame.address, stake);
      await playGame.connect(p1).stake(matchId);
      await playGame.connect(p2).stake(matchId);
    });

    it("Should allow operator to commit result", async function () {
      const initialBalance = await gameToken.balanceOf(p1.address);
      
      await expect(playGame.connect(operator).commitResult(matchId, p1.address))
        .to.emit(playGame, "Settled")
        .withArgs(matchId, p1.address, stake.mul(2));
      
      const match = await playGame.getMatch(matchId);
      expect(match.status).to.equal(2); // SETTLED
      expect(await gameToken.balanceOf(p1.address)).to.equal(initialBalance.add(stake.mul(2)));
    });

    it("Should not allow non-operator to commit result", async function () {
      await expect(
        playGame.connect(p1).commitResult(matchId, p1.address)
      ).to.be.revertedWith("Only operator can commit results");
    });

    it("Should revert if match doesn't exist", async function () {
      const fakeMatchId = ethers.utils.id("fake-match");
      
      await expect(
        playGame.connect(operator).commitResult(fakeMatchId, p1.address)
      ).to.be.revertedWith("Match does not exist");
    });

    it("Should revert if match is not staked", async function () {
      const newMatchId = ethers.utils.id("new-match");
      await playGame.createMatch(newMatchId, p1.address, p2.address, stake);
      
      await expect(
        playGame.connect(operator).commitResult(newMatchId, p1.address)
      ).to.be.revertedWith("Match not staked");
    });

    it("Should revert if winner is not a player", async function () {
      await expect(
        playGame.connect(operator).commitResult(matchId, user3.address)
      ).to.be.revertedWith("Winner must be a player");
    });

    it("Should revert on double commit", async function () {
      await playGame.connect(operator).commitResult(matchId, p1.address);
      
      await expect(
        playGame.connect(operator).commitResult(matchId, p2.address)
      ).to.be.revertedWith("Match not staked");
    });

    it("Should pay exactly 2x stake to winner", async function () {
      const initialBalance = await gameToken.balanceOf(p2.address);
      
      await playGame.connect(operator).commitResult(matchId, p2.address);
      
      expect(await gameToken.balanceOf(p2.address)).to.equal(initialBalance.add(stake.mul(2)));
    });
  });

  describe("Refund", function () {
    const matchId = ethers.utils.id("test-match");
    const stake = ethers.utils.parseEther("100");

    beforeEach(async function () {
      await playGame.createMatch(matchId, p1.address, p2.address, stake);
      await gameToken.connect(p1).approve(playGame.address, stake);
      await gameToken.connect(p2).approve(playGame.address, stake);
      await playGame.connect(p1).stake(matchId);
      await playGame.connect(p2).stake(matchId);
    });

    it("Should refund both players after timeout", async function () {
      // Fast forward time by 25 hours
      await ethers.provider.send("evm_increaseTime", [25 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      
      const p1InitialBalance = await gameToken.balanceOf(p1.address);
      const p2InitialBalance = await gameToken.balanceOf(p2.address);
      
      await expect(playGame.refund(matchId))
        .to.emit(playGame, "Refunded")
        .withArgs(matchId, p1.address, stake)
        .and.to.emit(playGame, "Refunded")
        .withArgs(matchId, p2.address, stake);
      
      const match = await playGame.getMatch(matchId);
      expect(match.status).to.equal(3); // REFUNDED
      expect(await gameToken.balanceOf(p1.address)).to.equal(p1InitialBalance.add(stake));
      expect(await gameToken.balanceOf(p2.address)).to.equal(p2InitialBalance.add(stake));
    });

    it("Should not allow refund before timeout", async function () {
      await expect(
        playGame.refund(matchId)
      ).to.be.revertedWith("Timeout not reached");
    });

    it("Should not allow refund if match doesn't exist", async function () {
      const fakeMatchId = ethers.utils.id("fake-match");
      
      await expect(
        playGame.refund(fakeMatchId)
      ).to.be.revertedWith("Match does not exist");
    });

    it("Should not allow refund if match is not staked", async function () {
      const newMatchId = ethers.utils.id("new-match");
      await playGame.createMatch(newMatchId, p1.address, p2.address, stake);
      
      await expect(
        playGame.refund(newMatchId)
      ).to.be.revertedWith("Match not staked");
    });

    it("Should not allow refund if match is already settled", async function () {
      await playGame.connect(operator).commitResult(matchId, p1.address);
      
      await ethers.provider.send("evm_increaseTime", [25 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      
      await expect(
        playGame.refund(matchId)
      ).to.be.revertedWith("Match not staked");
    });

    it("Should refund only staked players", async function () {
      // Create match where only p1 stakes
      const partialMatchId = ethers.utils.id("partial-match");
      await playGame.createMatch(partialMatchId, p1.address, p2.address, stake);
      await gameToken.connect(p1).approve(playGame.address, stake);
      await playGame.connect(p1).stake(partialMatchId);
      
      await ethers.provider.send("evm_increaseTime", [25 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      
      const p1InitialBalance = await gameToken.balanceOf(p1.address);
      
      await playGame.refund(partialMatchId);
      
      expect(await gameToken.balanceOf(p1.address)).to.equal(p1InitialBalance.add(stake));
      // p2 should not get refund since they didn't stake
    });
  });

  describe("Helper functions", function () {
    const matchId = ethers.utils.id("test-match");
    const stake = ethers.utils.parseEther("100");

    it("Should return correct match details", async function () {
      await playGame.createMatch(matchId, p1.address, p2.address, stake);
      
      const match = await playGame.getMatch(matchId);
      expect(match.id).to.equal(matchId);
      expect(match.p1).to.equal(p1.address);
      expect(match.p2).to.equal(p2.address);
      expect(match.stake).to.equal(stake);
    });

    it("Should check refund eligibility correctly", async function () {
      await playGame.createMatch(matchId, p1.address, p2.address, stake);
      await gameToken.connect(p1).approve(playGame.address, stake);
      await gameToken.connect(p2).approve(playGame.address, stake);
      await playGame.connect(p1).stake(matchId);
      await playGame.connect(p2).stake(matchId);
      
      // Before timeout
      expect(await playGame.canRefund(matchId)).to.be.false;
      
      // After timeout
      await ethers.provider.send("evm_increaseTime", [25 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      
      expect(await playGame.canRefund(matchId)).to.be.true;
    });

    it("Should return correct GT balance", async function () {
      await playGame.createMatch(matchId, p1.address, p2.address, stake);
      await gameToken.connect(p1).approve(playGame.address, stake);
      await playGame.connect(p1).stake(matchId);
      
      expect(await playGame.getGTBalance()).to.equal(stake);
    });
  });
});
