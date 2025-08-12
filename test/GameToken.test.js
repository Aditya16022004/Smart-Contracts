const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GameToken", function () {
  let gameToken;
  let tokenStore;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    const GameToken = await ethers.getContractFactory("GameToken");
    gameToken = await GameToken.deploy();
    await gameToken.deployed();
    
    const TokenStore = await ethers.getContractFactory("TokenStore");
    tokenStore = await TokenStore.deploy(ethers.constants.AddressZero, gameToken.address, ethers.utils.parseEther("1"));
    await tokenStore.deployed();
  });

  describe("Basic ERC-20 functionality", function () {
    it("Should have correct name and symbol", async function () {
      expect(await gameToken.name()).to.equal("GameToken");
      expect(await gameToken.symbol()).to.equal("GT");
    });

    it("Should have 18 decimals", async function () {
      expect(await gameToken.decimals()).to.equal(18);
    });

    it("Should start with zero total supply", async function () {
      expect(await gameToken.totalSupply()).to.equal(0);
    });
  });

  describe("Minting", function () {
    it("Should allow owner to mint tokens", async function () {
      const amount = ethers.utils.parseEther("100");
      await gameToken.mint(user1.address, amount);
      expect(await gameToken.balanceOf(user1.address)).to.equal(amount);
      expect(await gameToken.totalSupply()).to.equal(amount);
    });

    it("Should allow TokenStore to mint after granting minter role", async function () {
      await gameToken.grantMinterRole(tokenStore.address);
      const amount = ethers.utils.parseEther("50");
      await tokenStore.connect(user1).buy(ethers.utils.parseUnits("50", 6)); // This will call mint internally
      expect(await gameToken.balanceOf(user1.address)).to.equal(amount);
    });

    it("Should not allow non-owner to mint", async function () {
      const amount = ethers.utils.parseEther("100");
      await expect(
        gameToken.connect(user1).mint(user2.address, amount)
      ).to.be.revertedWith("AccessControl");
    });

    it("Should not allow minting when paused", async function () {
      await gameToken.pause();
      const amount = ethers.utils.parseEther("100");
      await expect(
        gameToken.mint(user1.address, amount)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("Transfers", function () {
    beforeEach(async function () {
      await gameToken.mint(user1.address, ethers.utils.parseEther("100"));
    });

    it("Should allow transfers between users", async function () {
      const amount = ethers.utils.parseEther("50");
      await gameToken.connect(user1).transfer(user2.address, amount);
      expect(await gameToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("50"));
      expect(await gameToken.balanceOf(user2.address)).to.equal(amount);
    });

    it("Should not allow transfers when paused", async function () {
      await gameToken.pause();
      const amount = ethers.utils.parseEther("50");
      await expect(
        gameToken.connect(user1).transfer(user2.address, amount)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should allow transferFrom with approval", async function () {
      const amount = ethers.utils.parseEther("50");
      await gameToken.connect(user1).approve(user2.address, amount);
      await gameToken.connect(user2).transferFrom(user1.address, owner.address, amount);
      expect(await gameToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("50"));
      expect(await gameToken.balanceOf(owner.address)).to.equal(amount);
    });
  });

  describe("Pause functionality", function () {
    it("Should allow owner to pause and unpause", async function () {
      await gameToken.pause();
      expect(await gameToken.paused()).to.be.true;
      
      await gameToken.unpause();
      expect(await gameToken.paused()).to.be.false;
    });

    it("Should not allow non-owner to pause", async function () {
      await expect(
        gameToken.connect(user1).pause()
      ).to.be.revertedWith("AccessControl");
    });

    it("Should not allow non-owner to unpause", async function () {
      await gameToken.pause();
      await expect(
        gameToken.connect(user1).unpause()
      ).to.be.revertedWith("AccessControl");
    });
  });

  describe("Role management", function () {
    it("Should grant minter role correctly", async function () {
      await gameToken.grantMinterRole(tokenStore.address);
      expect(await gameToken.hasRole(await gameToken.MINTER_ROLE(), tokenStore.address)).to.be.true;
    });

    it("Should not allow non-admin to grant minter role", async function () {
      await expect(
        gameToken.connect(user1).grantMinterRole(user2.address)
      ).to.be.revertedWith("AccessControl");
    });
  });
});
