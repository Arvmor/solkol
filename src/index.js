import { TokenTrackingService } from './services/tokenTrackingService.js';
import { Logger } from './services/logger.js';
import { config } from './config/index.js';
import readline from 'readline';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function promptForToken() {
  return new Promise((resolve) => {
    rl.question('Enter the token mint address to track: ', (answer) => {
      resolve(answer.trim());
    });
  });
}

function promptForBlockNumber() {
  return new Promise((resolve) => {
    rl.question('Enter the starting block number (or press Enter to start from current block): ', (answer) => {
      const blockNumber = answer.trim();
      if (!blockNumber) {
        resolve(null);
      } else {
        const parsed = parseInt(blockNumber);
        if (isNaN(parsed) || parsed < 0) {
          resolve(null);
        } else {
          resolve(parsed);
        }
      }
    });
  });
}

async function main() {
  const logger = new Logger(config.logging.level);
  
  logger.info('🚀 Solana Token Transaction Tracker Starting...', {
    rpc_url: config.solana.rpcUrl,
    poll_interval: config.solana.slotPollInterval,
    tracking_approach: 'Any transaction with target token'
  });

  // Get token from user input
  const targetToken = await promptForToken();
  const startingBlock = await promptForBlockNumber();
  rl.close();
  
  if (!targetToken) {
    logger.error('No token provided');
    process.exit(1);
  }

  const service = new TokenTrackingService();
  
  // Setup graceful shutdown
  service.setupGracefulShutdown();
  
  try {
    const started = await service.start(targetToken, startingBlock);
    if (!started) {
      logger.error('Failed to start service');
      process.exit(1);
    }
    
    logger.info('✅ Service started successfully. Tracking transactions for token:', { 
      targetToken, 
      startingBlock: startingBlock || 'current' 
    });
    
    // Keep the process alive
    process.stdin.resume();
    
  } catch (error) {
    logger.error('Fatal error starting service', { 
      error: error.message,
      stack: error.stack 
    });
    process.exit(1);
  }
}

// Handle CLI arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Solana Token Buy Tracker

Usage: npm start

The service will prompt you to enter a token mint address and then track
the first 100 buy transactions for that token across all supported DEXes.

Environment Variables:
  SOLANA_RPC_URL          Solana RPC endpoint (default: public mainnet)
  SLOT_POLL_INTERVAL      Polling interval in ms (default: 400)
  LOG_LEVEL              Logging level: error, warn, info, debug (default: info)
  ENABLE_PERFORMANCE_LOGS Enable performance logging (default: true)

Supported DEXes:
  - Jupiter Aggregator
  - Orca
  - Raydium  
  - Lifinity
  - Serum

The service will output detected buys in JSON format to stdout.

Example token mint addresses:
  - USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  - SOL: So11111111111111111111111111111111111111112
  `);
  process.exit(0);
}

// Start the service
main().catch(error => {
  process.exit(1);
});