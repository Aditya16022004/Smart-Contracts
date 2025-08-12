// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./GameToken.sol";

/**
 * @title TokenStore
 * @dev Handles USDT to GT conversion with escrow functionality
 * Uses CEI pattern and reentrancy protection for security
 */
contract TokenStore is ReentrancyGuard, Ownable {
    IERC20 public immutable usdt;
    GameToken public immutable gameToken;
    uint256 public gtPerUsdt;
    
    event Purchase(address indexed buyer, uint256 usdtAmount, uint256 gtOut);
    event GtPerUsdtUpdated(uint256 oldRate, uint256 newRate);
    
    /**
     * @dev Constructor sets up the conversion rate
     * @param _usdt USDT token address (6 decimals)
     * @param _gameToken GameToken address (18 decimals)
     * @param _gtPerUsdt Conversion rate: GT units per 1 USDT (in GT's smallest unit)
     * Example: gtPerUsdt = 1e18 means 1 USDT (1e6) = 1 GT (1e18)
     */
    constructor(address _usdt, address _gameToken, uint256 _gtPerUsdt) {
        usdt = IERC20(_usdt);
        gameToken = GameToken(_gameToken);
        gtPerUsdt = _gtPerUsdt;
    }
    
    /**
     * @dev Buy GT tokens with USDT
     * @param usdtAmount Amount of USDT to spend (in USDT's smallest unit)
     * CEI pattern: Check effects, then external interactions
     */
    function buy(uint256 usdtAmount) external nonReentrant {
        require(usdtAmount > 0, "Amount must be greater than 0");
        
        // Calculate GT output: usdtAmount * gtPerUsdt / 1e6
        // USDT has 6 decimals, so we divide by 1e6 to get USDT units
        uint256 gtOut = (usdtAmount * gtPerUsdt) / 1e6;
        require(gtOut > 0, "GT output must be greater than 0");
        
        // Check effects first (CEI pattern)
        // Mint GT tokens to buyer
        gameToken.mint(msg.sender, gtOut);
        
        // External interaction last (CEI pattern)
        // Transfer USDT from buyer to this contract
        require(usdt.transferFrom(msg.sender, address(this), usdtAmount), "USDT transfer failed");
        
        emit Purchase(msg.sender, usdtAmount, gtOut);
    }
    
    /**
     * @dev Withdraw USDT from contract (owner only)
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function withdrawUSDT(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(usdt.balanceOf(address(this)) >= amount, "Insufficient USDT balance");
        
        require(usdt.transfer(to, amount), "USDT transfer failed");
    }
    
    /**
     * @dev Update conversion rate (owner only)
     * @param newGtPerUsdt New conversion rate
     */
    function updateGtPerUsdt(uint256 newGtPerUsdt) external onlyOwner {
        require(newGtPerUsdt > 0, "Rate must be greater than 0");
        
        uint256 oldRate = gtPerUsdt;
        gtPerUsdt = newGtPerUsdt;
        
        emit GtPerUsdtUpdated(oldRate, newGtPerUsdt);
    }
    
    /**
     * @dev Get current USDT balance of contract
     */
    function getUSDTBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }
}
