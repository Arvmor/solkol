declare module '*.js' {
  const content: any;
  export default content;
}

declare module '../utils/validation.js' {
  export function isValidTokenMint(tokenMint: string): boolean;
}

declare module '../utils/shutdown.js' {
  export function setupGracefulShutdown(service: any, logger: any, onShutdown?: () => void): void;
}

declare module './services/tokenTrackingService.js' {
  export class TokenTrackingService {
    constructor();
    start(targetToken: string, startingBlock?: number): Promise<boolean>;
    stop(): void;
    getStats(): {
      totalBlocks: number;
      totalTransactions: number;
      startTime: number;
      lastUpdateTime: number;
      runtime_ms: number;
      progress: {
        current: number;
        target: number;
        percentage: string;
        isComplete: boolean;
      };
      recent_buys: any[];
    };
    buyTracker: {
      getDetectedBuys(): any[];
      getProgress(): {
        current: number;
        target: number;
        percentage: string;
        isComplete: boolean;
      };
    };
    isRunning: boolean;
  }
}

declare module './services/tokenBuyTracker.js' {
  export class TokenBuyTracker {
    constructor(rpcService: any, instructionDecoder: any);
    setTargetToken(tokenMint: string, startingBlock?: number): void;
    detectBuysInTransaction(transaction: any, signature: string): Promise<any[]>;
    getDetectedBuys(): any[];
    getBuyCount(): number;
    isTrackingComplete(): boolean;
    getProgress(): {
      current: number;
      target: number;
      percentage: string;
      isComplete: boolean;
    };
    reset(): void;
  }
}

declare module './services/rpcService.js' {
  export class SolanaRPCService {
    constructor();
    initialize(): Promise<boolean>;
    startSlotPolling(onNewBlock: (block: any, slot: number) => void): Promise<void>;
    stop(): void;
    getTokenBalanceChanges(transaction: any): Promise<any[]>;
  }
}

declare module './services/instructionDecoder.js' {
  export class InstructionDecoder {
    constructor();
    decodeTransaction(transaction: any): any[];
  }
}

declare module './services/logger.js' {
  export class Logger {
    constructor(level: string);
    info(message: string, data?: any): void;
    error(message: string, data?: any): void;
    debug(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    logPerformance(operation: string, duration: number, data?: any): void;
  }
}

declare module './config/index.js' {
  export const config: {
    solana: {
      rpcUrl: string;
      commitment: string;
      slotPollInterval: number;
      maxRetries: number;
      retryDelay: number;
      maxRequestsPerSecond: number;
      requestDelay: number;
      rateLimitBackoffMultiplier: number;
      maxRateLimitDelay: number;
      maxSlotsPerBatch: number;
      slotProcessingDelay: number;
    };
    logging: {
      level: string;
      enablePerformanceLogs: boolean;
    };
    dexPrograms: {
      [key: string]: {
        programId: string;
        name: string;
        discriminators: {
          [key: string]: number[];
        };
      };
    };
  };
}