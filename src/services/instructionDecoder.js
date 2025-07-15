import { config } from '../config/index.js';
import { Logger } from './logger.js';

export class InstructionDecoder {
  constructor() {
    this.logger = new Logger(config.logging.level);
    this.dexPrograms = config.dexPrograms;
  }

  decodeTransaction(transaction) {
    const decodedInstructions = [];
    
    // Process top-level instructions
    if (transaction.transaction && transaction.transaction.message && transaction.transaction.message.instructions) {
      transaction.transaction.message.instructions.forEach((instruction, index) => {
        const decoded = this.decodeInstruction(instruction, transaction, index);
        if (decoded) {
          decodedInstructions.push(decoded);
        }
      });
    }

    // Process inner instructions (CPI calls)
    if (transaction.meta && transaction.meta.innerInstructions) {
      transaction.meta.innerInstructions.forEach(innerGroup => {
        innerGroup.instructions.forEach((instruction, index) => {
          const decoded = this.decodeInstruction(instruction, transaction, `inner-${innerGroup.index}-${index}`);
          if (decoded) {
            decoded.isInner = true;
            decoded.parentInstructionIndex = innerGroup.index;
            decodedInstructions.push(decoded);
          }
        });
      });
    }



    return decodedInstructions;
  }

  decodeInstruction(instruction, transaction, index) {
    try {
      // Get the program ID
      const accounts = transaction.transaction.message.accountKeys || 
                     transaction.transaction.message.staticAccountKeys || [];
      
      const programId = accounts[instruction.programIdIndex];
      if (!programId) {
        return null;
      }

      const programIdString = programId.toString();
      
      // Check if this is a known DEX program
      const dexInfo = this.findDexByProgramId(programIdString);
      if (!dexInfo) {
        return null;
      }

      // Decode instruction data
      const instructionData = this.decodeInstructionData(instruction.data, dexInfo);
      
      // More permissive: consider any instruction from a DEX program as potentially relevant
      const isRelevant = this.isRelevantInstruction(instructionData, dexInfo);
      
      return {
        index,
        programId: programIdString,
        dex: dexInfo.name,
        accounts: instruction.accounts || [],
        data: instruction.data,
        decodedData: instructionData,
        isSwapInstruction: this.isSwapInstruction(instructionData, dexInfo),
        isRelevantInstruction: isRelevant,
      };
    } catch (error) {
      this.logger.debug('Error decoding instruction', { error: error.message, index });
      return null;
    }
  }

  findDexByProgramId(programId) {
    for (const [key, dexInfo] of Object.entries(this.dexPrograms)) {
      if (dexInfo.programId === programId) {
        return dexInfo;
      }
    }
    return null;
  }

  decodeInstructionData(data, dexInfo) {
    if (!data || data.length < 8) {
      return { type: 'unknown', discriminator: null };
    }

    // Convert base58 data to bytes
    let dataBytes;
    try {
      // Assuming data is base58 encoded
      dataBytes = this.base58ToBytes(data);
    } catch (error) {
      // If it fails, data might already be bytes
      if (Array.isArray(data)) {
        dataBytes = data;
      } else {
        return { type: 'unknown', discriminator: null };
      }
    }

    if (dataBytes.length < 8) {
      return { type: 'unknown', discriminator: null };
    }

    // Extract the first 8 bytes (Anchor discriminator)
    const discriminator = dataBytes.slice(0, 8);
    
    // Match against known discriminators
    for (const [methodName, expectedDiscriminator] of Object.entries(dexInfo.discriminators)) {
      if (this.arraysEqual(discriminator, expectedDiscriminator)) {
        return {
          type: methodName,
          discriminator: discriminator,
          rawData: dataBytes,
        };
      }
    }

    return {
      type: 'unknown',
      discriminator: discriminator,
      rawData: dataBytes,
    };
  }

  isSwapInstruction(decodedData, dexInfo) {
    if (!decodedData || !decodedData.type) {
      return false;
    }

    const swapMethods = ['swap', 'route', 'shared_route', 'new_order'];
    return swapMethods.includes(decodedData.type.toLowerCase());
  }

  isRelevantInstruction(decodedData, dexInfo) {
    if (!decodedData || !decodedData.type) {
      return false;
    }

    // More permissive: consider any instruction from a DEX as potentially relevant
    // This includes swap, route, new_order, and even unknown instructions from known DEXes
    const relevantMethods = ['swap', 'route', 'shared_route', 'new_order', 'unknown'];
    return relevantMethods.includes(decodedData.type.toLowerCase());
  }

  base58ToBytes(base58String) {
    // Simple base58 decoder - in production, use a proper library
    // This is a simplified version for demonstration
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

  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}