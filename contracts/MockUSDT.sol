// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDT
 * @dev Mock USDT token for local testing (6 decimals)
 */
contract MockUSDT is ERC20, Ownable {
    constructor() ERC20("Mock USDT", "USDT") {
        // USDT has 6 decimals
        _mint(msg.sender, 1000000 * 10**6); // 1M USDT
    }
    
    /**
     * @dev Mint tokens (for testing)
     * @param to Address to mint to
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    /**
     * @dev Override decimals to return 6
     */
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}
