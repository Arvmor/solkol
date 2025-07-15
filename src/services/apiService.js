// Frontend API service for communicating with backend
const API_BASE_URL = 'http://localhost:3001/api';

export class ApiService {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const response = await fetch(url, {
      ...defaultOptions,
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Start token tracking
  async startTracking(tokenAddress, blockNumber = null) {
    return this.makeRequest('/track', {
      method: 'POST',
      body: JSON.stringify({
        tokenAddress,
        blockNumber: blockNumber !== null ? parseInt(blockNumber) : null
      })
    });
  }

  // Get tracking progress and results
  async getTrackingProgress(sessionId) {
    return this.makeRequest(`/track/${sessionId}`);
  }

  // Stop tracking session
  async stopTracking(sessionId) {
    return this.makeRequest(`/track/${sessionId}`, {
      method: 'DELETE'
    });
  }

  // Get all active sessions
  async getActiveSessions() {
    return this.makeRequest('/sessions');
  }

  // Health check
  async healthCheck() {
    return this.makeRequest('/health');
  }

  // Convert backend buy data to frontend format
  convertBuyData(buy) {
    return {
      address: buy.buyer || 'unknown',
      tokenAmount: parseFloat(buy.amountBought || '0'),
      solAmount: parseFloat(buy.amountSold || '0'),
      signature: buy.txHash || '',
      timestamp: buy.timestamp * 1000, // Convert to milliseconds
      dex: buy.dex,
      targetToken: buy.targetToken,
      tokenSold: buy.tokenSold,
      amountBought: buy.amountBought,
      amountSold: buy.amountSold,
      decimalsTarget: buy.decimalsTarget,
      decimalsSold: buy.decimalsSold,
      instructionType: buy.instructionType,
      programId: buy.programId,
      slot: buy.slot,
      buyNumber: buy.buyNumber,
      buyer: buy.buyer,
      pricePerToken: buy.pricePerToken,
      confidence: buy.confidence,
    };
  }
} 