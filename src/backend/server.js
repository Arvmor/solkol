import express from 'express';
import cors from 'cors';
import { TokenTrackingService } from '../services/tokenTrackingService.js';
import { Logger } from '../services/logger.js';
import { config } from '../config/index.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Store active tracking sessions
const activeSessions = new Map();
const logger = new Logger(config.logging.level);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start token tracking
app.post('/api/track', async (req, res) => {
  try {
    const { tokenAddress, blockNumber } = req.body;
    
    if (!tokenAddress) {
      return res.status(400).json({ error: 'Token address is required' });
    }

    const sessionId = Date.now().toString();
    
    // Create new tracking service instance
    const service = new TokenTrackingService();
    
    // Store session
    activeSessions.set(sessionId, {
      service,
      startTime: Date.now(),
      tokenAddress,
      blockNumber: blockNumber || null,
      status: 'starting'
    });

    // Start tracking in background
    service.start(tokenAddress, blockNumber).then(success => {
      const session = activeSessions.get(sessionId);
      if (session) {
        session.status = success ? 'running' : 'error';
        if (!success) {
          session.error = 'Failed to start tracking service';
        }
      }
    }).catch(error => {
      const session = activeSessions.get(sessionId);
      if (session) {
        session.status = 'error';
        session.error = error.message;
      }
      logger.error('Error starting tracking service', { sessionId, error: error.message });
    });

    // Update status to running immediately after service initialization
    // The service.start() promise won't resolve until the service stops, so we need to update status here
    setTimeout(() => {
      const session = activeSessions.get(sessionId);
      if (session && session.status === 'starting') {
        session.status = 'running';
        logger.info('Session status updated to running', { sessionId });
      }
    }, 1000); // Give the service 1 second to initialize

    res.json({ 
      sessionId,
      status: 'starting',
      message: 'Token tracking started'
    });

  } catch (error) {
    logger.error('Error in /api/track', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tracking progress and results
app.get('/api/track/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { service, status, error } = session;
    
    if (status === 'error') {
      return res.json({
        sessionId,
        status: 'error',
        error: error || 'Unknown error'
      });
    }

    if (status === 'starting') {
      // Even if status is starting, check if the service has found any buys
      const progress = service.buyTracker.getProgress();
      const buys = service.buyTracker.getDetectedBuys();
      
      // If we have buys, update status to running
      if (buys.length > 0) {
        session.status = 'running';
        logger.info('Session status updated to running due to found buys', { sessionId, buyCount: buys.length });
      }
      
      return res.json({
        sessionId,
        status: buys.length > 0 ? 'running' : 'starting',
        progress,
        buyers: buys,
        isComplete: progress.isComplete
      });
    }

    // Get current progress and results
    const progress = service.buyTracker.getProgress();
    const buys = service.buyTracker.getDetectedBuys();
    const stats = service.getStats();

    res.json({
      sessionId,
      status: 'running',
      progress,
      buyers: buys,
      stats,
      isComplete: progress.isComplete
    });

  } catch (error) {
    logger.error('Error in /api/track/:sessionId', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Stop tracking session
app.delete('/api/track/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Stop the service
    session.service.stop();
    
    // Remove session
    activeSessions.delete(sessionId);
    
    res.json({ 
      sessionId,
      status: 'stopped',
      message: 'Tracking stopped'
    });

  } catch (error) {
    logger.error('Error in DELETE /api/track/:sessionId', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all active sessions
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = Array.from(activeSessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      tokenAddress: session.tokenAddress,
      blockNumber: session.blockNumber,
      status: session.status,
      startTime: session.startTime,
      runtime: Date.now() - session.startTime
    }));

    res.json({ sessions });

  } catch (error) {
    logger.error('Error in /api/sessions', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.startTime > maxAge) {
      logger.info('Cleaning up old session', { sessionId, age: now - session.startTime });
      session.service.stop();
      activeSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down server...');
  
  // Stop all active sessions
  for (const [sessionId, session] of activeSessions.entries()) {
    session.service.stop();
  }
  activeSessions.clear();
  
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  logger.info(`Backend API server running on port ${PORT}`);
  logger.info('Available endpoints:');
  logger.info('  POST /api/track - Start token tracking');
  logger.info('  GET /api/track/:sessionId - Get tracking progress');
  logger.info('  DELETE /api/track/:sessionId - Stop tracking');
  logger.info('  GET /api/sessions - List active sessions');
  logger.info('  GET /api/health - Health check');
});

export default app; 