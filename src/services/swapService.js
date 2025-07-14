import { SolanaRPCService } from './rpcService.js';
import { InstructionDecoder } from './instructionDecoder.js';
import { SwapDetector } from './swapDetector.js';
import { Logger } from './logger.js';
import { config } from '../config/index.js';

export class SwapDetectionService {
  constructor() {
    this.logger = new Logger(config.logging.level);
    this.rpcService = new SolanaRPCService();
    this.instructionDecoder = new InstructionDecoder();
    this.swapDetector = new SwapDetector(this.rpcService, this.instructionDecoder);
    
    this.stats = {
      totalBlocks: 0,
      totalTransactions: 0,
      totalSwaps: 0,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
    };

    this.isRunning = false;
  }

  async start() {
    this.logger.info('Starting Solana Swap Detection Service');
    
    // Initialize RPC service
    const initialized = await this.rpcService.initialize();
    if (!initialized) {
      this.logger.error('Failed to initialize RPC service');
      return false;
    }

    this.isRunning = true;
    this.stats.startTime = Date.now();

    // Start periodic stats logging
    this.startStatsLogging();

    // Start periodic cleanup
    this.startPeriodicCleanup();

    // Start processing blocks
    await this.rpcService.startSlotPolling(this.onNewBlock.bind(this));
    
    return true;
  }

  async onNewBlock(block, slot) {
    try {
      this.stats.totalBlocks++;
      this.stats.totalTransactions += block.transactions.length;
      this.stats.lastUpdateTime = Date.now();

      const blockStartTime = Date.now();
      let swapCount = 0;

      // Process each transaction in the block
      for (const transaction of block.transactions) {
        if (transaction.meta && !transaction.meta.err) {
          // Only process successful transactions
          const signature = transaction.transaction.signatures[0];
          const swaps = await this.swapDetector.detectSwapsInTransaction(transaction, signature);
          swapCount += swaps.length;
          this.stats.totalSwaps += swaps.length;
        }
      }

      if (config.logging.enablePerformanceLogs && swapCount > 0) {
        const blockDuration = Date.now() - blockStartTime;
        this.logger.logPerformance('PROCESS_BLOCK', blockDuration, {
          slot,
          transactionCount: block.transactions.length,
          swapCount,
          swapsPerSecond: swapCount / (blockDuration / 1000)
        });
      }

      if (swapCount > 0) {
        this.logger.info(`Block ${slot}: Found ${swapCount} swaps in ${block.transactions.length} transactions`);
      }

    } catch (error) {
      this.logger.error('Error processing block', { slot, error: error.message });
    }
  }

  startStatsLogging() {
    setInterval(() => {
      if (!this.isRunning) return;

      const runtime = Date.now() - this.stats.startTime;
      const runtimeHours = runtime / (1000 * 60 * 60);
      
      const swapsByDex = this.swapDetector.getSwapsByDex();
      
      this.logger.info('SERVICE_STATS', {
        runtime_hours: runtimeHours.toFixed(2),
        total_blocks: this.stats.totalBlocks,
        total_transactions: this.stats.totalTransactions,
        total_swaps: this.stats.totalSwaps,
        swaps_per_hour: (this.stats.totalSwaps / runtimeHours).toFixed(2),
        transactions_per_hour: (this.stats.totalTransactions / runtimeHours).toFixed(0),
        swaps_by_dex: swapsByDex,
        memory_usage_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
      });
    }, 60000); // Log stats every minute
  }

  startPeriodicCleanup() {
    setInterval(() => {
      if (!this.isRunning) return;
      this.swapDetector.clearOldSwaps();
    }, 300000); // Clean up every 5 minutes
  }

  stop() {
    this.logger.info('Stopping Swap Detection Service');
    this.isRunning = false;
    this.rpcService.stop();
  }

  getStats() {
    return {
      ...this.stats,
      runtime_ms: Date.now() - this.stats.startTime,
      swaps_by_dex: this.swapDetector.getSwapsByDex(),
      recent_swaps: this.swapDetector.getDetectedSwaps().slice(-10), // Last 10 swaps
    };
  }

  // Graceful shutdown
  setupGracefulShutdown() {
    const shutdown = () => {
      this.logger.info('Received shutdown signal, stopping service...');
      this.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      shutdown();
    });
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection', { reason, promise });
    });
  }
}