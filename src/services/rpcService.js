import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config/index.js';
import { Logger } from './logger.js';

export class SolanaRPCService {
  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, {
      commitment: config.solana.commitment,
      confirmTransactionInitialTimeout: 60000,
    });
    this.logger = new Logger(config.logging.level);
    this.currentSlot = null;
    this.isRunning = false;
    this.retryCount = 0;
  }

  async initialize() {
    try {
      this.currentSlot = await this.connection.getSlot();
      this.logger.info('RPC Service initialized', { 
        currentSlot: this.currentSlot,
        rpcUrl: config.solana.rpcUrl 
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize RPC service', { error: error.message });
      return false;
    }
  }

  async startSlotPolling(onNewBlock) {
    this.isRunning = true;
    this.logger.info('Starting slot polling');

    while (this.isRunning) {
      try {
        const startTime = Date.now();
        const latestSlot = await this.connection.getSlot();
        
        if (latestSlot > this.currentSlot) {
          // Process all slots between current and latest
          for (let slot = this.currentSlot + 1; slot <= latestSlot; slot++) {
            await this.processSlot(slot, onNewBlock);
          }
          this.currentSlot = latestSlot;
        }

        if (config.logging.enablePerformanceLogs) {
          const duration = Date.now() - startTime;
          this.logger.logPerformance('SLOT_POLL', duration, { latestSlot });
        }

        this.retryCount = 0; // Reset retry count on success
        await this.sleep(config.solana.slotPollInterval);

      } catch (error) {
        this.logger.error('Error in slot polling', { error: error.message });
        await this.handleRetry();
      }
    }
  }

  async processSlot(slot, onNewBlock) {
    try {
      const startTime = Date.now();
      const block = await this.connection.getBlock(slot, {
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'full',
      });

      if (block && block.transactions) {
        await onNewBlock(block, slot);
        
        if (config.logging.enablePerformanceLogs) {
          const duration = Date.now() - startTime;
          this.logger.logPerformance('PROCESS_SLOT', duration, {
            slot,
            transactionCount: block.transactions.length
          });
        }
      }
    } catch (error) {
      this.logger.error('Error processing slot', { slot, error: error.message });
    }
  }

  async handleRetry() {
    this.retryCount++;
    if (this.retryCount >= config.solana.maxRetries) {
      this.logger.error('Max retries reached, stopping service');
      this.stop();
      return;
    }

    const delay = config.solana.retryDelay * Math.pow(2, this.retryCount - 1);
    this.logger.warn(`Retrying in ${delay}ms (attempt ${this.retryCount}/${config.solana.maxRetries})`);
    await this.sleep(delay);
  }

  stop() {
    this.isRunning = false;
    this.logger.info('RPC Service stopped');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getTokenBalanceChanges(transaction) {
    if (!transaction.meta || !transaction.meta.preTokenBalances || !transaction.meta.postTokenBalances) {
      return [];
    }

    const changes = [];
    const preBalances = transaction.meta.preTokenBalances;
    const postBalances = transaction.meta.postTokenBalances;

    // Create maps for easier lookup
    const preBalanceMap = new Map();
    const postBalanceMap = new Map();

    preBalances.forEach(balance => {
      const key = `${balance.accountIndex}-${balance.mint}`;
      preBalanceMap.set(key, balance);
    });

    postBalances.forEach(balance => {
      const key = `${balance.accountIndex}-${balance.mint}`;
      postBalanceMap.set(key, balance);
    });

    // Find changes
    for (const [key, postBalance] of postBalanceMap) {
      const preBalance = preBalanceMap.get(key) || { uiTokenAmount: { amount: '0' } };
      const preAmount = BigInt(preBalance.uiTokenAmount.amount);
      const postAmount = BigInt(postBalance.uiTokenAmount.amount);
      const delta = postAmount - preAmount;

      if (delta !== 0n) {
        changes.push({
          mint: postBalance.mint,
          accountIndex: postBalance.accountIndex,
          preAmount: preAmount.toString(),
          postAmount: postAmount.toString(),
          delta: delta.toString(),
          decimals: postBalance.uiTokenAmount.decimals,
        });
      }
    }

    return changes;
  }
}