import { useState, useRef, useEffect } from 'react';
import { ApiService } from './services/apiService.js';

interface BuyerAddress {
  address: string;
  tokenAmount: number;
  solAmount: number;
  signature: string;
  timestamp: number;
  dex?: string;
  targetToken?: string;
  tokenSold?: string;
  amountBought?: string;
  amountSold?: string;
  decimalsTarget?: number;
  decimalsSold?: number;
  instructionType?: string;
  programId?: string;
  slot?: number;
  buyNumber?: number;
  buyer?: string;
  pricePerToken?: string;
  confidence?: string;
}

interface SearchData {
  id: string;
  sessionId: string;
  tokenAddress: string;
  blockNumber: number;
  buyers: BuyerAddress[];
  timestamp: number;
  isLoading: boolean;
  error?: string;
  progress?: {
    current: number;
    target: number;
    percentage: string;
    isComplete: boolean;
  };
}

function App() {
  const [searches, setSearches] = useState<SearchData[]>([]);
  const [tokenInput, setTokenInput] = useState('');
  const [blockInput, setBlockInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  
  const apiService = useRef<ApiService | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  // Initialize API service and check backend connection
  useEffect(() => {
    if (!apiService.current) {
      apiService.current = new ApiService();
    }
    
    // Check backend health
    checkBackendHealth();
    
    // Cleanup on unmount
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);

  const checkBackendHealth = async () => {
    try {
      setBackendStatus('checking');
      await apiService.current?.healthCheck();
      setBackendStatus('connected');
    } catch (error) {
      console.error('Backend health check failed:', error);
      setBackendStatus('disconnected');
    }
  };

  // Get all unique addresses and their occurrences across searches
  const getAllAddresses = () => {
    const addressCounts = new Map<string, { count: number; tokens: string[] }>();
    
    searches.forEach(search => {
      const tokenShort = `${search.tokenAddress.slice(0, 8)}...`;
      search.buyers.forEach((buyer: BuyerAddress) => {
        const address = buyer.buyer || buyer.address;
        const current = addressCounts.get(address);
        if (current) {
          current.count += 1;
          if (!current.tokens.includes(tokenShort)) {
            current.tokens.push(tokenShort);
          }
        } else {
          addressCounts.set(address, { count: 1, tokens: [tokenShort] });
        }
      });
    });
    
    return addressCounts;
  };

  const addressCounts = getAllAddresses();

  // Start progress monitoring
  const startProgressMonitoring = (sessionId: string, searchId: string) => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }
    
    progressInterval.current = setInterval(async () => {
      if (!apiService.current) return;
      
      try {
        const response = await apiService.current.getTrackingProgress(sessionId);
        
        setSearches(prev => prev.map(search => {
          if (search.id === searchId) {
            const convertedBuys = response.buyers ? response.buyers.map((buy: any) => 
              apiService.current!.convertBuyData(buy)
            ) : [];
            
            return {
              ...search,
              buyers: convertedBuys,
              progress: response.progress,
              isLoading: response.status === 'running' || response.status === 'starting',
              error: response.status === 'error' ? response.error : undefined
            };
          }
          return search;
        }));
        
        // Stop monitoring if complete or error
        if (response.status === 'error' || response.isComplete) {
          clearInterval(progressInterval.current!);
          setIsLoading(false);
          setServiceStatus(response.status === 'error' ? 'error' : 'idle');
        }
      } catch (error) {
        console.error('Error getting tracking progress:', error);
        setSearches(prev => prev.map(search => 
          search.id === searchId 
            ? { ...search, isLoading: false, error: 'Failed to get progress' }
            : search
        ));
        clearInterval(progressInterval.current!);
        setIsLoading(false);
        setServiceStatus('error');
      }
    }, 2000); // Update every 2 seconds
  };

  const handleSearch = async () => {
    if (!tokenInput.trim() || !blockInput.trim()) {
      setError('Please enter both token address and block number');
      return;
    }

    if (!apiService.current) {
      setError('API service not initialized');
      return;
    }

    if (backendStatus !== 'connected') {
      setError('Backend server is not connected. Please start the backend server.');
      return;
    }

    setError(null);
    setIsLoading(true);
    setServiceStatus('running');

    const searchId = Date.now().toString();

    const newSearch: SearchData = {
      id: searchId,
      sessionId: '',
      tokenAddress: tokenInput.trim(),
      blockNumber: parseInt(blockInput),
      buyers: [],
      timestamp: Date.now(),
      isLoading: true,
      progress: { current: 0, target: 100, percentage: '0.0', isComplete: false }
    };

    setSearches(prev => [newSearch, ...prev]);

    try {
      // Start the token tracking via API
      const response = await apiService.current.startTracking(
        tokenInput.trim(),
        parseInt(blockInput)
      );

      // Update search with session ID
      setSearches(prev => prev.map(search => 
        search.id === searchId 
          ? { ...search, sessionId: response.sessionId }
          : search
      ));

      // Start monitoring progress
      startProgressMonitoring(response.sessionId, searchId);

    } catch (error) {
      console.error('Error starting token tracking:', error);
      setError(error instanceof Error ? error.message : 'Failed to start token tracking');
      setIsLoading(false);
      setServiceStatus('error');
      
      // Update the search with error state
      setSearches(prev => prev.map(search => 
        search.id === searchId 
          ? { ...search, isLoading: false, error: 'Failed to start tracking' }
          : search
      ));
    }
  };

  const stopTracking = async () => {
    // Stop all active sessions
    for (const search of searches) {
      if (search.sessionId && search.isLoading) {
        try {
          await apiService.current?.stopTracking(search.sessionId);
        } catch (error) {
          console.error('Error stopping session:', error);
        }
      }
    }

    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }
    setIsLoading(false);
    setServiceStatus('idle');
  };

  const formatAddress = (address: string) => {
    if (!address) return 'Unknown';
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  const formatAmount = (amount: string | number, decimals: number = 9) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return (num / Math.pow(10, decimals)).toFixed(4);
  };

  const isAddressDuplicate = (address: string) => {
    const addressCounts = getAllAddresses();
    const info = addressCounts.get(address);
    return info ? info.count > 1 : false;
  };

  const clearAllSearches = () => {
    setSearches([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Token Buyer Address Tracker
          </h1>
          <p className="text-gray-600">
            Track real token buyer addresses by token and block number. Duplicate addresses across different tokens are highlighted.
          </p>
          <div className="mt-4 flex justify-center gap-4">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              serviceStatus === 'running' ? 'bg-green-100 text-green-800' :
              serviceStatus === 'error' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              Status: {serviceStatus === 'running' ? 'Tracking' : serviceStatus === 'error' ? 'Error' : 'Ready'}
            </span>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              backendStatus === 'connected' ? 'bg-green-100 text-green-800' :
              backendStatus === 'disconnected' ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              Backend: {backendStatus === 'connected' ? 'Connected' : backendStatus === 'disconnected' ? 'Disconnected' : 'Checking...'}
            </span>
          </div>
        </div>

        {/* Backend Connection Warning */}
        {backendStatus === 'disconnected' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Backend Server Not Connected
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>Please start the backend server by running:</p>
                  <code className="bg-red-100 px-2 py-1 rounded mt-1 inline-block">npm run api:dev</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search Form */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Token Address *
              </label>
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Enter token mint address"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading || backendStatus !== 'connected'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Starting Block Number *
              </label>
              <input
                type="number"
                value={blockInput}
                onChange={(e) => setBlockInput(e.target.value)}
                placeholder="Enter block number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading || backendStatus !== 'connected'}
              />
            </div>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={handleSearch}
              disabled={isLoading || backendStatus !== 'connected'}
              className={`px-6 py-2 rounded-md font-medium ${
                isLoading || backendStatus !== 'connected'
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isLoading ? 'Tracking...' : 'Start Tracking'}
            </button>
            
            {isLoading && (
              <button
                onClick={stopTracking}
                className="px-6 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700"
              >
                Stop Tracking
              </button>
            )}
            
            {searches.length > 0 && (
              <button
                onClick={clearAllSearches}
                className="px-6 py-2 bg-gray-600 text-white rounded-md font-medium hover:bg-gray-700"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Duplicate Addresses Summary */}
        {addressCounts.size > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Duplicate Addresses Summary
            </h3>
            <div className="grid gap-2">
              {Array.from(addressCounts.entries())
                .filter(([_, info]) => info.count > 1)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([address, info]) => (
                  <div key={address} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <span className="font-mono text-sm">{formatAddress(address)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        {info.count} buys across {info.tokens.join(', ')}
                      </span>
                    </div>
                  </div>
                ))}
              {Array.from(addressCounts.entries()).filter(([_, info]) => info.count > 1).length === 0 && (
                <p className="text-gray-500 text-sm">No duplicate addresses found yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Search Results */}
        <div className="space-y-6">
          {searches.map(search => (
            <div key={search.id} className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Token: {formatAddress(search.tokenAddress)}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Block: {search.blockNumber.toLocaleString()} • Started: {new Date(search.timestamp).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  {search.isLoading && (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm text-gray-600">Tracking...</span>
                    </div>
                  )}
                  {search.error && (
                    <span className="text-sm text-red-600">Error: {search.error}</span>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {search.progress && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progress: {search.progress.current}/{search.progress.target}</span>
                    <span>{search.progress.percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${search.progress.percentage}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="text-sm text-gray-600 mb-4">
                Found {search.buyers.length} buyer{search.buyers.length !== 1 ? 's' : ''}
              </div>

              {search.buyers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Buy #</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Buyer Address</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Token Amount</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Amount Sold</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">DEX</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Price</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Signature</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Time</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {search.buyers.map((buyer, index) => (
                        <tr 
                          key={index} 
                          className={`border-t ${isAddressDuplicate(buyer.buyer || buyer.address) ? 'bg-yellow-50' : ''}`}
                        >
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {buyer.buyNumber || index + 1}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">{formatAddress(buyer.buyer || buyer.address)}</span>
                              {isAddressDuplicate(buyer.buyer || buyer.address) && (
                                <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                                  Duplicate
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {formatAmount(buyer.amountBought || buyer.tokenAmount, buyer.decimalsTarget)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {formatAmount(buyer.amountSold || buyer.solAmount, buyer.decimalsSold)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                              buyer.confidence === 'high' ? 'bg-green-100 text-green-800' :
                              buyer.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {buyer.dex || 'Unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {buyer.pricePerToken ? parseFloat(buyer.pricePerToken).toFixed(6) : 'N/A'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            <a 
                              href={`https://solscan.io/tx/${buyer.signature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-mono"
                            >
                              {buyer.signature.slice(0, 8)}...
                            </a>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {new Date(buyer.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  {search.isLoading ? 'Searching for buyers...' : 'No buyers found for this token and block range.'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
