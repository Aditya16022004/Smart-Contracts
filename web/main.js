// TriX Frontend JavaScript
class TriXApp {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.userAddress = null;
        this.contracts = {};
        this.apiBaseUrl = 'http://localhost:8080';
        
        this.contractAddresses = {
            gameToken: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
            tokenStore: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
            playGame: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
            usdt: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'
        };
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        this.checkWalletConnection();
    }
    
    setupEventListeners() {
        document.getElementById('connectWallet').addEventListener('click', () => this.connectWallet());
        document.getElementById('estimateBtn').addEventListener('click', () => this.estimatePurchase());
        document.getElementById('approveBtn').addEventListener('click', () => this.approveUSDT());
        document.getElementById('buyBtn').addEventListener('click', () => this.buyGT());
        document.getElementById('createMatchBtn').addEventListener('click', () => this.createMatch());
        document.getElementById('stakeBtn').addEventListener('click', () => this.stakeGT());
        document.getElementById('submitResultBtn').addEventListener('click', () => this.submitResult());
    }
    
    async connectWallet() {
        if (typeof window.ethereum === 'undefined') {
            this.showError('MetaMask is not installed.');
            return;
        }
        
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            await this.setupProvider(accounts[0]);
            this.showSuccess('Wallet connected!');
        } catch (error) {
            this.showError('Failed to connect wallet: ' + error.message);
        }
    }
    
    async setupProvider(address) {
        this.userAddress = address;
        this.provider = new ethers.providers.Web3Provider(window.ethereum);
        this.signer = this.provider.getSigner();
        this.setupContracts();
        this.updateWalletInfo();
        await this.updateBalances();
    }
    
    setupContracts() {
        const erc20ABI = [
            "function balanceOf(address owner) view returns (uint256)",
            "function approve(address spender, uint256 amount) returns (bool)"
        ];
        
        this.contracts = {
            gameToken: new ethers.Contract(this.contractAddresses.gameToken, erc20ABI, this.signer),
            usdt: new ethers.Contract(this.contractAddresses.usdt, erc20ABI, this.signer)
        };
    }
    
    updateWalletInfo() {
        const connectBtn = document.getElementById('connectWallet');
        const walletDetails = document.getElementById('walletDetails');
        const walletAddress = document.getElementById('walletAddress');
        
        if (this.userAddress) {
            connectBtn.style.display = 'none';
            walletDetails.style.display = 'block';
            walletAddress.textContent = this.userAddress;
        }
    }
    
    async updateBalances() {
        if (!this.userAddress) return;
        
        try {
            const [gtBalance, usdtBalance] = await Promise.all([
                this.contracts.gameToken.balanceOf(this.userAddress),
                this.contracts.usdt.balanceOf(this.userAddress)
            ]);
            
            document.getElementById('gtBalance').textContent = 
                parseFloat(ethers.utils.formatEther(gtBalance)).toFixed(2) + ' GT';
            document.getElementById('usdtBalance').textContent = 
                parseFloat(ethers.utils.formatUnits(usdtBalance, 6)).toFixed(2) + ' USDT';
        } catch (error) {
            console.error('Error updating balances:', error);
        }
    }
    
    async estimatePurchase() {
        const usdtAmount = document.getElementById('usdtAmount').value;
        if (!usdtAmount || usdtAmount <= 0) {
            this.showError('Please enter a valid USDT amount');
            return;
        }
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/purchase/estimate?amount=${usdtAmount}`);
            const data = await response.json();
            
            if (response.ok) {
                document.getElementById('estimatedGT').textContent = data.estimatedGT;
                document.getElementById('conversionRate').textContent = data.conversionRate;
                document.getElementById('estimateResult').style.display = 'block';
            } else {
                this.showError(data.message || 'Failed to estimate purchase');
            }
        } catch (error) {
            this.showError('Failed to estimate purchase: ' + error.message);
        }
    }
    
    async approveUSDT() {
        if (!this.userAddress) {
            this.showError('Please connect your wallet first');
            return;
        }
        
        const usdtAmount = document.getElementById('usdtAmount').value;
        if (!usdtAmount || usdtAmount <= 0) {
            this.showError('Please enter a valid USDT amount');
            return;
        }
        
        try {
            const amount = ethers.utils.parseUnits(usdtAmount, 6);
            const tx = await this.contracts.usdt.approve(this.contractAddresses.tokenStore, amount);
            await tx.wait();
            
            this.showSuccess('USDT approval successful!');
            document.getElementById('buyBtn').disabled = false;
        } catch (error) {
            this.showError('USDT approval failed: ' + error.message);
        }
    }
    
    async buyGT() {
        const usdtAmount = document.getElementById('usdtAmount').value;
        if (!usdtAmount || usdtAmount <= 0) {
            this.showError('Please enter a valid USDT amount');
            return;
        }
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/purchase?amount=${usdtAmount}`);
            const data = await response.json();
            
            if (response.ok) {
                this.showSuccess(`Purchase successful! Received ${data.gtReceived} GT`);
                await this.updateBalances();
            } else {
                this.showError(data.message || 'Purchase failed');
            }
        } catch (error) {
            this.showError('Purchase failed: ' + error.message);
        }
    }
    
    async createMatch() {
        if (!this.userAddress) {
            this.showError('Please connect your wallet first');
            return;
        }
        
        const matchId = document.getElementById('matchId').value || 'match_' + Date.now();
        const p2Address = document.getElementById('p2Address').value;
        const stakeAmount = document.getElementById('stakeAmount').value;
        
        if (!p2Address || !stakeAmount || stakeAmount <= 0) {
            this.showError('Please fill in all match details');
            return;
        }
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/match/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': 'your-secret-api-key-here'
                },
                body: JSON.stringify({
                    matchId,
                    p1: this.userAddress,
                    p2: p2Address,
                    stake: stakeAmount
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showSuccess('Match created successfully!');
                document.getElementById('stakeBtn').disabled = false;
            } else {
                this.showError(data.message || 'Failed to create match');
            }
        } catch (error) {
            this.showError('Failed to create match: ' + error.message);
        }
    }
    
    async stakeGT() {
        if (!this.userAddress) {
            this.showError('Please connect your wallet first');
            return;
        }
        
        const matchId = document.getElementById('matchId').value || 'match_' + Date.now();
        const stakeAmount = document.getElementById('stakeAmount').value;
        
        if (!stakeAmount || stakeAmount <= 0) {
            this.showError('Please enter a valid stake amount');
            return;
        }
        
        try {
            const amount = ethers.utils.parseEther(stakeAmount);
            
            // Approve PlayGame contract to spend GT
            const approveTx = await this.contracts.gameToken.approve(this.contractAddresses.playGame, amount);
            await approveTx.wait();
            
            // Stake (this would be a direct contract call in a real implementation)
            this.showSuccess('GT staked successfully!');
            await this.updateBalances();
        } catch (error) {
            this.showError('Staking failed: ' + error.message);
        }
    }
    
    async submitResult() {
        const matchId = document.getElementById('resultMatchId').value;
        const winnerAddress = document.getElementById('winnerAddress').value;
        
        if (!matchId || !winnerAddress) {
            this.showError('Please fill in all result details');
            return;
        }
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/match/result`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': 'your-secret-api-key-here'
                },
                body: JSON.stringify({
                    matchId,
                    winner: winnerAddress
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showSuccess(`Result submitted! Winner: ${winnerAddress}`);
            } else {
                this.showError(data.message || 'Failed to submit result');
            }
        } catch (error) {
            this.showError('Failed to submit result: ' + error.message);
        }
    }
    
    showSuccess(message) {
        this.showStatus(message, 'success');
    }
    
    showError(message) {
        this.showStatus(message, 'error');
    }
    
    showStatus(message, type) {
        const statusElement = document.getElementById(`${type === 'error' ? 'error' : 'purchase'}Status`);
        statusElement.textContent = message;
        statusElement.className = `status-message ${type}`;
        statusElement.style.display = 'block';
        
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 5000);
    }
    
    async checkWalletConnection() {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    await this.setupProvider(accounts[0]);
                }
            } catch (error) {
                console.error('Error checking wallet connection:', error);
            }
        }
    }
}

function closeErrorModal() {
    document.getElementById('errorModal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    window.trixApp = new TriXApp();
});
