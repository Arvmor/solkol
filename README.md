# Solana On-Chain Swap Detector

A backend service that detects and logs token swap transactions on the Solana blockchain in near real-time.

## Features

- **Real-time Transaction Streaming**: Connects to Solana RPC and polls for new blocks
- **Multi-DEX Support**: Detects swaps from Jupiter, Orca, Raydium, Lifinity, and Serum
- **Instruction Decoding**: Decodes both top-level and inner instructions using Anchor discriminators
- **Token Balance Analysis**: Analyzes pre/post token balances to identify swap amounts
- **Structured Logging**: Outputs detected swaps in structured JSON format
- **Performance Monitoring**: Tracks processing performance and service statistics

## Supported DEXes

- **Jupiter Aggregator** (`JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB`)
- **Orca** (`9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP`)
- **Raydium** (`675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8`)
- **Lifinity** (`2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c`)
- **Serum** (`9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin`)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment (optional):**
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings
   ```

3. **Start the service:**
   ```bash
   npm start
   ```

4. **For development with auto-restart:**
   ```bash
   npm run dev
   ```

## Configuration

Environment variables can be set in `.env` file:

```env
# Solana RPC Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# For better performance, use enhanced RPC providers:
# SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
# SOLANA_RPC_URL=https://api.triton.one/rpc/YOUR_KEY

# Polling Configuration
SLOT_POLL_INTERVAL=400
MAX_RETRIES=3
RETRY_DELAY=1000

# Logging Configuration
LOG_LEVEL=info
ENABLE_PERFORMANCE_LOGS=true
```

## Output Format

Detected swaps are logged in structured JSON format:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "SWAP_DETECTED",
  "data": {
    "txHash": "5j7s8K9mE3x2N1pQ4rT6vW8zA9bC5dE7fG3hI4jK6lM8nO0pQ1rS3tU5vW7xY9zA1bC3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9dE1fG3hI5jK7lM9nO1pQ3rS5tU7vW9xY1zA3b",
    "dex": "Jupiter",
    "tokenIn": "So11111111111111111111111111111111111111112",
    "tokenOut": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amountIn": "1000000000",
    "amountOut": "50123456",
    "decimalsIn": 9,
    "decimalsOut": 6,
    "timestamp": 1704110400,
    "instructionType": "route",
    "programId": "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",
    "slot": 250123456
  }
}
```

## Architecture

The service is built with a modular architecture:

- **RPC Service** (`src/services/rpcService.js`): Handles Solana RPC connection and block polling
- **Instruction Decoder** (`src/services/instructionDecoder.js`): Decodes transaction instructions and matches DEX programs
- **Swap Detector** (`src/services/swapDetector.js`): Analyzes transactions to identify swaps using balance changes
- **Main Service** (`src/services/swapService.js`): Orchestrates all components and provides statistics
- **Logger** (`src/services/logger.js`): Structured logging system
- **Configuration** (`src/config/index.js`): Centralized configuration management

## Performance

The service is optimized for high-throughput processing:

- Efficient slot polling with configurable intervals
- Parallel transaction processing within blocks
- Memory management with automatic cleanup of old records
- Performance metrics and monitoring
- Graceful error handling and retry logic

## Extending

To add support for new DEXes:

1. Add the DEX configuration to `src/config/index.js`:
   ```javascript
   newDex: {
     programId: 'NEW_PROGRAM_ID_HERE',
     name: 'NewDex',
     discriminators: {
       'swap': [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0],
     }
   }
   ```

2. The service will automatically detect and process swaps from the new DEX.

## Production Deployment

For production use:

1. **Use Enhanced RPC Providers**: Configure with Helius, Triton, or other enhanced RPC providers for better reliability and performance.

2. **Database Integration**: Extend the `SwapDetector` to store results in PostgreSQL, Redis, or your preferred database.

3. **API Layer**: Add REST or WebSocket API endpoints to expose detected swaps to client applications.

4. **Monitoring**: Implement proper monitoring, alerting, and health checks.

5. **Scaling**: Consider horizontal scaling for high-volume processing.

## License

MIT License - see LICENSE file for details.