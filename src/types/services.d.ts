declare module './services/tokenTrackingService.js' {
  export class TokenTrackingService {
    constructor();
    start(tokenMint: string, startingBlock?: number | null): Promise<boolean>;
    stop(): Promise<void>;
    setupGracefulShutdown(): void;
  }
}

declare module './services/logger.js' {
  export class Logger {
    constructor(level: string);
    info(message: string, data?: any): void;
    error(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    debug(message: string, data?: any): void;
  }
}