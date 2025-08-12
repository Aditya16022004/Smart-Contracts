const { ethers } = require('ethers');
const Database = require('better-sqlite3');
const express = require('express');
require('dotenv').config();

class LeaderboardIndexer {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        this.db = new Database(process.env.DB_PATH || './leaderboard.db');
        this.app = express();
        this.port = process.env.LEADERBOARD_PORT || 8081;
        
        this.contractAddresses = {
            gameToken: process.env.GAME_TOKEN_ADDRESS,
            tokenStore: process.env.TOKEN_STORE_ADDRESS,
            playGame: process.env.PLAY_GAME_ADDRESS
        };
        
        this.init();
    }
    
    init() {
        this.setupDatabase();
        this.setupContracts();
        this.setupExpressServer();
        this.startIndexing();
    }
    
    setupDatabase() {
        // Create tables if they don't exist
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS players (
                address TEXT PRIMARY KEY,
                wins INTEGER DEFAULT 0,
                total_gt_won TEXT DEFAULT '0',
                matches_played INTEGER DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                address TEXT,
                amount TEXT,
                match_id TEXT,
                block_number INTEGER,
                transaction_hash TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_players_wins ON players(wins DESC);
            CREATE INDEX IF NOT EXISTS idx_players_gt_won ON players(total_gt_won DESC);
            CREATE INDEX IF NOT EXISTS idx_events_address ON events(address);
            CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
        `);
        
        console.log('Database initialized');
    }
    
    setupContracts() {
        // Contract ABIs for event listening
        const tokenStoreABI = [
            "event Purchase(address indexed buyer, uint256 usdtAmount, uint256 gtOut)"
        ];
        
        const playGameABI = [
            "event MatchCreated(bytes32 indexed matchId, address indexed p1, address indexed p2, uint256 stake)",
            "event Staked(bytes32 indexed matchId, address indexed player, uint256 stake)",
            "event Settled(bytes32 indexed matchId, address indexed winner, uint256 amount)",
            "event Refunded(bytes32 indexed matchId, address indexed player, uint256 amount)"
        ];
        
        this.contracts = {
            tokenStore: new ethers.Contract(this.contractAddresses.tokenStore, tokenStoreABI, this.provider),
            playGame: new ethers.Contract(this.contractAddresses.playGame, playGameABI, this.provider)
        };
        
        console.log('Contracts initialized');
    }
    
    setupExpressServer() {
        this.app.use(express.json());
        
        // CORS for frontend access
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });
        
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'OK',
                timestamp: new Date().toISOString(),
                indexed_events: this.getEventCount(),
                total_players: this.getPlayerCount()
            });
        });
        
        // Get leaderboard
        this.app.get('/leaderboard', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 10;
                const leaderboard = this.getLeaderboard(limit);
                res.json({
                    leaderboard,
                    total_players: this.getPlayerCount(),
                    last_updated: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get player stats
        this.app.get('/player/:address', (req, res) => {
            try {
                const address = req.params.address.toLowerCase();
                const stats = this.getPlayerStats(address);
                
                if (stats) {
                    res.json(stats);
                } else {
                    res.status(404).json({ error: 'Player not found' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get recent events
        this.app.get('/events', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 20;
                const events = this.getRecentEvents(limit);
                res.json(events);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Start server
        this.app.listen(this.port, () => {
            console.log(`Leaderboard server running on port ${this.port}`);
            console.log(`Leaderboard: http://localhost:${this.port}/leaderboard`);
        });
    }
    
    startIndexing() {
        console.log('Starting event indexing...');
        
        // Listen to TokenStore events
        this.contracts.tokenStore.on('Purchase', (buyer, usdtAmount, gtOut, event) => {
            this.handlePurchaseEvent(buyer, usdtAmount, gtOut, event);
        });
        
        // Listen to PlayGame events
        this.contracts.playGame.on('MatchCreated', (matchId, p1, p2, stake, event) => {
            this.handleMatchCreatedEvent(matchId, p1, p2, stake, event);
        });
        
        this.contracts.playGame.on('Staked', (matchId, player, stake, event) => {
            this.handleStakedEvent(matchId, player, stake, event);
        });
        
        this.contracts.playGame.on('Settled', (matchId, winner, amount, event) => {
            this.handleSettledEvent(matchId, winner, amount, event);
        });
        
        this.contracts.playGame.on('Refunded', (matchId, player, amount, event) => {
            this.handleRefundedEvent(matchId, player, amount, event);
        });
        
        console.log('Event listeners active');
    }
    
    async handlePurchaseEvent(buyer, usdtAmount, gtOut, event) {
        try {
            const address = buyer.toLowerCase();
            
            // Log event
            this.logEvent('Purchase', address, gtOut.toString(), null, event.blockNumber, event.transactionHash);
            
            // Update player stats (purchase doesn't affect wins/matches)
            this.updatePlayerStats(address, 0, 0, 0);
            
            console.log(`Purchase event: ${address} bought ${ethers.formatEther(gtOut)} GT`);
        } catch (error) {
            console.error('Error handling Purchase event:', error);
        }
    }
    
    async handleMatchCreatedEvent(matchId, p1, p2, stake, event) {
        try {
            // Log event for both players
            this.logEvent('MatchCreated', p1.toLowerCase(), stake.toString(), matchId, event.blockNumber, event.transactionHash);
            this.logEvent('MatchCreated', p2.toLowerCase(), stake.toString(), matchId, event.blockNumber, event.transactionHash);
            
            // Initialize players if they don't exist
            this.updatePlayerStats(p1.toLowerCase(), 0, 0, 0);
            this.updatePlayerStats(p2.toLowerCase(), 0, 0, 0);
            
            console.log(`MatchCreated event: ${matchId} between ${p1} and ${p2}`);
        } catch (error) {
            console.error('Error handling MatchCreated event:', error);
        }
    }
    
    async handleStakedEvent(matchId, player, stake, event) {
        try {
            const address = player.toLowerCase();
            
            // Log event
            this.logEvent('Staked', address, stake.toString(), matchId, event.blockNumber, event.transactionHash);
            
            console.log(`Staked event: ${address} staked ${ethers.formatEther(stake)} GT for match ${matchId}`);
        } catch (error) {
            console.error('Error handling Staked event:', error);
        }
    }
    
    async handleSettledEvent(matchId, winner, amount, event) {
        try {
            const address = winner.toLowerCase();
            
            // Log event
            this.logEvent('Settled', address, amount.toString(), matchId, event.blockNumber, event.transactionHash);
            
            // Update winner stats
            this.updatePlayerStats(address, 1, amount.toString(), 1);
            
            console.log(`Settled event: ${address} won ${ethers.formatEther(amount)} GT in match ${matchId}`);
        } catch (error) {
            console.error('Error handling Settled event:', error);
        }
    }
    
    async handleRefundedEvent(matchId, player, amount, event) {
        try {
            const address = player.toLowerCase();
            
            // Log event
            this.logEvent('Refunded', address, amount.toString(), matchId, event.blockNumber, event.transactionHash);
            
            // Update player stats (refund counts as a match played but no win)
            this.updatePlayerStats(address, 0, 0, 1);
            
            console.log(`Refunded event: ${address} refunded ${ethers.formatEther(amount)} GT from match ${matchId}`);
        } catch (error) {
            console.error('Error handling Refunded event:', error);
        }
    }
    
    logEvent(eventType, address, amount, matchId, blockNumber, transactionHash) {
        const stmt = this.db.prepare(`
            INSERT INTO events (event_type, address, amount, match_id, block_number, transaction_hash)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run(eventType, address, amount, matchId, blockNumber, transactionHash);
    }
    
    updatePlayerStats(address, winsToAdd, gtWonToAdd, matchesToAdd) {
        const stmt = this.db.prepare(`
            INSERT INTO players (address, wins, total_gt_won, matches_played)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(address) DO UPDATE SET
                wins = wins + ?,
                total_gt_won = CAST(CAST(total_gt_won AS DECIMAL) + CAST(? AS DECIMAL) AS TEXT),
                matches_played = matches_played + ?,
                last_updated = CURRENT_TIMESTAMP
        `);
        
        stmt.run(address, winsToAdd, gtWonToAdd, matchesToAdd, winsToAdd, gtWonToAdd, matchesToAdd);
    }
    
    getLeaderboard(limit = 10) {
        const stmt = this.db.prepare(`
            SELECT address, wins, total_gt_won, matches_played, last_updated
            FROM players
            ORDER BY CAST(total_gt_won AS DECIMAL) DESC, wins DESC
            LIMIT ?
        `);
        
        return stmt.all(limit);
    }
    
    getPlayerStats(address) {
        const stmt = this.db.prepare(`
            SELECT address, wins, total_gt_won, matches_played, last_updated
            FROM players
            WHERE address = ?
        `);
        
        return stmt.get(address.toLowerCase());
    }
    
    getRecentEvents(limit = 20) {
        const stmt = this.db.prepare(`
            SELECT event_type, address, amount, match_id, block_number, transaction_hash, timestamp
            FROM events
            ORDER BY timestamp DESC
            LIMIT ?
        `);
        
        return stmt.all(limit);
    }
    
    getEventCount() {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM events');
        return stmt.get().count;
    }
    
    getPlayerCount() {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM players');
        return stmt.get().count;
    }
}

// Start the indexer
if (require.main === module) {
    const indexer = new LeaderboardIndexer();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('Shutting down leaderboard indexer...');
        indexer.db.close();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        console.log('Shutting down leaderboard indexer...');
        indexer.db.close();
        process.exit(0);
    });
}

module.exports = LeaderboardIndexer;
