// Browser-compatible token tracking service
export class BrowserTokenService {
  constructor() {
    this.isRunning = false;
    this.targetToken = null;
    this.startingBlock = null;
    this.detectedBuys = [];
    this.maxBuys = 100;
    this.isComplete = false;
    this.currentSlot = null;
    this.progressInterval = null;
    this.slotPollInterval = null;
    
    // RPC endpoints for browser use
    this.rpcEndpoints = [
      'https://api.mainnet-beta.solana.com',
      'https://solana-api.projectserum.com',
      'https://rpc.ankr.com/solana',
      'https://mainnet.rpcpool.com',
    ];
    this.currentRpcIndex = 0;
  }

  async start(targetToken, startingBlock = null | Number) {
    console.log('Starting Browser Token Service', { targetToken, startingBlock });
    
    if (!this.isValidTokenMint(targetToken)) {
      console.error('Invalid token mint address', { targetToken });
      return false;
    }

    this.targetToken = targetToken;
    this.startingBlock = startingBlock || null;
    this.detectedBuys = [];
    this.isComplete = false;
    this.isRunning = true;

    // Initialize by getting current slot
    try {
      this.currentSlot = await this.getCurrentSlot();
      console.log('Service initialized', { currentSlot: this.currentSlot });
      
      // Start polling for new blocks
      this.startSlotPolling();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize service', error);
      return false;
    }
  }

  isValidTokenMint(tokenMint) {
    if (!tokenMint || typeof tokenMint !== 'string') {
      return false;
    }
    
    if (tokenMint.length < 32 || tokenMint.length > 44) {
      return false;
    }
    
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(tokenMint);
  }

  async getCurrentSlot() {
    const response = await this.makeRpcRequest('getSlot', []);
    return response.result;
  }

  async getBlock(slot) {
    const response = await this.makeRpcRequest('getBlock', [
      slot,
      {
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'full',
      }
    ]);
    return response.result;
  }

  async makeRpcRequest(method, params) {
    const endpoint = this.rpcEndpoints[this.currentRpcIndex];
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: method,
          params: params
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`RPC Error: ${data.error.message}`);
      }

      return data;
    } catch (error) {
      console.error('RPC request failed', { method, params, error: error.message });
      
      // Switch to next RPC endpoint on error
      this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcEndpoints.length;
      console.log('Switched to RPC endpoint', this.rpcEndpoints[this.currentRpcIndex]);
      
      // Retry with new endpoint
      if (this.isRunning) {
        await this.sleep(1000);
        return this.makeRpcRequest(method, params);
      }
      
      throw error;
    }
  }

  startSlotPolling() {
    this.slotPollInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(this.slotPollInterval);
        return;
      }

      try {
        const latestSlot = await this.getCurrentSlot();
        
        if (latestSlot > this.currentSlot) {
          // Process one slot at a time to avoid overwhelming the RPC
          const slot = this.currentSlot + 1;
          await this.processSlot(slot);
          this.currentSlot = slot;
        }
      } catch (error) {
        console.error('Error in slot polling', error);
      }
    }, 5000); // Poll every 5 seconds
  }

  async processSlot(slot) {
    // Skip blocks before our starting block if specified
    if (this.startingBlock !== null && slot < this.startingBlock) {
      return;
    }

    if (this.isComplete) {
      console.log('Tracking complete, stopping service');
      this.stop();
      return;
    }

    try {
      const block = await this.getBlock(slot);
      
      if (!block || !block.transactions) {
        return;
      }

      let buyCount = 0;

      // Process each transaction in the block
      for (const transaction of block.transactions) {
        if (transaction.meta && !transaction.meta.err) {
          const signature = transaction.transaction.signatures[0];
          const buys = await this.detectBuysInTransaction(transaction, signature);
          buyCount += buys.length;
        }
      }

      if (buyCount > 0) {
        console.log(`Block ${slot}: Found ${buyCount} buys`);
      }

    } catch (error) {
      console.error('Error processing block', { slot, error: error.message });
    }
  }

  async detectBuysInTransaction(transaction, signature) {
    if (!this.targetToken || this.isComplete) {
      return [];
    }

    try {
      // Get token balance changes
      const balanceChanges = this.getTokenBalanceChanges(transaction);
      
      // Check if this transaction involves our target token
      const targetTokenChanges = balanceChanges.filter(change => 
        change.mint === this.targetToken
      );

      if (targetTokenChanges.length === 0) {
        return [];
      }

      // Find target token increases (buys)
      const targetTokenIncreases = targetTokenChanges.filter(change => {
        try {
          return BigInt(change.delta) > 0;
        } catch (error) {
          return false;
        }
      });
      
      if (targetTokenIncreases.length === 0) {
        return [];
      }

      // Find what was sold to buy the target token
      const decreases = balanceChanges.filter(change => {
        try {
          return BigInt(change.delta) < 0 && change.mint !== this.targetToken;
        } catch (error) {
          return false;
        }
      });

      if (decreases.length === 0) {
        return [];
      }

      // Take the largest target token increase as the buy amount
      const targetTokenBuy = targetTokenIncreases.reduce((max, current) => {
        try {
          return BigInt(current.delta) > BigInt(max.delta) ? current : max;
        } catch (error) {
          return max;
        }
      });

      // Take the largest decrease as what was sold
      const tokenSold = decreases.reduce((max, current) => {
        try {
          return BigInt(current.delta) < BigInt(max.delta) ? current : max;
        } catch (error) {
          return max;
        }
      });

      // Extract buyer address
      const buyer = this.extractBuyer(transaction, targetTokenBuy.accountIndex);

      if (!buyer) {
        return [];
      }

      // Create buy record
      const buy = {
        buyer: buyer,
        targetToken: this.targetToken,
        tokenSold: tokenSold.mint,
        amountBought: targetTokenBuy.delta,
        amountSold: Math.abs(tokenSold.delta).toString(),
        decimalsTarget: targetTokenBuy.decimals || 9,
        decimalsSold: tokenSold.decimals || 9,
        txHash: signature,
        timestamp: Math.floor(Date.now() / 1000),
        slot: transaction.slot,
        dex: this.detectDex(transaction),
        pricePerToken: this.calculatePrice(tokenSold.delta, targetTokenBuy.delta),
        confidence: 'medium',
        buyNumber: this.detectedBuys.length + 1
      };

      this.detectedBuys.push(buy);

      // Check if we've reached max buys
      if (this.detectedBuys.length >= this.maxBuys) {
        this.isComplete = true;
      }

      return [buy];
    } catch (error) {
      console.error('Error detecting buys in transaction', { signature, error: error.message });
      return [];
    }
  }

  getTokenBalanceChanges(transaction) {
    const balanceChanges = [];
    
    if (!transaction.meta || !transaction.meta.postTokenBalances || !transaction.meta.preTokenBalances) {
      return balanceChanges;
    }

    const preBalances = new Map();
    const postBalances = new Map();

    // Build pre-balance map
    transaction.meta.preTokenBalances.forEach(balance => {
      const key = `${balance.accountIndex}-${balance.mint}`;
      preBalances.set(key, {
        amount: balance.uiTokenAmount?.amount || '0',
        decimals: balance.uiTokenAmount?.decimals || 0
      });
    });

    // Build post-balance map and calculate changes
    transaction.meta.postTokenBalances.forEach(balance => {
      const key = `${balance.accountIndex}-${balance.mint}`;
      const preBalance = preBalances.get(key);
      const postAmount = balance.uiTokenAmount?.amount || '0';
      
      if (preBalance) {
        const delta = BigInt(postAmount) - BigInt(preBalance.amount);
        if (delta !== 0n) {
          balanceChanges.push({
            mint: balance.mint,
            delta: delta.toString(),
            accountIndex: balance.accountIndex,
            decimals: balance.uiTokenAmount?.decimals || 0
          });
        }
      } else {
        // New balance
        const delta = BigInt(postAmount);
        if (delta !== 0n) {
          balanceChanges.push({
            mint: balance.mint,
            delta: delta.toString(),
            accountIndex: balance.accountIndex,
            decimals: balance.uiTokenAmount?.decimals || 0
          });
        }
      }
    });

    return balanceChanges;
  }

  extractBuyer(transaction, targetAccountIndex) {
    try {
      if (!transaction.transaction.message.accountKeys) {
        return null;
      }

      // Find the account that owns the target token
      const accountKey = transaction.transaction.message.accountKeys[targetAccountIndex];
      if (!accountKey) {
        return null;
      }

      // For simplicity, return the first writable account that's not a program
      for (let i = 0; i < transaction.transaction.message.accountKeys.length; i++) {
        const key = transaction.transaction.message.accountKeys[i];
        const isWritable = transaction.transaction.message.isAccountWritable(i);
        
        if (isWritable && key !== accountKey) {
          return key;
        }
      }

      return accountKey;
    } catch (error) {
      console.error('Error extracting buyer', error);
      return null;
    }
  }

  detectDex(transaction) {
    // Simple DEX detection based on program IDs
    const dexPrograms = {
      'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': 'Jupiter',
      '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': 'Orca',
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium',
      '2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c': 'Lifinity',
      '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin': 'Serum'
    };

    if (transaction.transaction.message.accountKeys) {
      for (const key of transaction.transaction.message.accountKeys) {
        if (dexPrograms[key]) {
          return dexPrograms[key];
        }
      }
    }

    return 'Unknown';
  }

  calculatePrice(tokenSold, targetTokenBuy) {
    try {
      const sold = BigInt(tokenSold);
      const bought = BigInt(targetTokenBuy);
      
      if (bought === 0n) {
        return '0';
      }
      
      // Calculate price as tokenSold / targetTokenBuy
      const price = (sold * BigInt(1000000)) / bought; // Multiply by 1M for precision
      return (Number(price) / 1000000).toString();
    } catch (error) {
      return '0';
    }
  }

  getDetectedBuys() {
    return this.detectedBuys;
  }

  getProgress() {
    const current = this.detectedBuys.length;
    const target = this.maxBuys;
    const percentage = target > 0 ? ((current / target) * 100).toFixed(1) : '0.0';
    
    return {
      current,
      target,
      percentage,
      isComplete: this.isComplete
    };
  }

  getStats() {
    return {
      totalBlocks: this.currentSlot,
      totalTransactions: 0, // Would need to track this
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
    };
  }

  stop() {
    this.isRunning = false;
    if (this.slotPollInterval) {
      clearInterval(this.slotPollInterval);
    }
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    console.log('Browser Token Service stopped');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 