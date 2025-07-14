import { SwapDetectionService } from './services/swapService.js';
import { Logger } from './services/logger.js';
import { config } from './config/index.js';

async function main() {
  const logger = new Logger(config.logging.level);
  
  logger.info('🚀 Solana On-Chain Swap Detector Starting...', {
    rpc_url: config.solana.rpcUrl,
    poll_interval: config.solana.slotPollInterval,
    supported_dexes: Object.keys(config.dexPrograms)
  });

  const service = new SwapDetectionService();
  
  // Setup graceful shutdown
  service.setupGracefulShutdown();
  
  try {
    const started = await service.start();
    if (!started) {
      logger.error('Failed to start service');
      process.exit(1);
    }
    
    logger.info('✅ Service started successfully. Monitoring for swaps...');
    
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
Solana On-Chain Swap Detector

Usage: npm start

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

The service will output detected swaps in JSON format to stdout.
  `);
  process.exit(0);
}

// Start the service
main().catch(error => {
  console.error('Failed to start:', error);
  process.exit(1);
});