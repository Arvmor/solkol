import { Logger } from './logger.js';
import { config } from '../config/index.js';

export class TokenCreationDetector {
  constructor(rpcService) {
    this.rpcService = rpcService;
    this.logger = new Logger(config.logging.level);
  }

  async findTokenCreationBlock(tokenMint) {
    this.logger.info('Starting token creation block search', { tokenMint });
    
    try {
      const startTime = Date.now();
      
      // Get all signatures for the token mint account
      const signatures = await this.getAllSignaturesForAccount(tokenMint);
      
      if (signatures.length === 0) {
        this.logger.warn('No signatures found for token mint', { tokenMint });
        return null;
      }

      // The creation transaction should be the oldest signature
      const creationSignature = signatures[signatures.length - 1];
      
      // Get the transaction details
      const transaction = await this.rpcService.connection.getTransaction(creationSignature.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (!transaction) {
        this.logger.error('Could not fetch creation transaction', { 
          tokenMint, 
          signature: creationSignature.signature 
        });
        return null;
      }

      // Analyze the transaction to confirm it's a token creation
      const creationInfo = this.analyzeCreationTransaction(transaction, tokenMint);
      
      if (creationInfo) {
        const duration = Date.now() - startTime;
        
        this.logger.info('TOKEN_CREATION_FOUND', {
          tokenMint,
          creationBlock: transaction.slot,
          creationTxHash: creationSignature.signature,
          blockTime: transaction.blockTime,
          creationTimestamp: new Date(transaction.blockTime * 1000).toISOString(),
          mintAuthority: creationInfo.mintAuthority,
          freezeAuthority: creationInfo.freezeAuthority,
          decimals: creationInfo.decimals,
          supply: creationInfo.supply,
          searchDuration: duration
        });

        return {
          tokenMint,
          creationBlock: transaction.slot,
          creationTxHash: creationSignature.signature,
          blockTime: transaction.blockTime,
          creationTimestamp: new Date(transaction.blockTime * 1000).toISOString(),
          mintAuthority: creationInfo.mintAuthority,
          freezeAuthority: creationInfo.freezeAuthority,
          decimals: creationInfo.decimals,
          supply: creationInfo.supply
        };
      } else {
        this.logger.warn('Transaction found but could not confirm token creation', {
          tokenMint,
          signature: creationSignature.signature
        });
        return null;
      }

    } catch (error) {
      this.logger.error('Error finding token creation block', {
        tokenMint,
        error: error.message
      });
      return null;
    }
  }

  async getAllSignaturesForAccount(accountPubkey) {
    const allSignatures = [];
    let before = null;
    const limit = 1000;

    try {
      while (true) {
        const options = { limit };
        if (before) {
          options.before = before;
        }

        const signatures = await this.rpcService.connection.getSignaturesForAddress(
          accountPubkey,
          options
        );

        if (signatures.length === 0) {
          break;
        }

        allSignatures.push(...signatures);
        
        // If we got fewer signatures than the limit, we've reached the end
        if (signatures.length < limit) {
          break;
        }

        // Set the before parameter to the last signature for pagination
        before = signatures[signatures.length - 1].signature;
        
        // Add a small delay to avoid rate limiting
        await this.sleep(100);
      }

      this.logger.debug('Retrieved all signatures for account', {
        accountPubkey: accountPubkey.toString(),
        totalSignatures: allSignatures.length
      });

      return allSignatures;

    } catch (error) {
      this.logger.error('Error getting signatures for account', {
        accountPubkey: accountPubkey.toString(),
        error: error.message
      });
      return [];
    }
  }

  analyzeCreationTransaction(transaction, expectedTokenMint) {
    try {
      // Look for token program instructions
      const tokenProgramId = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      const tokenProgram2022Id = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
      
      const instructions = transaction.transaction.message.instructions || [];
      const accounts = transaction.transaction.message.accountKeys || [];

      for (const instruction of instructions) {
        const programId = accounts[instruction.programIdIndex]?.toString();
        
        // Check if this is a token program instruction
        if (programId === tokenProgramId || programId === tokenProgram2022Id) {
          // Check if the instruction data indicates a mint initialization
          if (this.isInitializeMintInstruction(instruction.data)) {
            // Extract mint information
            const mintInfo = this.extractMintInfo(instruction, accounts, expectedTokenMint);
            if (mintInfo) {
              return mintInfo;
            }
          }
        }
      }

      // Also check inner instructions
      if (transaction.meta?.innerInstructions) {
        for (const innerGroup of transaction.meta.innerInstructions) {
          for (const innerInstruction of innerGroup.instructions) {
            const programId = accounts[innerInstruction.programIdIndex]?.toString();
            
            if (programId === tokenProgramId || programId === tokenProgram2022Id) {
              if (this.isInitializeMintInstruction(innerInstruction.data)) {
                const mintInfo = this.extractMintInfo(innerInstruction, accounts, expectedTokenMint);
                if (mintInfo) {
                  return mintInfo;
                }
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Error analyzing creation transaction', { error: error.message });
      return null;
    }
  }

  isInitializeMintInstruction(data) {
    // Token program InitializeMint instruction has discriminator 0
    // This is a simplified check - in production you'd want more robust parsing
    if (!data || data.length === 0) return false;
    
    // Convert data to bytes if it's base58
    let dataBytes;
    try {
      if (typeof data === 'string') {
        dataBytes = this.base58ToBytes(data);
      } else if (Array.isArray(data)) {
        dataBytes = data;
      } else {
        return false;
      }
    } catch {
      return false;
    }

    // InitializeMint instruction starts with 0
    return dataBytes.length > 0 && dataBytes[0] === 0;
  }

  extractMintInfo(instruction, accounts, expectedTokenMint) {
    try {
      // For InitializeMint, the mint account is typically the first account
      const mintAccount = accounts[instruction.accounts[0]]?.toString();
      
      // Verify this matches our expected token mint
      if (mintAccount !== expectedTokenMint) {
        return null;
      }

      // Extract mint authority and freeze authority from instruction data
      // This is simplified - in production you'd parse the full instruction layout
      let dataBytes;
      try {
        if (typeof instruction.data === 'string') {
          dataBytes = this.base58ToBytes(instruction.data);
        } else {
          dataBytes = instruction.data;
        }
      } catch {
        return null;
      }

      // Basic extraction - this would need proper layout parsing in production
      return {
        mintAuthority: accounts[instruction.accounts[1]]?.toString() || 'unknown',
        freezeAuthority: accounts[instruction.accounts[2]]?.toString() || null,
        decimals: dataBytes.length > 1 ? dataBytes[1] : 0,
        supply: '0' // Initial supply is typically 0
      };
    } catch (error) {
      this.logger.error('Error extracting mint info', { error: error.message });
      return null;
    }
  }

  base58ToBytes(base58String) {
    // Simple base58 decoder - in production, use a proper library
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const ALPHABET_MAP = {};
    for (let i = 0; i < ALPHABET.length; i++) {
      ALPHABET_MAP[ALPHABET[i]] = i;
    }

    let result = [];
    let carry = 0;
    
    for (let i = 0; i < base58String.length; i++) {
      carry = ALPHABET_MAP[base58String[i]];
      if (carry === undefined) {
        throw new Error('Invalid base58 character');
      }
      
      for (let j = 0; j < result.length; j++) {
        carry += result[j] * 58;
        result[j] = carry & 0xff;
        carry >>= 8;
      }
      
      while (carry > 0) {
        result.push(carry & 0xff);
        carry >>= 8;
      }
    }

    // Add leading zeros
    for (let i = 0; i < base58String.length && base58String[i] === '1'; i++) {
      result.push(0);
    }

    return result.reverse();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}