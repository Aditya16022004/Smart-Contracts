const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');
require('dotenv').config();

const purchaseRoutes = require('./routes/purchase');
const matchRoutes = require('./routes/match');

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize blockchain connection
let provider, wallet, contracts;

async function initializeBlockchain() {
  try {
    // Connect to blockchain
    provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    wallet = new ethers.Wallet(process.env.BACKEND_PRIVATE_KEY, provider);
    
    console.log('Connected to blockchain at:', process.env.RPC_URL);
    console.log('Backend wallet address:', wallet.address);
    
    // Load contract ABIs (simplified for demo - in production, load from artifacts)
    const gameTokenABI = [
      "function balanceOf(address owner) view returns (uint256)",
      "function transfer(address to, uint256 amount) returns (bool)",
      "function transferFrom(address from, address to, uint256 amount) returns (bool)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)"
    ];
    
    const tokenStoreABI = [
      "function buy(uint256 usdtAmount)",
      "function gtPerUsdt() view returns (uint256)",
      "event Purchase(address indexed buyer, uint256 usdtAmount, uint256 gtOut)"
    ];
    
    const playGameABI = [
      "function createMatch(bytes32 matchId, address p1, address p2, uint256 stake)",
      "function commitResult(bytes32 matchId, address winner)",
      "function getMatch(bytes32 matchId) view returns (tuple(bytes32 id, address p1, address p2, uint256 stake, uint8 status, bool p1Staked, bool p2Staked, uint256 startTime))",
      "event MatchCreated(bytes32 indexed matchId, address indexed p1, address indexed p2, uint256 stake)",
      "event Settled(bytes32 indexed matchId, address indexed winner, uint256 amount)"
    ];
    
    // Initialize contract instances
    contracts = {
      gameToken: new ethers.Contract(process.env.GAME_TOKEN_ADDRESS, gameTokenABI, wallet),
      tokenStore: new ethers.Contract(process.env.TOKEN_STORE_ADDRESS, tokenStoreABI, wallet),
      playGame: new ethers.Contract(process.env.PLAY_GAME_ADDRESS, playGameABI, wallet),
      usdt: new ethers.Contract(process.env.USDT_ADDRESS, gameTokenABI, wallet) // Using same ABI for simplicity
    };
    
    console.log('Contracts initialized:');
    console.log('- GameToken:', contracts.gameToken.address);
    console.log('- TokenStore:', contracts.tokenStore.address);
    console.log('- PlayGame:', contracts.playGame.address);
    console.log('- USDT:', contracts.usdt.address);
    
  } catch (error) {
    console.error('Failed to initialize blockchain connection:', error);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    network: process.env.RPC_URL,
    contracts: {
      gameToken: contracts?.gameToken?.address,
      tokenStore: contracts?.tokenStore?.address,
      playGame: contracts?.playGame?.address
    }
  });
});

// Initialize routes with contracts
const { router: purchaseRouter, setContracts: setPurchaseContracts } = require('./routes/purchase');
const { router: matchRouter, setContracts: setMatchContracts } = require('./routes/match');

// API routes
app.use('/purchase', purchaseRouter);
app.use('/match', matchRouter);

// Set contracts in routes after initialization
function initializeRoutes() {
  if (contracts) {
    setPurchaseContracts(contracts);
    setMatchContracts(contracts);
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Start server
async function startServer() {
  await initializeBlockchain();
  initializeRoutes();
  
  app.listen(PORT, () => {
    console.log(`TriX API server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Export for testing
module.exports = { app, contracts, provider, wallet };

// Start server if this file is run directly
if (require.main === module) {
  startServer().catch(console.error);
}
