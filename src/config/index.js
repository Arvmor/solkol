import dotenv from 'dotenv';

dotenv.config();

export const config = {
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    commitment: 'confirmed',
    slotPollInterval: parseInt(process.env.SLOT_POLL_INTERVAL) || 400,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.RETRY_DELAY) || 1000,
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
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
    }
  }
};