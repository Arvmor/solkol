import { Logger } from './logger.js';
import { config } from '../config/index.js';

export class TokenBuyTracker {
  constructor(rpcService, instructionDecoder) {
    this.rpcService = rpcService;
    this.instructionDecoder = instructionDecoder;
    this.logger = new Logger(config.logging.level);
    this.targetToken = null;
    this.detectedBuys = [];
    this.maxBuys = 100;
    this.isComplete = false;
  }

  setTargetToken(tokenMint) {
    this.targetToken = tokenMint;
    this.detectedBuys = [];
    this.isComplete = false;
    this.logger.info('Target token set', { tokenMint, maxBuys: this.maxBuys });
  }

  async detectBuysInTransaction(transaction, signature) {
    if (!this.targetToken || this.isComplete) {
      return [];
    }

    try {
      const startTime = Date.now();
      
      // Get token balance changes
      const balanceChanges = await this.rpcService.getTokenBalanceChanges(transaction);
      
      // Check if this transaction involves our target token
      const targetTokenChanges = balanceChanges.filter(change => 
        change.mint === this.targetToken
      );

      if (targetTokenChanges.length === 0) {
        return [];
      }

      // Decode instructions
      const decodedInstructions = this.instructionDecoder.decodeTransaction(transaction);
      
      // Filter for swap instructions
      const swapInstructions = decodedInstructions.filter(inst => inst.isSwapInstruction);
      
      if (swapInstructions.length === 0) {
        return [];
      }

      const buys = [];
      
      // For each swap instruction, check if it's a buy of our target token
      for (const swapInstruction of swapInstructions) {
        const buy = this.analyzeBuy(swapInstruction, balanceChanges, targetTokenChanges, transaction, signature);
        if (buy) {
          buys.push(buy);
        }
      }

      if (config.logging.enablePerformanceLogs && buys.length > 0) {
        const duration = Date.now() - startTime;
        this.logger.logPerformance('DETECT_BUYS', duration, {
          signature,
          buyCount: buys.length,
          instructionCount: decodedInstructions.length,
          balanceChangeCount: balanceChanges.length
        });
      }

      return buys;
    } catch (error) {
      this.logger.error('Error detecting buys in transaction', { 
        signature, 
        error: error.message 
      });
      return [];
    }
  }

  analyzeBuy(swapInstruction, allBalanceChanges, targetTokenChanges, transaction, signature) {
    try {
      // Find target token increases (buys)
      const targetTokenIncreases = targetTokenChanges.filter(change => BigInt(change.delta) > 0);
      
      if (targetTokenIncreases.length === 0) {
        return null; // No buy of target token
      }

      // Find what was sold to buy the target token
      const decreases = allBalanceChanges.filter(change => 
        BigInt(change.delta) < 0 && change.mint !== this.targetToken
      );

      if (decreases.length === 0) {
        return null; // No token was sold
      }

      // Take the largest target token increase as the buy amount
      const targetTokenBuy = targetTokenIncreases.reduce((max, current) => 
        BigInt(current.delta) > BigInt(max.delta) ? current : max
      );

      // Take the largest decrease as what was sold
      const tokenSold = decreases.reduce((max, current) => 
        Math.abs(BigInt(current.delta)) > Math.abs(BigInt(max.delta)) ? current : max
      );

      // Calculate block time from transaction
      const blockTime = transaction.blockTime || Math.floor(Date.now() / 1000);

      const buyData = {
        txHash: signature,
        dex: swapInstruction.dex,
        targetToken: this.targetToken,
        tokenSold: tokenSold.mint,
        amountBought: targetTokenBuy.delta,
        amountSold: Math.abs(BigInt(tokenSold.delta)).toString(),
        decimalsTarget: targetTokenBuy.decimals,
        decimalsSold: tokenSold.decimals,
        timestamp: blockTime,
        instructionType: swapInstruction.decodedData?.type || 'unknown',
        programId: swapInstruction.programId,
        slot: transaction.slot,
        buyNumber: this.detectedBuys.length + 1,
        // Additional metadata
        buyer: this.extractBuyer(transaction, targetTokenBuy.accountIndex),
        pricePerToken: this.calculatePrice(tokenSold, targetTokenBuy),
      };

      // Store the buy
      this.detectedBuys.push(buyData);
      
      // Log the detected buy
      this.logger.info('BUY_DETECTED', buyData);
      
      // Check if we've reached our target
      if (this.detectedBuys.length >= this.maxBuys) {
        this.isComplete = true;
        this.logger.info(`Completed tracking: Found ${this.maxBuys} buys for token ${this.targetToken}`);
      }
      
      return buyData;
    } catch (error) {
      this.logger.error('Error analyzing buy', { 
        signature, 
        dex: swapInstruction.dex,
        error: error.message 
      });
      return null;
    }
  }

  extractBuyer(transaction, targetAccountIndex) {
    try {
      // Try to get the account that received the tokens
      const accounts = transaction.transaction.message.accountKeys || 
                     transaction.transaction.message.staticAccountKeys || [];
      
      if (targetAccountIndex < accounts.length) {
        return accounts[targetAccountIndex].toString();
      }
      
      // Fallback to first signer (usually the buyer)
      if (transaction.transaction.message.accountKeys && transaction.transaction.message.accountKeys.length > 0) {
        return transaction.transaction.message.accountKeys[0].toString();
      }
      
      return 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  calculatePrice(tokenSold, targetTokenBuy) {
    try {
      const amountSold = Math.abs(BigInt(tokenSold.delta));
      const amountBought = BigInt(targetTokenBuy.delta);
      
      if (amountBought === 0n) return '0';
      
      // Calculate price as: amount_sold / amount_bought
      // Adjust for decimals
      const decimalAdjustment = Math.pow(10, targetTokenBuy.decimals - tokenSold.decimals);
      const price = Number(amountSold) / Number(amountBought) * decimalAdjustment;
      
      return price.toFixed(8);
    } catch (error) {
      return '0';
    }
  }

  getDetectedBuys() {
    return this.detectedBuys;
  }

  getBuyCount() {
    return this.detectedBuys.length;
  }

  isTrackingComplete() {
    return this.isComplete;
  }

  getProgress() {
    return {
      current: this.detectedBuys.length,
      target: this.maxBuys,
      percentage: (this.detectedBuys.length / this.maxBuys * 100).toFixed(1),
      isComplete: this.isComplete
    };
  }

  reset() {
    this.detectedBuys = [];
    this.isComplete = false;
    this.targetToken = null;
  }
}