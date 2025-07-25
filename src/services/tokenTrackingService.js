import { SolanaRPCService } from './rpcService.js';
import { InstructionDecoder } from './instructionDecoder.js';
import { TokenBuyTracker } from './tokenBuyTracker.js';
import { Logger } from './logger.js';
import { config } from '../config/index.js';
import { isValidTokenMint } from '../utils/validation.js';
import { setupGracefulShutdown } from '../utils/shutdown.js';

export class TokenTrackingService {
  constructor() {
    this.logger = new Logger(config.logging.level);
    this.rpcService = new SolanaRPCService();
    this.instructionDecoder = new InstructionDecoder();
    this.buyTracker = new TokenBuyTracker(this.rpcService, this.instructionDecoder);
    
    this.stats = {
      totalBlocks: 0,
      totalTransactions: 0,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
    };

    this.isRunning = false;
  }

  async start(targetToken, startingBlock = null) {
    this.logger.info('Starting Token Buy Tracking Service', { targetToken, startingBlock });
    
    // Validate token mint address
    if (!isValidTokenMint(targetToken)) {
      this.logger.error('Invalid token mint address', { targetToken });
      return false;
    }

    // Set target token
    this.buyTracker.setTargetToken(targetToken, startingBlock);
    
    // Initialize RPC service
    const initialized = await this.rpcService.initialize();
    if (!initialized) {
      this.logger.error('Failed to initialize RPC service');
      return false;
    }

    this.isRunning = true;
    this.stats.startTime = Date.now();

    // Start periodic progress logging
    this.startProgressLogging();

    // Start processing blocks
    await this.rpcService.startSlotPolling(this.onNewBlock.bind(this), startingBlock);
    
    return true;
  }



  async onNewBlock(block, slot) {
    // Skip blocks before our starting block if specified
    if (this.buyTracker.startingBlock && slot < this.buyTracker.startingBlock) {
      return;
    }

    // If we have a starting block and we're now processing blocks newer than our starting block,
    // and we've found enough buys, mark tracking as complete
    if (this.buyTracker.startingBlock && slot > this.buyTracker.startingBlock && this.buyTracker.getBuyCount() >= this.buyTracker.maxBuys) {
      this.logger.info('Historical scan complete and max buys reached, marking tracking as complete');
      this.buyTracker.markComplete();
    }

    if (this.buyTracker.isTrackingComplete()) {
      this.logger.info('Tracking complete, stopping service');
      this.stop();
      return;
    }

    try {
      this.stats.totalBlocks++;
      this.stats.totalTransactions += block.transactions.length;
      this.stats.lastUpdateTime = Date.now();

      const blockStartTime = Date.now();
      let buyCount = 0;
      let transactionsWithTargetToken = 0;

      // Process each transaction in the block
      for (const transaction of block.transactions) {
        if (transaction.meta && !transaction.meta.err) {
          // Only process successful transactions
          const signature = transaction.transaction.signatures[0];
          
          // Check if transaction involves target token before processing
          const balanceChanges = await this.rpcService.getTokenBalanceChanges(transaction);
          const targetTokenChanges = balanceChanges.filter(change => 
            change.mint === this.buyTracker.targetToken
          );
          
          if (targetTokenChanges.length > 0) {
            transactionsWithTargetToken++;
          }
          
          const buys = await this.buyTracker.detectBuysInTransaction(transaction, signature);
          buyCount += buys.length;
        }
      }

      // Log block summary
      if (transactionsWithTargetToken > 0) {
        this.logger.info('Block processed', {
          slot,
          totalTransactions: block.transactions.length,
          transactionsWithTargetToken,
          transactionsFound: buyCount,
          progress: this.buyTracker.getProgress()
        });
      }

      if (config.logging.enablePerformanceLogs && buyCount > 0) {
        const blockDuration = Date.now() - blockStartTime;
        this.logger.logPerformance('PROCESS_BLOCK', blockDuration, {
          slot,
          transactionCount: block.transactions.length,
          transactionCount: buyCount,
          progress: this.buyTracker.getProgress()
        });
      }

      if (buyCount > 0) {
        const progress = this.buyTracker.getProgress();
        this.logger.info(`Block ${slot}: Found ${buyCount} transactions with target token. Progress: ${progress.current}/${progress.target} (${progress.percentage}%)`);
      }

    } catch (error) {
      this.logger.error('Error processing block', { slot, error: error.message });
    }
  }

  startProgressLogging() {
    const progressInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(progressInterval);
        return;
      }

      const progress = this.buyTracker.getProgress();
      const runtime = Date.now() - this.stats.startTime;
      const runtimeMinutes = runtime / (1000 * 60);
      
      this.logger.info('TRACKING_PROGRESS', {
        target_token: this.buyTracker.targetToken,
        transactions_found: progress.current,
        target_transactions: progress.target,
        progress_percentage: progress.percentage,
        runtime_minutes: runtimeMinutes.toFixed(2),
        blocks_processed: this.stats.totalBlocks,
        transactions_processed: this.stats.totalTransactions,
        is_complete: progress.isComplete
      });

      if (progress.isComplete) {
        clearInterval(progressInterval);
        this.displayResults();
      }
    }, 30000); // Log progress every 30 seconds
  }

  displayResults() {
    const buys = this.buyTracker.getDetectedBuys();
    
    this.logger.info('TRACKING_COMPLETED', {
      target_token: this.buyTracker.targetToken,
      total_transactions_found: buys.length,
      first_transaction: buys[0] || null,
      last_transaction: buys[buys.length - 1] || null,
      unique_dexes: [...new Set(buys.map(buy => buy.dex))],
      unique_buyers: [...new Set(buys.map(buy => buy.buyer))].length,
      time_range: {
        first_transaction_timestamp: buys[0]?.timestamp,
        last_transaction_timestamp: buys[buys.length - 1]?.timestamp
      }
    });

    // Log all transactions in a summary format
    this.logger.info('ALL_TRANSACTIONS_SUMMARY', {
      target_token: this.buyTracker.targetToken,
      transactions: buys.map(buy => ({
        transaction_number: buy.buyNumber,
        tx_hash: buy.txHash,
        dex: buy.dex,
        amount_bought: buy.amountBought,
        amount_sold: buy.amountSold,
        price_per_token: buy.pricePerToken,
        timestamp: buy.timestamp,
        buyer: buy.buyer
      }))
    });
  }

  stop() {
    this.logger.info('Stopping Token Tracking Service');
    this.isRunning = false;
    this.rpcService.stop();
  }

  getStats() {
    return {
      ...this.stats,
      runtime_ms: Date.now() - this.stats.startTime,
      progress: this.buyTracker.getProgress(),
      recent_transactions: this.buyTracker.getDetectedBuys().slice(-5), // Last 5 transactions
    };
  }

  // Graceful shutdown
  setupGracefulShutdown() {
    setupGracefulShutdown(this, this.logger, () => {
      if (this.buyTracker.getBuyCount() > 0) {
        this.displayResults();
      }
    });
  }
}