# Solana Token Buy Tracker

A backend service that tracks the first 100 buy transactions for a specific token on the Solana blockchain in near real-time.

## Features

- **Token-Specific Tracking**: Focuses on buy transactions for a user-specified token
- **Real-time Transaction Streaming**: Connects to Solana RPC and polls for new blocks
- **Multi-DEX Support**: Detects buys from Jupiter, Orca, Raydium, Lifinity, and Serum
- **Instruction Decoding**: Decodes both top-level and inner instructions using Anchor discriminators
- **Buy Analysis**: Analyzes pre/post token balances to identify buy transactions and amounts
- **Progress Tracking**: Shows real-time progress toward finding 100 buys
- **Structured Logging**: Outputs detected buys in structured JSON format
- **Buyer Identification**: Attempts to identify the wallet address that made each purchase
- **Price Calculation**: Calculates price per token for each buy transaction

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
4. **Enter a token mint address and starting block when prompted:**

   ```
   Enter the token mint address to track: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   Enter the starting block number (or press Enter to start from current block): 250000000
   ```

5. **For development with auto-restart:**
   ```bash
   npm run dev
   ```

## Example Token Addresses

Here are some popular token mint addresses you can use for testing:

- **USDC**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **SOL (Wrapped)**: `So11111111111111111111111111111111111111112`
- **USDT**: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`
- **RAY (Raydium)**: `4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R`
- **ORCA**: `orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE`

## Configuration

Environment variables can be set in `.env` file:

```env
# Solana RPC Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# For better performance, use enhanced RPC providers:
# SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
# SOLANA_RPC_URL=https://api.triton.one/rpc/YOUR_KEY

# Polling and Rate Limiting Configuration
SLOT_POLL_INTERVAL=2000
MAX_REQUESTS_PER_SECOND=10
REQUEST_DELAY=100
RATE_LIMIT_BACKOFF_MULTIPLIER=2.0
MAX_RATE_LIMIT_DELAY=30000

# Retry Configuration
MAX_RETRIES=5
RETRY_DELAY=1000

# Logging Configuration
LOG_LEVEL=info
ENABLE_PERFORMANCE_LOGS=true
```

## Output Format

Detected buys are logged in structured JSON format:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "BUY_DETECTED",
  "data": {
    "txHash": "5j7s8K9mE3x2N1pQ4rT6vW8zA9bC5dE7fG3hI4jK6lM8nO0pQ1rS3tU5vW7xY9zA1bC3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9dE1fG3hI5jK7lM9nO1pQ3rS5tU7vW9xY1zA3b",
    "dex": "Jupiter",
    "targetToken": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "tokenSold": "So11111111111111111111111111111111111111112",
    "amountBought": "50123456",
    "amountSold": "1000000000",
    "decimalsTarget": 6,
    "decimalsSold": 9,
    "timestamp": 1704110400,
    "instructionType": "route",
    "programId": "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB",
    "slot": 250123456,
    "buyNumber": 1,
    "buyer": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "pricePerToken": "0.00199800"
  }
}
```

## Progress Tracking

The service provides real-time progress updates:

```json
{
  "timestamp": "2024-01-01T12:05:00.000Z",
  "level": "info",
  "message": "TRACKING_PROGRESS",
  "data": {
    "target_token": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "buys_found": 25,
    "target_buys": 100,
    "progress_percentage": "25.0",
    "runtime_minutes": "2.5",
    "blocks_processed": 150,
    "transactions_processed": 45000,
    "is_complete": false
  }
}
```

## Architecture

The service is built with a modular architecture:

- **RPC Service** (`src/services/rpcService.js`): Handles Solana RPC connection and block polling
- **Instruction Decoder** (`src/services/instructionDecoder.js`): Decodes transaction instructions and matches DEX programs
- **Token Buy Tracker** (`src/services/tokenBuyTracker.js`): Analyzes transactions to identify buy transactions for the target token
- **Main Service** (`src/services/tokenTrackingService.js`): Orchestrates all components and provides progress tracking
- **Logger** (`src/services/logger.js`): Structured logging system
- **Configuration** (`src/config/index.js`): Centralized configuration management

## Performance & Rate Limiting

The service is optimized for efficient token tracking with built-in rate limiting:

- **Rate Limiting**: Configurable requests per second (default: 10 RPS) to avoid 429 errors
- **Request Throttling**: Minimum delay between requests (default: 100ms)
- **Exponential Backoff**: Automatic backoff when rate limits are hit
- **Efficient Slot Polling**: Configurable intervals (default: 2 seconds) to reduce API load
- **Targeted Processing**: Focuses only on transactions involving the target token
- **Automatic Completion**: Stops when 100 buys are found
- **Performance Metrics**: Real-time monitoring and progress tracking
- **Graceful Error Handling**: Intelligent retry logic with exponential backoff

### Rate Limiting Configuration

The service includes sophisticated rate limiting to prevent 429 "Too Many Requests" errors:

- `MAX_REQUESTS_PER_SECOND`: Maximum RPC requests per second (default: 10)
- `REQUEST_DELAY`: Minimum delay between requests in milliseconds (default: 100)
- `RATE_LIMIT_BACKOFF_MULTIPLIER`: Multiplier for exponential backoff (default: 2.0)
- `MAX_RATE_LIMIT_DELAY`: Maximum delay when rate limited (default: 30000ms)

When a 429 error is encountered, the service automatically:

1. Increases the delay between requests exponentially
2. Waits for the calculated backoff period
3. Resumes with the new, more conservative rate
4. Gradually returns to normal rates once the rate limit is no longer hit

## Extending

To add support for new DEXes or modify tracking behavior:

1. **Add new DEX support** in `src/config/index.js`:

   ```javascript
   newDex: {
     programId: 'NEW_PROGRAM_ID_HERE',
     name: 'NewDex',
     discriminators: {
       'swap': [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0],
     }
   }
   ```

2. **Modify tracking parameters** in `src/services/tokenBuyTracker.js`:
   - Change `maxBuys` to track more or fewer transactions
   - Adjust buy detection logic for specific requirements
   - Add additional metadata extraction

## Production Deployment

For production use:

1. **Use Enhanced RPC Providers**: Configure with Helius, Triton, or other enhanced RPC providers for better reliability and performance.

2. **Database Integration**: Extend the `TokenBuyTracker` to store results in PostgreSQL, Redis, or your preferred database.

3. **API Layer**: Add REST or WebSocket API endpoints to expose tracking progress and results to client applications.

4. **Monitoring**: Implement proper monitoring, alerting, and health checks.

5. **Multi-Token Support**: Extend to track multiple tokens simultaneously.

## License

MIT License - see LICENSE file for details.
