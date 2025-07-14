import { Logger } from './logger.js';
import { config } from '../config/index.js';

export class SwapDetector {
  constructor(rpcService, instructionDecoder) {
    this.rpcService = rpcService;
    this.instructionDecoder = instructionDecoder;
    this.logger = new Logger(config.logging.level);
    this.detectedSwaps = [];
  }

  async detectSwapsInTransaction(transaction, signature) {
    try {
      const startTime = Date.now();
      
      // Get token balance changes
      const balanceChanges = await this.rpcService.getTokenBalanceChanges(transaction);
      
      // Decode instructions
      const decodedInstructions = this.instructionDecoder.decodeTransaction(transaction);
      
      // Filter for swap instructions
      const swapInstructions = decodedInstructions.filter(inst => inst.isSwapInstruction);
      
      if (swapInstructions.length === 0 || balanceChanges.length < 2) {
        return [];
      }

      const swaps = [];
      
      // For each swap instruction, try to match with balance changes
      for (const swapInstruction of swapInstructions) {
        const swap = this.analyzeSwap(swapInstruction, balanceChanges, transaction, signature);
        if (swap) {
          swaps.push(swap);
        }
      }

      if (config.logging.enablePerformanceLogs) {
        const duration = Date.now() - startTime;
        this.logger.logPerformance('DETECT_SWAPS', duration, {
          signature,
          swapCount: swaps.length,
          instructionCount: decodedInstructions.length,
          balanceChangeCount: balanceChanges.length
        });
      }

      return swaps;
    } catch (error) {
      this.logger.error('Error detecting swaps in transaction', { 
        signature, 
        error: error.message 
      });
      return [];
    }
  }

  analyzeSwap(swapInstruction, balanceChanges, transaction, signature) {
    try {
      // Find significant balance changes (non-dust amounts)
      const significantChanges = balanceChanges.filter(change => {
        const absDelta = Math.abs(BigInt(change.delta));
        return absDelta > 1000n; // Filter out dust (adjust threshold as needed)
      });

      if (significantChanges.length < 2) {
        return null;
      }

      // Separate increases and decreases
      const decreases = significantChanges.filter(change => BigInt(change.delta) < 0);
      const increases = significantChanges.filter(change => BigInt(change.delta) > 0);

      if (decreases.length === 0 || increases.length === 0) {
        return null;
      }

      // For simplicity, take the largest decrease as input and largest increase as output
      const tokenIn = decreases.reduce((max, current) => 
        Math.abs(BigInt(current.delta)) > Math.abs(BigInt(max.delta)) ? current : max
      );

      const tokenOut = increases.reduce((max, current) => 
        BigInt(current.delta) > BigInt(max.delta) ? current : max
      );

      // Calculate block time from transaction
      const blockTime = transaction.blockTime || Math.floor(Date.now() / 1000);

      const swapData = {
        txHash: signature,
        dex: swapInstruction.dex,
        tokenIn: tokenIn.mint,
        tokenOut: tokenOut.mint,
        amountIn: Math.abs(BigInt(tokenIn.delta)).toString(),
        amountOut: tokenOut.delta,
        decimalsIn: tokenIn.decimals,
        decimalsOut: tokenOut.decimals,
        timestamp: blockTime,
        instructionType: swapInstruction.decodedData?.type || 'unknown',
        programId: swapInstruction.programId,
        slot: transaction.slot,
        // Additional metadata
        allBalanceChanges: significantChanges,
        accountsInvolved: swapInstruction.accounts.length,
      };

      // Store in memory for MVP
      this.detectedSwaps.push(swapData);
      
      // Log the detected swap
      this.logger.logSwap(swapData);
      
      return swapData;
    } catch (error) {
      this.logger.error('Error analyzing swap', { 
        signature, 
        dex: swapInstruction.dex,
        error: error.message 
      });
      return null;
    }
  }

  getDetectedSwaps() {
    return this.detectedSwaps;
  }

  getSwapCount() {
    return this.detectedSwaps.length;
  }

  getSwapsByDex() {
    const swapsByDex = {};
    this.detectedSwaps.forEach(swap => {
      if (!swapsByDex[swap.dex]) {
        swapsByDex[swap.dex] = 0;
      }
      swapsByDex[swap.dex]++;
    });
    return swapsByDex;
  }

  clearOldSwaps(maxAge = 3600000) { // 1 hour default
    const cutoff = Date.now() - maxAge;
    const initialCount = this.detectedSwaps.length;
    
    this.detectedSwaps = this.detectedSwaps.filter(swap => 
      swap.timestamp * 1000 > cutoff
    );
    
    const removedCount = initialCount - this.detectedSwaps.length;
    if (removedCount > 0) {
      this.logger.info(`Cleared ${removedCount} old swap records`);
    }
  }
}