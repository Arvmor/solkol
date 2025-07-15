import { Logger } from './logger.js';
import { config } from '../config/index.js';

export class TokenBuyTracker {
  constructor(rpcService, instructionDecoder) {
    this.rpcService = rpcService;
    this.instructionDecoder = instructionDecoder;
    this.logger = new Logger(config.logging.level);
    this.targetToken = null;
    this.startingBlock = null;
    this.detectedBuys = [];
    this.maxBuys = 100;
    this.isComplete = false;
  }

  setTargetToken(tokenMint, startingBlock = null) {
    this.targetToken = tokenMint;
    this.startingBlock = startingBlock;
    this.detectedBuys = [];
    this.isComplete = false;
    this.logger.info('Target token set', { 
      tokenMint, 
      startingBlock, 
      maxBuys: this.maxBuys 
    });
  }

  async detectBuysInTransaction(transaction, signature) {
    if (!this.targetToken) {
      return [];
    }

    // Skip transactions before our starting block if specified
    if (this.startingBlock && transaction.slot < this.startingBlock) {
      return [];
    }

    // If we've reached max buys, still process transactions but don't add new buys
    const skipAddingBuys = this.detectedBuys.length >= this.maxBuys;

    try {
      const startTime = Date.now();
      
      // Get token balance changes
      const balanceChanges = await this.rpcService.getTokenBalanceChanges(transaction);
      
      // Check if this transaction involves our target token
      const targetTokenChanges = balanceChanges.filter(change => 
        change.mint === this.targetToken
      );

      // Check if this transaction involves our target token
      if (targetTokenChanges.length === 0) {
        return [];
      }

      if (targetTokenChanges.length === 0) {
        return [];
      }

      // Decode instructions
      const decodedInstructions = this.instructionDecoder.decodeTransaction(transaction);
      
      // More permissive: check for any DEX-related instructions, not just strict swap instructions
      const dexInstructions = decodedInstructions.filter(inst => inst.dex);
      
      // Debug logging for DEX instructions
      if (dexInstructions.length > 0) {
        this.logger.debug('Found DEX instructions in transaction', {
          signature: signature.substring(0, 8) + '...',
          dexInstructions: dexInstructions.map(inst => ({
            dex: inst.dex,
            type: inst.decodedData?.type || 'unknown',
            programId: inst.programId
          }))
        });
      }
      
      // If no DEX instructions found, still check if there are token balance changes that look like buys
      if (dexInstructions.length === 0) {
        // Check if this might be a buy even without recognized DEX instructions
        const potentialBuy = this.analyzePotentialBuy(balanceChanges, targetTokenChanges, transaction, signature, skipAddingBuys);
        if (potentialBuy) {
          return [potentialBuy];
        }
        return [];
      }

      const buys = [];
      
      // For each DEX instruction, check if it's a buy of our target token
      for (const dexInstruction of dexInstructions) {
        const buy = this.analyzeBuy(dexInstruction, balanceChanges, targetTokenChanges, transaction, signature, skipAddingBuys);
        if (buy) {
          buys.push(buy);
        }
      }

      // If no buys found from DEX instructions, try the potential buy analysis
      if (buys.length === 0) {
        const potentialBuy = this.analyzePotentialBuy(balanceChanges, targetTokenChanges, transaction, signature, skipAddingBuys);
        if (potentialBuy) {
          buys.push(potentialBuy);
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

  analyzePotentialBuy(allBalanceChanges, targetTokenChanges, transaction, signature, skipAddingBuys) {
    try {
      this.logger.debug('Starting potential buy analysis', {
        signature: signature.substring(0, 8) + '...',
        targetTokenChangesCount: targetTokenChanges.length,
        allBalanceChangesCount: allBalanceChanges.length
      });

      // Find target token increases (buys)
      const targetTokenIncreases = targetTokenChanges.filter(change => {
        try {
          return BigInt(change.delta) > 0;
        } catch (error) {
          this.logger.error('Error converting delta to BigInt', { 
            delta: change.delta, 
            error: error.message 
          });
          return false;
        }
      });
      
      if (targetTokenIncreases.length === 0) {
        this.logger.debug('No target token increases found', {
          signature: signature.substring(0, 8) + '...',
          targetTokenChanges: targetTokenChanges.map(change => ({
            delta: change.delta,
            accountIndex: change.accountIndex
          }))
        });
        return null; // No buy of target token
      }

      // Find what was sold to buy the target token
      const decreases = allBalanceChanges.filter(change => {
        try {
          return BigInt(change.delta) < 0 && change.mint !== this.targetToken;
        } catch (error) {
          this.logger.error('Error converting delta to BigInt in decreases filter', { 
            delta: change.delta, 
            mint: change.mint,
            error: error.message 
          });
          return false;
        }
      });

      if (decreases.length === 0) {
        this.logger.debug('No token decreases found', {
          signature: signature.substring(0, 8) + '...',
          allBalanceChanges: allBalanceChanges.map(change => ({
            mint: change.mint,
            delta: change.delta,
            accountIndex: change.accountIndex
          }))
        });
        return null; // No token was sold
      }

      // Take the largest target token increase as the buy amount
      const targetTokenBuy = targetTokenIncreases.reduce((max, current) => {
        try {
          return BigInt(current.delta) > BigInt(max.delta) ? current : max;
        } catch (error) {
          this.logger.error('Error in targetTokenBuy reduce', { 
            currentDelta: current.delta, 
            maxDelta: max.delta,
            error: error.message 
          });
          return max; // Return the existing max if there's an error
        }
      });

      // Take the largest decrease as what was sold
      const tokenSold = decreases.reduce((max, current) => {
        try {
          return Math.abs(BigInt(current.delta)) > Math.abs(BigInt(max.delta)) ? current : max;
        } catch (error) {
          this.logger.error('Error in tokenSold reduce', { 
            currentDelta: current.delta, 
            maxDelta: max.delta,
            error: error.message 
          });
          return max; // Return the existing max if there's an error
        }
      });

      // Calculate block time from transaction
      const blockTime = transaction.blockTime || Math.floor(Date.now() / 1000);

      this.logger.debug('Creating buy data', {
        signature: signature.substring(0, 8) + '...',
        targetTokenBuyDelta: targetTokenBuy.delta,
        tokenSoldDelta: tokenSold.delta,
        targetTokenBuyDecimals: targetTokenBuy.decimals,
        tokenSoldDecimals: tokenSold.decimals
      });

      const buyData = {
        txHash: signature,
        dex: 'Unknown', // Couldn't identify specific DEX
        targetToken: this.targetToken,
        tokenSold: tokenSold.mint,
        amountBought: targetTokenBuy.delta,
        amountSold: (() => {
          try {
            return Math.abs(BigInt(tokenSold.delta)).toString();
          } catch (error) {
            this.logger.error('Error converting amountSold to string', { 
              delta: tokenSold.delta, 
              error: error.message 
            });
            return '0';
          }
        })(),
        decimalsTarget: targetTokenBuy.decimals,
        decimalsSold: tokenSold.decimals,
        timestamp: blockTime,
        instructionType: 'potential_buy',
        programId: 'unknown',
        slot: transaction.slot,
        buyNumber: this.detectedBuys.length + 1,
        buyer: this.extractBuyer(transaction, targetTokenBuy.accountIndex),
        pricePerToken: this.calculatePrice(tokenSold, targetTokenBuy),
        confidence: 'medium', // Indicate this is a potential buy, not confirmed DEX buy
      };

      // Store the buy (only if we haven't reached the limit)
      if (!skipAddingBuys) {
        this.detectedBuys.push(buyData);
        
        // Log the detected buy
        this.logger.info('POTENTIAL_BUY_DETECTED', buyData);
        
        // Check if we've reached our target, but don't stop scanning historical blocks
        if (this.detectedBuys.length >= this.maxBuys) {
          this.logger.info(`Reached max buys limit (${this.maxBuys}) for token ${this.targetToken}. Continuing scan but not adding more buys.`);
          // Don't set isComplete to true here - let the historical scan finish
        }
      } else {
        // Log that we found a potential buy but skipped adding it due to limit
        this.logger.debug('POTENTIAL_BUY_SKIPPED_DUE_TO_LIMIT', {
          ...buyData,
          reason: 'Max buys limit reached'
        });
      }
      
      return buyData;
    } catch (error) {
      this.logger.error('Error analyzing potential buy', { 
        signature, 
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  analyzeBuy(swapInstruction, allBalanceChanges, targetTokenChanges, transaction, signature, skipAddingBuys) {
    try {
      // Find target token increases (buys)
      const targetTokenIncreases = targetTokenChanges.filter(change => {
        try {
          return BigInt(change.delta) > 0;
        } catch (error) {
          this.logger.error('Error converting delta to BigInt in analyzeBuy', { 
            delta: change.delta, 
            error: error.message 
          });
          return false;
        }
      });
      
      if (targetTokenIncreases.length === 0) {
        return null; // No buy of target token
      }

      // Find what was sold to buy the target token
      const decreases = allBalanceChanges.filter(change => {
        try {
          return BigInt(change.delta) < 0 && change.mint !== this.targetToken;
        } catch (error) {
          this.logger.error('Error converting delta to BigInt in decreases filter (analyzeBuy)', { 
            delta: change.delta, 
            mint: change.mint,
            error: error.message 
          });
          return false;
        }
      });

      if (decreases.length === 0) {
        return null; // No token was sold
      }

      // Take the largest target token increase as the buy amount
      const targetTokenBuy = targetTokenIncreases.reduce((max, current) => {
        try {
          return BigInt(current.delta) > BigInt(max.delta) ? current : max;
        } catch (error) {
          this.logger.error('Error in targetTokenBuy reduce (analyzeBuy)', { 
            currentDelta: current.delta, 
            maxDelta: max.delta,
            error: error.message 
          });
          return max; // Return the existing max if there's an error
        }
      });

      // Take the largest decrease as what was sold
      const tokenSold = decreases.reduce((max, current) => {
        try {
          return Math.abs(BigInt(current.delta)) > Math.abs(BigInt(max.delta)) ? current : max;
        } catch (error) {
          this.logger.error('Error in tokenSold reduce (analyzeBuy)', { 
            currentDelta: current.delta, 
            maxDelta: max.delta,
            error: error.message 
          });
          return max; // Return the existing max if there's an error
        }
      });

      // Calculate block time from transaction
      const blockTime = transaction.blockTime || Math.floor(Date.now() / 1000);

      const buyData = {
        txHash: signature,
        dex: swapInstruction.dex,
        targetToken: this.targetToken,
        tokenSold: tokenSold.mint,
        amountBought: targetTokenBuy.delta,
        amountSold: (() => {
          try {
            return Math.abs(BigInt(tokenSold.delta)).toString();
          } catch (error) {
            this.logger.error('Error converting amountSold to string (analyzeBuy)', { 
              delta: tokenSold.delta, 
              error: error.message 
            });
            return '0';
          }
        })(),
        decimalsTarget: targetTokenBuy.decimals,
        decimalsSold: tokenSold.decimals,
        timestamp: blockTime,
        instructionType: swapInstruction.decodedData?.type || 'unknown',
        programId: swapInstruction.programId,
        slot: transaction.slot,
        buyNumber: this.detectedBuys.length + 1,
        buyer: this.extractBuyer(transaction, targetTokenBuy.accountIndex),
        pricePerToken: this.calculatePrice(tokenSold, targetTokenBuy),
        confidence: 'high', // Confirmed DEX buy
      };

      // Store the buy (only if we haven't reached the limit)
      if (!skipAddingBuys) {
        this.detectedBuys.push(buyData);
        
        // Log the detected buy
        this.logger.info('BUY_DETECTED', buyData);
        
        // Check if we've reached our target, but don't stop scanning historical blocks
        if (this.detectedBuys.length >= this.maxBuys) {
          this.logger.info(`Reached max buys limit (${this.maxBuys}) for token ${this.targetToken}. Continuing scan but not adding more buys.`);
          // Don't set isComplete to true here - let the historical scan finish
        }
      } else {
        // Log that we found a buy but skipped adding it due to limit
        this.logger.debug('BUY_SKIPPED_DUE_TO_LIMIT', {
          ...buyData,
          reason: 'Max buys limit reached'
        });
      }
      
      return buyData;
    } catch (error) {
      this.logger.error('Error analyzing buy', { 
        signature, 
        dex: swapInstruction.dex,
        error: error.message,
        stack: error.stack
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
      
      // Convert BigInt to string, then to number for calculation
      const amountSoldNum = Number(amountSold.toString());
      const amountBoughtNum = Number(amountBought.toString());
      
      const price = amountSoldNum / amountBoughtNum * decimalAdjustment;
      
      return price.toFixed(8);
    } catch (error) {
      this.logger.error('Error calculating price', { 
        tokenSold: tokenSold.delta, 
        targetTokenBuy: targetTokenBuy.delta,
        error: error.message 
      });
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
    // Only return true if explicitly set to complete, not just because we reached max buys
    // This allows historical scanning to continue even after finding max buys
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

  markComplete() {
    this.isComplete = true;
    this.logger.info('Tracking marked as complete', { 
      targetToken: this.targetToken,
      totalBuys: this.detectedBuys.length 
    });
  }
}