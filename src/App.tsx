import React, { useState, useEffect, useRef, SetStateAction } from 'react';
import { TokenTrackingService } from './services/tokenTrackingService.js';
import { Logger } from './services/logger.js';
import './types/services.d.ts';

interface SwapTransaction {
  signature: string;
  blockTime: number;
  slot: number;
  tokenAmount: number;
  solAmount: number;
  buyer: string;
  dex: string;
  tokenMint: string;
}

interface TrackingState {
  isTracking: boolean;
  tokenMint: string;
  startingBlock: number | null;
  transactions: SwapTransaction[];
  status: string;
  error: string | null;
}

function App() {
  const [state, setState] = useState<TrackingState>({
    isTracking: false,
    tokenMint: '',
    startingBlock: null,
    transactions: [],
    status: 'Ready',
    error: null
  });
  
  const [formData, setFormData] = useState({
    tokenMint: '',
    startingBlock: ''
  });
  
  const serviceRef = useRef<TokenTrackingService | null>(null);
  const rateLimitRef = useRef<number>(0);
  const loggerRef = useRef<Logger | null>(null);

  useEffect(() => {
    loggerRef.current = new Logger('info');
  }, []);

  const handleRateLimit = async (): Promise<void> => {
    const now = Date.now();
    const timeSinceLastCall = now - rateLimitRef.current;
    const minInterval = 4000; // 4 seconds
    
    if (timeSinceLastCall < minInterval) {
      const waitTime = minInterval - timeSinceLastCall;
              setState((prev: TrackingState) => ({ ...prev, status: `Rate limiting... waiting ${Math.ceil(waitTime / 1000)}s` }));
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    rateLimitRef.current = Date.now();
  };

  const startTracking = async () => {
    if (!formData.tokenMint.trim()) {
      setState((prev: TrackingState) => ({ ...prev, error: 'Please enter a token mint address' }));
      return;
    }

    try {
      await handleRateLimit();
      
      setState((prev: TrackingState) => ({
        ...prev,
        isTracking: true,
        tokenMint: formData.tokenMint.trim(),
        startingBlock: formData.startingBlock ? parseInt(formData.startingBlock) : null,
        transactions: [],
        status: 'Initializing...',
        error: null
      }));

      serviceRef.current = new TokenTrackingService();
      
      // Setup event listeners for real-time updates
      const originalLog = loggerRef.current?.info;
      if (loggerRef.current) {
        loggerRef.current.info = (message: string, data?: any) => {
          if (originalLog) originalLog.call(loggerRef.current, message, data);
          
          // Parse transaction data from logs
          if (data && data.signature) {
            const transaction: SwapTransaction = {
              signature: data.signature,
              blockTime: data.blockTime || Date.now() / 1000,
              slot: data.slot || 0,
              tokenAmount: data.tokenAmount || 0,
              solAmount: data.solAmount || 0,
              buyer: data.buyer || 'Unknown',
              dex: data.dex || 'Unknown',
              tokenMint: data.tokenMint || state.tokenMint
            };
            
            setState((prev: TrackingState) => ({
              ...prev,
              transactions: [...prev.transactions, transaction],
              status: `Found ${prev.transactions.length + 1} transactions`
            }));
          }
        };
      }

      await handleRateLimit();
      
      const started = await serviceRef.current.start(
        formData.tokenMint.trim(),
        formData.startingBlock ? parseInt(formData.startingBlock) : null
      );
      
      if (!started) {
        throw new Error('Failed to start tracking service');
      }

      setState((prev: TrackingState) => ({ ...prev, status: 'Tracking active...' }));
      
          } catch (error) {
        setState((prev: TrackingState) => ({
          ...prev,
          isTracking: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          status: 'Error'
        }));
      }
  };

  const stopTracking = async () => {
    if (serviceRef.current) {
      await serviceRef.current.stop();
      serviceRef.current = null;
    }
    
    setState((prev: TrackingState) => ({
      ...prev,
      isTracking: false,
      status: 'Stopped'
    }));
  };

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatAmount = (amount: number): string => {
    return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Solana Token Swap Detector
          </h1>
          <p className="text-gray-600">
            Track token buy transactions across multiple DEXes (Jupiter, Orca, Raydium, Lifinity, Serum)
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Token Mint Address *
              </label>
              <input
                type="text"
                value={formData.tokenMint}
                onChange={(e) => setFormData((prev: {tokenMint: string, startingBlock: string}) => ({ ...prev, tokenMint: e.target.value }))}
                placeholder="Enter token mint address (e.g., EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={state.isTracking}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Starting Block Number (optional)
              </label>
              <input
                type="number"
                value={formData.startingBlock}
                onChange={(e) => setFormData((prev: {tokenMint: string, startingBlock: string}) => ({ ...prev, startingBlock: e.target.value }))}
                placeholder="Leave empty to start from current block"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={state.isTracking}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <button
                onClick={startTracking}
                disabled={state.isTracking}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {state.isTracking ? 'Tracking...' : 'Start Tracking'}
              </button>
              <button
                onClick={stopTracking}
                disabled={!state.isTracking}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Stop Tracking
              </button>
            </div>
            <div className="text-sm text-gray-600">
              Status: <span className={`font-medium ${state.error ? 'text-red-600' : 'text-green-600'}`}>
                {state.error || state.status}
              </span>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Detected Transactions ({state.transactions.length})
          </h2>
          
          {state.transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {state.isTracking ? 'Listening for transactions...' : 'No transactions detected yet'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Time</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">DEX</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Token Amount</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">SOL Amount</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Buyer</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {state.transactions.map((tx, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {formatTimestamp(tx.blockTime)}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                          {tx.dex}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {formatAmount(tx.tokenAmount)}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {formatAmount(tx.solAmount)} SOL
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900 font-mono">
                        {tx.buyer.substring(0, 8)}...{tx.buyer.substring(tx.buyer.length - 8)}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 font-mono"
                        >
                          {tx.signature.substring(0, 8)}...{tx.signature.substring(tx.signature.length - 8)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rate Limit Notice */}
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-800">
                <strong>Rate Limiting:</strong> API calls are automatically rate-limited with 4-second delays to prevent hitting RPC limits.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
