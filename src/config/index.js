import dotenv from 'dotenv';

dotenv.config();

export const config = {
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    commitment: 'confirmed',
    slotPollInterval: parseInt(process.env.SLOT_POLL_INTERVAL) || 5000, // Increased to 5 seconds
    maxRetries: parseInt(process.env.MAX_RETRIES) || 5,
    retryDelay: parseInt(process.env.RETRY_DELAY) || 1000,
    // Much more conservative rate limiting settings
    maxRequestsPerSecond: parseInt(process.env.MAX_REQUESTS_PER_SECOND) || 3, // Reduced from 10 to 3
    requestDelay: parseInt(process.env.REQUEST_DELAY) || 500, // Increased from 100ms to 500ms
    rateLimitBackoffMultiplier: parseFloat(process.env.RATE_LIMIT_BACKOFF_MULTIPLIER) || 3.0, // Increased from 2.0 to 3.0
    maxRateLimitDelay: parseInt(process.env.MAX_RATE_LIMIT_DELAY) || 60000, // Increased to 60 seconds max
    // Additional conservative settings
    maxSlotsPerBatch: parseInt(process.env.MAX_SLOTS_PER_BATCH) || 2, // Process max 2 slots at once
    slotProcessingDelay: parseInt(process.env.SLOT_PROCESSING_DELAY) || 1000, // 1 second between slots
    // Historical scanning settings
    historicalBatchSize: parseInt(process.env.HISTORICAL_BATCH_SIZE) || 10, // Process 10 historical blocks at once
    historicalBatchDelay: parseInt(process.env.HISTORICAL_BATCH_DELAY) || 2000, // 2 seconds between historical batches
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'debug', // Changed from 'info' to 'debug'
    enablePerformanceLogs: process.env.ENABLE_PERFORMANCE_LOGS === 'true',
  },
  
  // Known DEX program IDs
  dexPrograms: {
    jupiter: {
      programId: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
      name: 'Jupiter',
      discriminators: {
        'shared_route': [0x8b, 0x8f, 0x1f, 0x8c, 0x1c, 0x1a, 0x6a, 0x4a],
        'route': [0x8b, 0x8f, 0x1f, 0x8c, 0x1c, 0x1a, 0x6a, 0x4a],
      }
    },
    orca: {
      programId: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
      name: 'Orca',
      discriminators: {
        'swap': [0xf8, 0xc6, 0x9e, 0x91, 0xe1, 0x75, 0x87, 0xc8],
      }
    },
    raydium: {
      programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
      name: 'Raydium',
      discriminators: {
        'swap': [0x09, 0x0a, 0x90, 0x1d, 0x0c, 0x0a, 0x0b, 0x0c],
      }
    },
    lifinity: {
      programId: '2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c',
      name: 'Lifinity',
      discriminators: {
        'swap': [0x2e, 0x6b, 0x41, 0x5a, 0x9f, 0x8b, 0x7c, 0x3d],
      }
    },
    serum: {
      programId: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
      name: 'Serum',
      discriminators: {
        'new_order': [0x10, 0x2c, 0x0b, 0x6e, 0x3f, 0x54, 0x8a, 0x9c],
      }
    },
    openbook: {
      programId: 'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',
      name: 'OpenBook',
      discriminators: {
        'new_order': [0x10, 0x2c, 0x0b, 0x6e, 0x3f, 0x54, 0x8a, 0x9c],
      }
    },
    phoenix: {
      programId: 'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY',
      name: 'Phoenix',
      discriminators: {
        'swap': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      }
    },
    step: {
      programId: 'SSwpMgqNDsyV7mAgN9ady4bDVu5ySjmmXejXvy2vLt1',
      name: 'Step',
      discriminators: {
        'swap': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      }
    },
    cykura: {
      programId: 'cysPXAjehMpVKUapzbMCCnpFxUFFryEWEaLgnb9NrR8',
      name: 'Cykura',
      discriminators: {
        'swap': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      }
    },
    goosefx: {
      programId: '7WduLbRfYhTJktjLw5FDEyrqoEv61aTTCuGAetgLjzN5',
      name: 'GooseFX',
      discriminators: {
        'swap': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      }
    },
    cropper: {
      programId: 'CROPiAqv5Qn1eZ4w6K6Qw6Qw6Qw6Qw6Qw6Qw6Qw6', // Placeholder, please verify
      name: 'Cropper',
      discriminators: {
        'swap': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      }
    },
    crema: {
      programId: '6MLxLqiXaaSUpkgMnWDTuejNZEz3kE7k2woyHGVFw319',
      name: 'Crema',
      discriminators: {
        'swap': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      }
    },
    aldrin: {
      programId: 'AMM55ShdkoGRB5jVYPjWziwk8m5MpwyDgsMWHaMSQWH6',
      name: 'Aldrin',
      discriminators: {
        'swap': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      }
    },
    pumpswap: {
      programId: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', // Placeholder, please verify
      name: 'Pumpswap',
      discriminators: {
        'swap': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      }
    },
    meteora: {
      programId: 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
      name: 'Meteora',
      discriminators: {
        'swap': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      }
    },
  }
};