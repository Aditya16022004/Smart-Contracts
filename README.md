# TriX - PvP Staking System

A complete end-to-end PvP staking system built on Ethereum with smart contracts, backend API, frontend interface, and leaderboard functionality.

## 🎯 Overview

TriX is a decentralized PvP staking system where players:
1. Buy GameToken (GT) with USDT
2. Create matches and stake GT tokens
3. Compete in PvP battles
4. Winners receive 2x their stake
5. Track performance on a live leaderboard

## 🏗️ Architecture

- **Smart Contracts**: Solidity contracts for token management, staking, and match resolution
- **Backend API**: Express.js server with ethers.js for blockchain interaction
- **Frontend**: Vanilla JavaScript with MetaMask integration
- **Leaderboard**: SQLite-based indexer with real-time event processing

## 📋 Prerequisites

- Node.js 18+ and npm
- MetaMask browser extension
- Git

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd trix-pvp-staking
npm run install:all
```

### 2. Start Local Blockchain

```bash
npm run node
```

Keep this terminal running. You'll see account addresses and private keys.

### 3. Deploy Contracts

In a new terminal:

```bash
npm run deploy
```

Copy the contract addresses from the output.

### 4. Configure Environment

Copy the API environment file:

```bash
cp api/env.example api/.env
```

Update `api/.env` with the contract addresses from step 3:

```env
RPC_URL=http://127.0.0.1:8545
BACKEND_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
GAME_TOKEN_ADDRESS=<from deployment output>
TOKEN_STORE_ADDRESS=<from deployment output>
PLAY_GAME_ADDRESS=<from deployment output>
USDT_ADDRESS=<from deployment output>
OPERATOR_ADDRESS=<from deployment output>
PORT=8080
API_KEY=your-secret-api-key-here
```

### 5. Start Backend API

```bash
npm run start:api
```

### 6. Start Leaderboard Indexer

```bash
npm run start:leaderboard
```

### 7. Serve Frontend

```bash
npm run serve:web
```

Open http://localhost:3000 in your browser.

## 🧪 Testing

### Run All Tests

```bash
npm run test
```

### Run Specific Test Files

```bash
npx hardhat test test/GameToken.test.js
npx hardhat test test/TokenStore.test.js
npx hardhat test test/PlayGame.test.js
npx hardhat test test/integration.test.js
```

### Gas Report

```bash
npm run gas
```

## 📖 Usage Guide

### For Players

1. **Connect Wallet**: Click "Connect Wallet" and approve MetaMask connection
2. **Buy GT**: Enter USDT amount, approve TokenStore, then buy GT
3. **Create Match**: Enter opponent address and stake amount
4. **Stake**: Approve PlayGame contract and stake your GT
5. **Wait for Result**: Operator will submit match results

### For Operators

1. **Submit Results**: Use the "Submit Match Result" section
2. **API Access**: Use the backend API with proper authentication
3. **Monitor Events**: Check the leaderboard for real-time updates

## 🔧 API Endpoints

### Purchase
- `GET /purchase?amount=<usdtAmount>` - Buy GT with USDT
- `GET /purchase/rate` - Get current conversion rate
- `GET /purchase/estimate?amount=<usdtAmount>` - Estimate GT output

### Match Management
- `POST /match/start` - Create new match
- `POST /match/result` - Submit match result (operator only)
- `GET /match/:matchId` - Get match details

### Leaderboard
- `GET /leaderboard` - Get top players
- `GET /player/:address` - Get player stats
- `GET /events` - Get recent events

## 🎯 Acceptance Criteria Verification

### ✅ 1 USDT → 1 GT Conversion
```bash
# Test conversion rate
curl "http://localhost:8080/purchase/estimate?amount=1"
# Should return: {"estimatedGT": "1.0", "conversionRate": "1"}
```

### ✅ Escrow Requires Both Stakes
- Create match with two players
- Only one player stakes → match stays in CREATED status
- Both players stake → match moves to STAKED status

### ✅ Winner Gets Exactly 2× Stake
```bash
# Submit result (operator only)
curl -X POST http://localhost:8080/match/result \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-api-key-here" \
  -d '{"matchId": "test-match", "winner": "0x..."}'
```

### ✅ Double Commit Reverts
- Submit result for same match twice
- Second call should fail with "Match not staked"

### ✅ Refund Only After Timeout
- Create and stake match
- Try refund before 24 hours → should fail
- Wait 24+ hours → refund should succeed

### ✅ Events Emitted
All events are logged and indexed:
- `Purchase` - GT token purchases
- `MatchCreated` - New matches
- `Staked` - Player stakes
- `Settled` - Match results
- `Refunded` - Timeout refunds

### ✅ Leaderboard Works
```bash
curl http://localhost:8081/leaderboard
# Returns ranked players by GT won
```

## 🔒 Security Features

- **Reentrancy Protection**: All external calls protected
- **Access Control**: Owner/operator-only functions
- **CEI Pattern**: Check-Effects-Interactions pattern
- **Input Validation**: Comprehensive parameter checks
- **Emergency Pause**: Pausable contracts for emergencies

## 🚀 Production Deployment

### Smart Contracts
1. Deploy to testnet first (Sepolia/Goerli)
2. Verify contracts on Etherscan
3. Deploy to mainnet with proper security measures

### Backend
1. Use environment-specific configurations
2. Set up proper API key management
3. Use production database (PostgreSQL/MySQL)
4. Implement rate limiting and monitoring

### Frontend
1. Host on CDN (Vercel/Netlify)
2. Use production RPC endpoints
3. Implement proper error handling

## 📊 Gas Optimization

- Use `immutable` for contract addresses
- Use `constant` for fixed values
- Optimize storage layout
- Batch operations where possible

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- Create issues for bugs
- Check documentation
- Review test cases for examples

## 🔗 Links

- [Smart Contracts](./contracts/)
- [Backend API](./api/)
- [Frontend](./web/)
- [Tests](./test/)
- [Leaderboard](./tools/)

---

**Note**: This is a demonstration system. For production use, implement additional security measures, proper authentication, and thorough testing.
