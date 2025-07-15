/**
 * Shared shutdown utilities
 */

/**
 * Sets up graceful shutdown handlers for a service
 * @param {Object} service - The service instance with a stop() method
 * @param {Object} logger - The logger instance
 * @param {Function} onShutdown - Optional callback to run before shutdown
 */
export function setupGracefulShutdown(service, logger, onShutdown = null) {
  const shutdown = () => {
    logger.info('Received shutdown signal, stopping service...');
    
    if (onShutdown) {
      onShutdown();
    }
    
    service.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    shutdown();
  });
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
  });
} 