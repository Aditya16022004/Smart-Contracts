const express = require('express');
const { ethers } = require('ethers');
const router = express.Router();

// Get contracts from server
let contracts;

// Initialize contracts reference
function setContracts(contractsInstance) {
  contracts = contractsInstance;
}

// Simple API key validation middleware
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }
  
  next();
}

// POST /match/start - Create a new match
router.post('/start', validateApiKey, async (req, res) => {
  try {
    const { matchId, p1, p2, stake } = req.body;
    
    // Validate required fields
    if (!matchId || !p1 || !p2 || !stake) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'matchId, p1, p2, and stake are required'
      });
    }
    
    // Validate addresses
    if (!ethers.utils.isAddress(p1) || !ethers.utils.isAddress(p2)) {
      return res.status(400).json({
        error: 'Invalid addresses',
        message: 'p1 and p2 must be valid Ethereum addresses'
      });
    }
    
    if (p1 === p2) {
      return res.status(400).json({
        error: 'Invalid players',
        message: 'p1 and p2 must be different addresses'
      });
    }
    
    // Validate stake amount
    const stakeAmount = ethers.utils.parseEther(stake);
    if (stakeAmount.lte(0)) {
      return res.status(400).json({
        error: 'Invalid stake',
        message: 'Stake must be greater than 0'
      });
    }
    
    // Convert matchId to bytes32 if it's a string
    const matchIdBytes = ethers.utils.isHexString(matchId) ? matchId : ethers.utils.id(matchId);
    
    console.log(`Creating match: ${matchIdBytes}`);
    console.log(`Players: ${p1} vs ${p2}`);
    console.log(`Stake: ${ethers.utils.formatEther(stakeAmount)} GT`);
    
    // Create the match
    const tx = await contracts.playGame.createMatch(matchIdBytes, p1, p2, stakeAmount);
    
    console.log(`Match creation transaction sent: ${tx.hash}`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    console.log(`Match created in block ${receipt.blockNumber}`);
    
    res.json({
      success: true,
      matchId: matchIdBytes,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      players: { p1, p2 },
      stake: ethers.utils.formatEther(stakeAmount),
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: ethers.utils.formatUnits(receipt.gasPrice, 'gwei') + ' gwei',
      nextSteps: [
        'Both players need to approve the PlayGame contract to spend their GT',
        'Both players need to call the stake function on the PlayGame contract',
        'Once both players have staked, the match will be ready for result commitment'
      ]
    });
    
  } catch (error) {
    console.error('Match creation error:', error);
    
    // Handle specific error cases
    if (error.message.includes('Match already exists')) {
      return res.status(400).json({
        error: 'Match already exists',
        message: 'A match with this ID already exists'
      });
    }
    
    if (error.message.includes('Invalid match ID')) {
      return res.status(400).json({
        error: 'Invalid match ID',
        message: 'Match ID cannot be zero'
      });
    }
    
    if (error.message.includes('Invalid player addresses')) {
      return res.status(400).json({
        error: 'Invalid player addresses',
        message: 'Player addresses cannot be zero'
      });
    }
    
    if (error.message.includes('Players must be different')) {
      return res.status(400).json({
        error: 'Invalid players',
        message: 'p1 and p2 must be different addresses'
      });
    }
    
    if (error.message.includes('Stake must be greater than 0')) {
      return res.status(400).json({
        error: 'Invalid stake',
        message: 'Stake amount must be greater than 0'
      });
    }
    
    res.status(500).json({
      error: 'Match creation failed',
      message: error.message
    });
  }
});

// POST /match/result - Commit match result
router.post('/result', validateApiKey, async (req, res) => {
  try {
    const { matchId, winner } = req.body;
    
    // Validate required fields
    if (!matchId || !winner) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'matchId and winner are required'
      });
    }
    
    // Validate winner address
    if (!ethers.utils.isAddress(winner)) {
      return res.status(400).json({
        error: 'Invalid winner address',
        message: 'Winner must be a valid Ethereum address'
      });
    }
    
    // Convert matchId to bytes32 if it's a string
    const matchIdBytes = ethers.utils.isHexString(matchId) ? matchId : ethers.utils.id(matchId);
    
    console.log(`Committing result for match: ${matchIdBytes}`);
    console.log(`Winner: ${winner}`);
    
    // Get match details first
    const match = await contracts.playGame.getMatch(matchIdBytes);
    
    if (!match.id || match.id === ethers.constants.HashZero) {
      return res.status(404).json({
        error: 'Match not found',
        message: 'No match exists with the provided ID'
      });
    }
    
    if (match.status !== 1) { // STAKED
      return res.status(400).json({
        error: 'Match not ready',
        message: `Match is in status ${match.status}, must be STAKED (1) to commit result`
      });
    }
    
    if (winner !== match.p1 && winner !== match.p2) {
      return res.status(400).json({
        error: 'Invalid winner',
        message: 'Winner must be one of the match players'
      });
    }
    
    // Commit the result
    const tx = await contracts.playGame.commitResult(matchIdBytes, winner);
    
    console.log(`Result commitment transaction sent: ${tx.hash}`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    console.log(`Result committed in block ${receipt.blockNumber}`);
    
    // Parse events to get payout amount
    const settledEvent = receipt.events?.find(event => event.event === 'Settled');
    const payoutAmount = settledEvent ? settledEvent.args.amount : match.stake.mul(2);
    
    res.json({
      success: true,
      matchId: matchIdBytes,
      winner,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      payout: ethers.utils.formatEther(payoutAmount),
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: ethers.utils.formatUnits(receipt.gasPrice, 'gwei') + ' gwei'
    });
    
  } catch (error) {
    console.error('Result commitment error:', error);
    
    // Handle specific error cases
    if (error.message.includes('Only operator can commit results')) {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'Only the operator can commit match results'
      });
    }
    
    if (error.message.includes('Match does not exist')) {
      return res.status(404).json({
        error: 'Match not found',
        message: 'No match exists with the provided ID'
      });
    }
    
    if (error.message.includes('Match not staked')) {
      return res.status(400).json({
        error: 'Match not ready',
        message: 'Match must be in STAKED status to commit result'
      });
    }
    
    if (error.message.includes('Winner must be a player')) {
      return res.status(400).json({
        error: 'Invalid winner',
        message: 'Winner must be one of the match players'
      });
    }
    
    res.status(500).json({
      error: 'Result commitment failed',
      message: error.message
    });
  }
});

// GET /match/:matchId - Get match details
router.get('/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    
    // Convert matchId to bytes32 if it's a string
    const matchIdBytes = ethers.utils.isHexString(matchId) ? matchId : ethers.utils.id(matchId);
    
    const match = await contracts.playGame.getMatch(matchIdBytes);
    
    if (!match.id || match.id === ethers.constants.HashZero) {
      return res.status(404).json({
        error: 'Match not found',
        message: 'No match exists with the provided ID'
      });
    }
    
    // Convert status number to string
    const statusMap = {
      0: 'CREATED',
      1: 'STAKED',
      2: 'SETTLED',
      3: 'REFUNDED'
    };
    
    res.json({
      matchId: matchIdBytes,
      p1: match.p1,
      p2: match.p2,
      stake: ethers.utils.formatEther(match.stake),
      status: statusMap[match.status] || 'UNKNOWN',
      statusCode: match.status,
      p1Staked: match.p1Staked,
      p2Staked: match.p2Staked,
      startTime: match.startTime.toString(),
      startTimeFormatted: new Date(match.startTime * 1000).toISOString()
    });
    
  } catch (error) {
    console.error('Match query error:', error);
    res.status(500).json({
      error: 'Failed to get match details',
      message: error.message
    });
  }
});

// GET /match/list - List recent matches (simplified)
router.get('/list/recent', async (req, res) => {
  try {
    // This is a simplified endpoint - in production you'd want to store match data
    // and query from a database. For now, we'll return a message.
    res.json({
      message: 'Recent matches endpoint - implement database integration for full functionality',
      note: 'Consider storing match events in a database for efficient querying'
    });
    
  } catch (error) {
    console.error('Match list error:', error);
    res.status(500).json({
      error: 'Failed to get match list',
      message: error.message
    });
  }
});

module.exports = { router, setContracts };
