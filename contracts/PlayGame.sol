// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./GameToken.sol";

/**
 * @title PlayGame
 * @dev Manages PvP matches with staking, result commitment, and refund functionality
 * Uses status guards and idempotency checks for security
 */
contract PlayGame is ReentrancyGuard, Ownable {
    IERC20 public immutable gameToken;
    address public immutable operator;
    uint256 public immutable timeout;
    
    // Match status constants
    uint8 public constant CREATED = 0;
    uint8 public constant STAKED = 1;
    uint8 public constant SETTLED = 2;
    uint8 public constant REFUNDED = 3;
    
    struct Match {
        bytes32 id;
        address p1;
        address p2;
        uint256 stake;
        uint8 status;
        bool p1Staked;
        bool p2Staked;
        uint256 startTime;
    }
    
    mapping(bytes32 => Match) public matches;
    
    event MatchCreated(bytes32 indexed matchId, address indexed p1, address indexed p2, uint256 stake);
    event Staked(bytes32 indexed matchId, address indexed player, uint256 stake);
    event Settled(bytes32 indexed matchId, address indexed winner, uint256 amount);
    event Refunded(bytes32 indexed matchId, address indexed player, uint256 amount);
    
    /**
     * @dev Constructor sets up the game parameters
     * @param _gameToken GameToken contract address
     * @param _operator Address allowed to commit match results
     * @param _timeout Timeout period for refunds (in seconds)
     */
    constructor(address _gameToken, address _operator, uint256 _timeout) {
        gameToken = IERC20(_gameToken);
        operator = _operator;
        timeout = _timeout;
    }
    
    /**
     * @dev Create a new match (owner only)
     * @param matchId Unique identifier for the match
     * @param p1 First player address
     * @param p2 Second player address
     * @param stake Amount each player must stake
     */
    function createMatch(bytes32 matchId, address p1, address p2, uint256 stake) external onlyOwner {
        require(matchId != bytes32(0), "Invalid match ID");
        require(p1 != address(0) && p2 != address(0), "Invalid player addresses");
        require(p1 != p2, "Players must be different");
        require(stake > 0, "Stake must be greater than 0");
        require(matches[matchId].id == bytes32(0), "Match already exists");
        
        matches[matchId] = Match({
            id: matchId,
            p1: p1,
            p2: p2,
            stake: stake,
            status: CREATED,
            p1Staked: false,
            p2Staked: false,
            startTime: 0
        });
        
        emit MatchCreated(matchId, p1, p2, stake);
    }
    
    /**
     * @dev Stake GT tokens for a match
     * @param matchId Match identifier
     * CEI pattern: Check effects, then external interactions
     */
    function stake(bytes32 matchId) external nonReentrant {
        Match storage matchData = matches[matchId];
        require(matchData.id != bytes32(0), "Match does not exist");
        require(matchData.status == CREATED, "Match not in created status");
        require(msg.sender == matchData.p1 || msg.sender == matchData.p2, "Not a player in this match");
        
        bool isP1 = msg.sender == matchData.p1;
        require(!(isP1 ? matchData.p1Staked : matchData.p2Staked), "Already staked");
        
        // Check effects first (CEI pattern)
        if (isP1) {
            matchData.p1Staked = true;
        } else {
            matchData.p2Staked = true;
        }
        
        // If both players have staked, update status and start time
        if (matchData.p1Staked && matchData.p2Staked) {
            matchData.status = STAKED;
            matchData.startTime = block.timestamp;
        }
        
        // External interaction last (CEI pattern)
        // Transfer exact stake amount from player
        require(gameToken.transferFrom(msg.sender, address(this), matchData.stake), "GT transfer failed");
        
        emit Staked(matchId, msg.sender, matchData.stake);
    }
    
    /**
     * @dev Commit match result (operator only)
     * @param matchId Match identifier
     * @param winner Address of the winner (must be p1 or p2)
     */
    function commitResult(bytes32 matchId, address winner) external {
        require(msg.sender == operator, "Only operator can commit results");
        
        Match storage matchData = matches[matchId];
        require(matchData.id != bytes32(0), "Match does not exist");
        require(matchData.status == STAKED, "Match not staked");
        require(winner == matchData.p1 || winner == matchData.p2, "Winner must be a player");
        
        // Check effects first (CEI pattern)
        matchData.status = SETTLED;
        
        // External interaction last (CEI pattern)
        // Transfer 2x stake to winner
        uint256 payout = matchData.stake * 2;
        require(gameToken.transfer(winner, payout), "GT transfer failed");
        
        emit Settled(matchId, winner, payout);
    }
    
    /**
     * @dev Refund players if match times out
     * @param matchId Match identifier
     */
    function refund(bytes32 matchId) external nonReentrant {
        Match storage matchData = matches[matchId];
        require(matchData.id != bytes32(0), "Match does not exist");
        require(matchData.status == STAKED, "Match not staked");
        require(block.timestamp >= matchData.startTime + timeout, "Timeout not reached");
        
        // Check effects first (CEI pattern)
        matchData.status = REFUNDED;
        
        // External interactions last (CEI pattern)
        // Refund each staked player their stake
        if (matchData.p1Staked) {
            require(gameToken.transfer(matchData.p1, matchData.stake), "GT transfer failed");
            emit Refunded(matchId, matchData.p1, matchData.stake);
        }
        
        if (matchData.p2Staked) {
            require(gameToken.transfer(matchData.p2, matchData.stake), "GT transfer failed");
            emit Refunded(matchId, matchData.p2, matchData.stake);
        }
    }
    
    /**
     * @dev Get match details
     * @param matchId Match identifier
     */
    function getMatch(bytes32 matchId) external view returns (Match memory) {
        return matches[matchId];
    }
    
    /**
     * @dev Check if match can be refunded
     * @param matchId Match identifier
     */
    function canRefund(bytes32 matchId) external view returns (bool) {
        Match storage matchData = matches[matchId];
        return matchData.id != bytes32(0) && 
               matchData.status == STAKED && 
               block.timestamp >= matchData.startTime + timeout;
    }
    
    /**
     * @dev Get contract's GT balance
     */
    function getGTBalance() external view returns (uint256) {
        return gameToken.balanceOf(address(this));
    }
}
