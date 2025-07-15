import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config/index.js';
import { Logger } from './logger.js';

export class SolanaRPCService {
  constructor() {
    this.logger = new Logger(config.logging.level);
    this.currentSlot = null;
    this.isRunning = false;
    this.retryCount = 0;
    this.rateLimitDelay = config.solana.requestDelay;
    this.lastRequestTime = 0;
    this.requestCount = 0;
    this.requestWindowStart = Date.now();
    this.consecutiveRateLimitErrors = 0;
    
    // Fallback RPC endpoints
    this.rpcEndpoints = [
      config.solana.rpcUrl,
      'https://solana-api.projectserum.com',
      'https://rpc.ankr.com/solana',
      'https://mainnet.rpcpool.com',
    ];
    this.currentRpcIndex = 0;
    
    this.connection = new Connection(this.rpcEndpoints[this.currentRpcIndex], {
      commitment: config.solana.commitment,
      confirmTransactionInitialTimeout: 60000,
    });
  }

  switchRpcEndpoint() {
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcEndpoints.length;
    const newEndpoint = this.rpcEndpoints[this.currentRpcIndex];
    
    this.logger.warn('Switching RPC endpoint due to rate limiting', {
      newEndpoint,
      endpointIndex: this.currentRpcIndex,
      totalEndpoints: this.rpcEndpoints.length
    });
    
    this.connection = new Connection(newEndpoint, {
      commitment: config.solana.commitment,
      confirmTransactionInitialTimeout: 60000,
    });
    
    // Reset rate limiting state for new endpoint
    this.rateLimitDelay = config.solana.requestDelay;
    this.consecutiveRateLimitErrors = 0;
    this.requestCount = 0;
    this.requestWindowStart = Date.now();
  }

  async initialize() {
    try {
      await this.throttleRequest();
      this.currentSlot = await this.connection.getSlot();
      this.logger.info('RPC Service initialized', { 
        currentSlot: this.currentSlot,
        rpcUrl: this.rpcEndpoints[this.currentRpcIndex],
        rateLimitSettings: {
          maxRequestsPerSecond: config.solana.maxRequestsPerSecond,
          requestDelay: config.solana.requestDelay,
          slotPollInterval: config.solana.slotPollInterval
        }
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize RPC service', { error: error.message });
      return false;
    }
  }

  async throttleRequest() {
    const now = Date.now();
    
    // Reset request count if window has passed
    if (now - this.requestWindowStart >= 1000) {
      this.requestCount = 0;
      this.requestWindowStart = now;
    }
    
    // Check if we're within rate limits
    if (this.requestCount >= config.solana.maxRequestsPerSecond) {
      const waitTime = 1000 - (now - this.requestWindowStart);
      if (waitTime > 0) {
        this.logger.debug('Rate limit reached, waiting', { waitTime, requestCount: this.requestCount });
        await this.sleep(waitTime);
        return this.throttleRequest(); // Recursive call after waiting
      }
    }
    
    // Ensure minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await this.sleep(waitTime);
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  async startSlotPolling(onNewBlock, startingBlock = null) {
    this.isRunning = true;
    this.logger.info('Starting slot polling with historical block scanning', { startingBlock });

    // If starting block is specified, start from there instead of current slot
    if (startingBlock && startingBlock < this.currentSlot) {
      this.logger.info('Starting historical block scan', { 
        startingBlock, 
        currentSlot: this.currentSlot,
        blocksToScan: this.currentSlot - startingBlock 
      });
      
      // Scan historical blocks first
      await this.scanHistoricalBlocks(startingBlock, this.currentSlot, onNewBlock);
    }

    // Continue with normal slot polling for new blocks
    while (this.isRunning) {
      try {
        const startTime = Date.now();
        await this.throttleRequest();
        const latestSlot = await this.connection.getSlot();
        
        if (latestSlot > this.currentSlot) {
          // Process slots with very conservative limits
          const slotsToProcess = Math.min(
            latestSlot - this.currentSlot, 
            config.solana.maxSlotsPerBatch
          );
          
          this.logger.debug('Processing new slots', { 
            currentSlot: this.currentSlot,
            latestSlot,
            slotsToProcess,
            totalSlotsAvailable: latestSlot - this.currentSlot
          });
          
          for (let i = 0; i < slotsToProcess; i++) {
            const slot = this.currentSlot + 1 + i;
            await this.processSlot(slot, onNewBlock);
            
            // Add longer delay between slot processing
            if (i < slotsToProcess - 1) {
              await this.sleep(config.solana.slotProcessingDelay);
            }
          }
          this.currentSlot = this.currentSlot + slotsToProcess;
        }

        if (config.logging.enablePerformanceLogs) {
          const duration = Date.now() - startTime;
          this.logger.logPerformance('SLOT_POLL', duration, { latestSlot });
        }

        this.retryCount = 0; // Reset retry count on success
        this.consecutiveRateLimitErrors = 0; // Reset consecutive rate limit errors
        
        await this.sleep(config.solana.slotPollInterval);

      } catch (error) {
        await this.handleRetry(error);
      }
    }
  }

  async scanHistoricalBlocks(startBlock, endBlock, onNewBlock) {
    this.logger.info('Starting historical block scan', { 
      startBlock, 
      endBlock, 
      totalBlocks: endBlock - startBlock,
      estimatedTimeMinutes: Math.ceil((endBlock - startBlock) * config.solana.historicalBatchDelay / 60000)
    });
    
    const totalBlocks = endBlock - startBlock;
    let processedBlocks = 0;
    const batchSize = config.solana.historicalBatchSize; // Use configurable batch size
    const startTime = Date.now();
    
    for (let currentBlock = startBlock; currentBlock < endBlock && this.isRunning; currentBlock += batchSize) {
      const batchEnd = Math.min(currentBlock + batchSize, endBlock);
      
      this.logger.info('Processing historical block batch', {
        batchStart: currentBlock,
        batchEnd,
        batchSize: batchEnd - currentBlock,
        progress: `${processedBlocks}/${totalBlocks} (${((processedBlocks / totalBlocks) * 100).toFixed(1)}%)`,
        elapsedMinutes: ((Date.now() - startTime) / 60000).toFixed(1)
      });
      
      // Process blocks in this batch
      for (let block = currentBlock; block < batchEnd && this.isRunning; block++) {
        await this.processSlot(block, onNewBlock);
        processedBlocks++;
        
        // Add delay between blocks to respect rate limits
        if (block < batchEnd - 1) {
          await this.sleep(config.solana.slotProcessingDelay);
        }
      }
      
      // Add longer delay between batches to be extra conservative
      if (batchEnd < endBlock) {
        await this.sleep(config.solana.historicalBatchDelay);
      }
    }
    
    const totalTimeMinutes = ((Date.now() - startTime) / 60000).toFixed(1);
    this.logger.info('Historical block scan completed', { 
      processedBlocks, 
      totalBlocks,
      totalTimeMinutes,
      currentSlot: this.currentSlot,
      averageTimePerBlock: (totalTimeMinutes / processedBlocks).toFixed(3) + ' minutes'
    });
  }

  async processSlot(slot, onNewBlock) {
    try {
      const startTime = Date.now();
      await this.throttleRequest();
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
      // Don't throw here to avoid stopping the entire polling loop
    }
  }

  async handleRetry(error) {
    this.retryCount++;
    
    // Special handling for rate limit errors (429)
    if (error.message && error.message.includes('429')) {
      this.consecutiveRateLimitErrors++;
      
      this.logger.warn('Rate limit hit, implementing aggressive backoff', { 
        attempt: this.retryCount,
        consecutiveRateLimitErrors: this.consecutiveRateLimitErrors,
        currentDelay: this.rateLimitDelay 
      });
      
      // Switch RPC endpoint if we've hit rate limits too many times
      if (this.consecutiveRateLimitErrors >= 3) {
        this.switchRpcEndpoint();
        this.consecutiveRateLimitErrors = 0;
        this.retryCount = 0;
        await this.sleep(5000); // Wait 5 seconds after switching
        return;
      }
      
      // More aggressive rate limit delay increase
      this.rateLimitDelay = Math.min(
        this.rateLimitDelay * config.solana.rateLimitBackoffMultiplier,
        config.solana.maxRateLimitDelay
      );
      
      // Calculate delay with consecutive error multiplier
      const baseDelay = config.solana.retryDelay * Math.pow(2, this.retryCount - 1);
      const consecutiveMultiplier = Math.pow(2, this.consecutiveRateLimitErrors - 1);
      const delay = Math.min(
        baseDelay * consecutiveMultiplier,
        config.solana.maxRateLimitDelay
      );
      
      this.logger.warn(`Rate limit backoff: waiting ${delay}ms (attempt ${this.retryCount}, consecutive: ${this.consecutiveRateLimitErrors})`);
      await this.sleep(delay);
      return;
    }
    
    // Regular error handling
    if (this.retryCount >= config.solana.maxRetries) {
      this.logger.error('Max retries reached, stopping service', { error: error.message });
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