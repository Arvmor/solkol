export class Logger {
  constructor(level = 'info') {
    this.level = level;
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  log(level, message, data = null) {
    if (this.levels[level] <= this.levels[this.level]) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level,
        message,
        ...(data && { data })
      };
      console.log(JSON.stringify(logEntry));
    }
  }

  error(message, data) {
    this.log('error', message, data);
  }

  warn(message, data) {
    this.log('warn', message, data);
  }

  info(message, data) {
    this.log('info', message, data);
  }

  debug(message, data) {
    this.log('debug', message, data);
  }

  logSwap(swapData) {
    this.log('info', 'SWAP_DETECTED', swapData);
  }

  logPerformance(operation, duration, additionalData = {}) {
    this.log('debug', `PERFORMANCE_${operation}`, {
      duration_ms: duration,
      ...additionalData
    });
  }
}