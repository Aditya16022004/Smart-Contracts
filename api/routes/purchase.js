const express = require('express');
const { ethers } = require('ethers');
const router = express.Router();

// Get contracts from server
let contracts;

// Initialize contracts reference
function setContracts(contractsInstance) {
  contracts = contractsInstance;
}

// GET /purchase?amount=<usdtAmount>
router.get('/', async (req, res) => {
  try {
    const { amount } = req.query;
    
    if (!amount) {
      return res.status(400).json({
        error: 'Missing amount parameter',
        message: 'Please provide USDT amount as query parameter'
      });
    }
    
    const usdtAmount = ethers.utils.parseUnits(amount, 6); // USDT has 6 decimals
    
    if (usdtAmount.lte(0)) {
      return res.status(400).json({
        error: 'Invalid amount',
        message: 'Amount must be greater than 0'
      });
    }
    
    // Get current conversion rate
    const gtPerUsdt = await contracts.tokenStore.gtPerUsdt();
    const expectedGT = usdtAmount.mul(gtPerUsdt).div(ethers.utils.parseUnits("1", 6));
    
    console.log(`Purchase request: ${ethers.utils.formatUnits(usdtAmount, 6)} USDT for ${ethers.utils.formatEther(expectedGT)} GT`);
    
    // Execute the purchase transaction
    const tx = await contracts.tokenStore.buy(usdtAmount);
    
    console.log(`Transaction sent: ${tx.hash}`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    // Parse events to get actual GT received
    const purchaseEvent = receipt.events?.find(event => event.event === 'Purchase');
    const actualGT = purchaseEvent ? purchaseEvent.args.gtOut : expectedGT;
    
    res.json({
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      usdtAmount: ethers.utils.formatUnits(usdtAmount, 6),
      gtReceived: ethers.utils.formatEther(actualGT),
      conversionRate: ethers.utils.formatEther(gtPerUsdt),
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: ethers.utils.formatUnits(receipt.gasPrice, 'gwei') + ' gwei'
    });
    
  } catch (error) {
    console.error('Purchase error:', error);
    
    // Handle specific error cases
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return res.status(400).json({
        error: 'Insufficient funds',
        message: 'Backend wallet does not have enough ETH for gas fees'
      });
    }
    
    if (error.message.includes('USDT transfer failed')) {
      return res.status(400).json({
        error: 'USDT transfer failed',
        message: 'Make sure you have approved the TokenStore contract to spend your USDT'
      });
    }
    
    if (error.message.includes('GT output must be greater than 0')) {
      return res.status(400).json({
        error: 'Invalid conversion',
        message: 'The conversion rate would result in 0 GT tokens'
      });
    }
    
    res.status(500).json({
      error: 'Purchase failed',
      message: error.message
    });
  }
});

// GET /purchase/rate - Get current conversion rate
router.get('/rate', async (req, res) => {
  try {
    const gtPerUsdt = await contracts.tokenStore.gtPerUsdt();
    
    res.json({
      gtPerUsdt: ethers.utils.formatEther(gtPerUsdt),
      description: `${ethers.utils.formatEther(gtPerUsdt)} GT per 1 USDT`
    });
    
  } catch (error) {
    console.error('Rate query error:', error);
    res.status(500).json({
      error: 'Failed to get conversion rate',
      message: error.message
    });
  }
});

// GET /purchase/estimate?amount=<usdtAmount> - Estimate GT output
router.get('/estimate', async (req, res) => {
  try {
    const { amount } = req.query;
    
    if (!amount) {
      return res.status(400).json({
        error: 'Missing amount parameter',
        message: 'Please provide USDT amount as query parameter'
      });
    }
    
    const usdtAmount = ethers.utils.parseUnits(amount, 6);
    
    if (usdtAmount.lte(0)) {
      return res.status(400).json({
        error: 'Invalid amount',
        message: 'Amount must be greater than 0'
      });
    }
    
    const gtPerUsdt = await contracts.tokenStore.gtPerUsdt();
    const estimatedGT = usdtAmount.mul(gtPerUsdt).div(ethers.utils.parseUnits("1", 6));
    
    res.json({
      usdtAmount: ethers.utils.formatUnits(usdtAmount, 6),
      estimatedGT: ethers.utils.formatEther(estimatedGT),
      conversionRate: ethers.utils.formatEther(gtPerUsdt),
      note: 'This is an estimate. Actual amount may vary slightly due to rounding.'
    });
    
  } catch (error) {
    console.error('Estimate error:', error);
    res.status(500).json({
      error: 'Failed to estimate conversion',
      message: error.message
    });
  }
});

module.exports = { router, setContracts };
