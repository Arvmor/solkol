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
  isFromCache?: boolean;
  lastUpdated?: number;
}

// Storage keys
const STORAGE_KEY = 'token_tracker_searches';
const CACHE_EXPIRY_DAYS = 7; // Cache results for 7 days

function App() {
  const [searches, setSearches] = useState<SearchData[]>([]);
  const [tokenInput, setTokenInput] = useState('');
  const [blockInput, setBlockInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [expandedSearches, setExpandedSearches] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'timestamp' | 'buyCount' | 'tokenAddress'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const apiService = useRef<ApiService | null>(null);
  const globalProgressInterval = useRef<NodeJS.Timeout | null>(null);
  const searchesRef = useRef<SearchData[]>([]);

  // Keep searchesRef in sync with searches state
  useEffect(() => {
    searchesRef.current = searches;
  }, [searches]);

  // Load saved searches from localStorage on component mount
  useEffect(() => {
    loadSavedSearches();
  }, []);

  // Save searches to localStorage whenever searches state changes
  useEffect(() => {
    saveSearchesToStorage();
  }, [searches]);

  // Initialize API service and check backend connection
  useEffect(() => {
    if (!apiService.current) {
      apiService.current = new ApiService();
    }
    
    // Check backend health
    checkBackendHealth();
    
    // Start global progress monitoring
    startGlobalProgressMonitoring();
    
    // Cleanup on unmount
    return () => {
      if (globalProgressInterval.current) {
        clearInterval(globalProgressInterval.current);
      }
    };
  }, []);

  // Save searches to localStorage
  const saveSearchesToStorage = () => {
    try {
      const searchesToSave = searches.map(search => ({
        ...search,
        // Don't save sessionId for completed searches as they're not needed
        sessionId: search.isLoading ? search.sessionId : '',
        // Add cache metadata
        lastUpdated: Date.now()
      }));
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(searchesToSave));
    } catch (error) {
      console.warn('Failed to save searches to localStorage:', error);
    }
  };

  // Load saved searches from localStorage
  const loadSavedSearches = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsedSearches = JSON.parse(saved);
        
        // Filter out expired cache entries
        const now = Date.now();
        const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        
        const validSearches = parsedSearches.filter((search: SearchData) => {
          if (!search.lastUpdated) return false;
          return (now - search.lastUpdated) < expiryMs;
        });

        // Mark all loaded searches as from cache and not loading
        const processedSearches = validSearches.map((search: SearchData) => ({
          ...search,
          isFromCache: true,
          isLoading: false,
          sessionId: '', // Clear sessionId for cached searches
          progress: search.progress ? { ...search.progress, isComplete: true } : undefined
        }));

        setSearches(processedSearches);
        
        // Clean up expired entries
        if (validSearches.length !== parsedSearches.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(validSearches));
        }
      }
    } catch (error) {
      console.warn('Failed to load searches from localStorage:', error);
    }
  };

  // Check if a search already exists for the given token and block
  const findExistingSearch = (tokenAddress: string, blockNumber: number): SearchData | null => {
    return searches.find(search => 
      search.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && 
      search.blockNumber === blockNumber
    ) || null;
  };

  // Clear expired cache entries
  const clearExpiredCache = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsedSearches = JSON.parse(saved);
        const now = Date.now();
        const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        
        const validSearches = parsedSearches.filter((search: SearchData) => {
          if (!search.lastUpdated) return false;
          return (now - search.lastUpdated) < expiryMs;
        });

        if (validSearches.length !== parsedSearches.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(validSearches));
          const clearedCount = parsedSearches.length - validSearches.length;
          setError(`✅ Cleared ${clearedCount} expired cache entries`);
          setTimeout(() => setError(null), 3000);
          console.log(`Cleared ${clearedCount} expired cache entries`);
        } else {
          setError('ℹ️ No expired cache entries to clear');
          setTimeout(() => setError(null), 3000);
        }
      }
    } catch (error) {
      console.warn('Failed to clear expired cache:', error);
      setError('❌ Failed to clear expired cache');
      setTimeout(() => setError(null), 3000);
    }
  };

  // Export cached data
  const exportCachedData = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `token-tracker-cache-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setError('✅ Cache data exported successfully');
        setTimeout(() => setError(null), 3000);
      } else {
        setError('ℹ️ No cache data to export');
        setTimeout(() => setError(null), 3000);
      }
    } catch (error) {
      console.warn('Failed to export cache data:', error);
      setError('❌ Failed to export cache data');
      setTimeout(() => setError(null), 3000);
    }
  };

  // Import cached data from JSON file
  const importCachedData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = JSON.parse(content);
        
        // Validate the imported data structure
        if (!Array.isArray(importedData)) {
          setError('❌ Invalid cache file format: Expected an array of search data');
          setTimeout(() => setError(null), 5000);
          return;
        }

        // Validate each search entry
        const validSearches = importedData.filter((search: any) => {
          return search && 
                 typeof search === 'object' &&
                 search.tokenAddress &&
                 typeof search.blockNumber === 'number' &&
                 Array.isArray(search.buyers);
        });

        if (validSearches.length === 0) {
          setError('❌ No valid search data found in the imported file');
          setTimeout(() => setError(null), 5000);
          return;
        }

        if (validSearches.length !== importedData.length) {
          console.warn(`Imported ${importedData.length} searches, but only ${validSearches.length} were valid`);
        }

        // Process imported searches
        const processedSearches = validSearches.map((search: any) => ({
          ...search,
          id: search.id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
          isFromCache: true,
          isLoading: false,
          sessionId: '', // Clear sessionId for imported searches
          progress: search.progress ? { ...search.progress, isComplete: true } : undefined,
          lastUpdated: search.lastUpdated || Date.now()
        }));

        // Merge with existing searches, avoiding duplicates
        setSearches(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const newSearches = processedSearches.filter(s => !existingIds.has(s.id));
          
          if (newSearches.length === 0) {
            setError('ℹ️ All imported searches already exist in cache');
            setTimeout(() => setError(null), 3000);
            return prev;
          }

          const merged = [...newSearches, ...prev];
          setError(`✅ Successfully imported ${newSearches.length} searches from cache file`);
          setTimeout(() => setError(null), 3000);
          return merged;
        });

      } catch (error) {
        console.warn('Failed to import cache data:', error);
        setError('❌ Failed to parse cache file. Please ensure it\'s a valid JSON file.');
        setTimeout(() => setError(null), 5000);
      }
    };

    reader.onerror = () => {
      setError('❌ Failed to read the selected file');
      setTimeout(() => setError(null), 3000);
    };

    reader.readAsText(file);
    
    // Reset the file input
    event.target.value = '';
  };

  // Refresh a cached search by removing it and starting a new search
  const refreshCachedSearch = async (search: SearchData) => {
    if (!apiService.current || backendStatus !== 'connected') {
      setError('Cannot refresh: Backend not connected');
      return;
    }

    // Remove the cached search
    setSearches(prev => prev.filter(s => s.id !== search.id));
    
    // Set inputs to the search values
    setTokenInput(search.tokenAddress);
    setBlockInput(search.blockNumber.toString());
    
    // Start a new search
    setError(null);
    setIsLoading(true);
    setServiceStatus('running');

    const searchId = Date.now().toString();

    const newSearch: SearchData = {
      id: searchId,
      sessionId: '',
      tokenAddress: search.tokenAddress,
      blockNumber: search.blockNumber,
      buyers: [],
      timestamp: Date.now(),
      isLoading: true,
      progress: { current: 0, target: 1000, percentage: '0.0', isComplete: false }
    };

    setSearches(prev => [newSearch, ...prev]);

    try {
      // Start the token tracking via API
      const response = await apiService.current.startTracking(
        search.tokenAddress,
        search.blockNumber
      );

      // Update search with session ID
      setSearches(prev => prev.map(s => 
        s.id === searchId 
          ? { ...s, sessionId: response.sessionId }
          : s
      ));

      // Restart global progress monitoring to ensure it's running
      startGlobalProgressMonitoring();

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start tracking');
      setSearches(prev => prev.map(s => 
        s.id === searchId 
          ? { ...s, isLoading: false, error: 'Failed to start tracking' }
          : s
      ));
      setIsLoading(false);
      setServiceStatus('error');
    }
  };

  const checkBackendHealth = async () => {
    try {
      setBackendStatus('checking');
      await apiService.current?.healthCheck();
      setBackendStatus('connected');
    } catch (error) {
      setBackendStatus('disconnected');
    }
  };

  // Get all unique addresses and their occurrences across searches
  const getAllAddresses = () => {
    const addressCounts = new Map<string, { count: number; tokens: string[] }>();
    
    searches.forEach(search => {
      const tokenShort = `${search.tokenAddress.slice(0, 8)}...`;
      const uniqueBuyersInSearch = new Set<string>();
      
      // First, collect unique buyers within this search (same token)
      search.buyers.forEach((buyer: BuyerAddress) => {
        const address = buyer.buyer || buyer.address;
        uniqueBuyersInSearch.add(address);
      });
      
      // Then, count each unique buyer from this search across all searches
      uniqueBuyersInSearch.forEach(address => {
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

  // Calculate statistics for a search
  const getSearchStats = (search: SearchData) => {
    const totalVolume = search.buyers.reduce((sum, buyer) => {
      const amount = parseFloat(buyer.amountSold || buyer.solAmount?.toString() || '0');
      return sum + amount;
    }, 0);

    const avgPrice = search.buyers.reduce((sum, buyer) => {
      const price = parseFloat(buyer.pricePerToken || '0');
      return sum + price;
    }, 0) / Math.max(search.buyers.length, 1);

    const dexCounts = search.buyers.reduce((counts, buyer) => {
      const dex = buyer.dex || 'Unknown';
      counts[dex] = (counts[dex] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const topDex = Object.entries(dexCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      totalVolume,
      avgPrice,
      topDex: topDex ? { name: topDex[0], count: topDex[1] } : null,
      uniqueBuyers: new Set(search.buyers.map(b => b.buyer || b.address)).size
    };
  };

  // Toggle search expansion
  const toggleSearchExpansion = (searchId: string) => {
    setExpandedSearches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(searchId)) {
        newSet.delete(searchId);
      } else {
        newSet.add(searchId);
      }
      return newSet;
    });
  };

  // Sort searches
  const getSortedSearches = () => {
    return [...searches].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'timestamp':
          comparison = a.timestamp - b.timestamp;
          break;
        case 'buyCount':
          comparison = a.buyers.length - b.buyers.length;
          break;
        case 'tokenAddress':
          comparison = a.tokenAddress.localeCompare(b.tokenAddress);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  // Start global progress monitoring for all active sessions
  const startGlobalProgressMonitoring = () => {
    if (globalProgressInterval.current) {
      clearInterval(globalProgressInterval.current);
    }
    
    globalProgressInterval.current = setInterval(async () => {
      if (!apiService.current) return;
      
      // Get all active sessions that need monitoring using the ref
      const currentSearches = searchesRef.current;
      const activeSearches = currentSearches.filter(search => 
        search.isLoading && search.sessionId && !search.error
      );
      
      if (activeSearches.length === 0) {
        // No active sessions, update service status
        setServiceStatus('idle');
        return;
      }
      
      // Update service status to running if we have active sessions
      setServiceStatus('running');
      
      // Monitor each active session
      const updatePromises = activeSearches.map(async (search) => {
        try {
          const response = await apiService.current!.getTrackingProgress(search.sessionId);
          
          const convertedBuys = response.buyers ? response.buyers.map((buy: any) => 
            apiService.current!.convertBuyData(buy)
          ) : [];
          
          return {
            searchId: search.id,
            data: {
              buyers: convertedBuys,
              progress: response.progress,
              isLoading: response.status === 'running' || response.status === 'starting',
              error: response.status === 'error' ? response.error : undefined,
              isComplete: response.isComplete
            }
          };
        } catch (error) {
          // Handle 404 (session not found) as completion
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('404') || errorMessage.includes('Session not found')) {
            return {
              searchId: search.id,
              data: {
                isLoading: false,
                isComplete: true,
                error: 'Session completed or stopped'
              }
            };
          }
          
          return {
            searchId: search.id,
            data: {
              isLoading: false,
              error: 'Failed to get progress'
            }
          };
        }
      });
      
      // Wait for all updates to complete
      Promise.all(updatePromises).then(updates => {
        console.log('Progress updates received:', updates);
        
        setSearches(prev => prev.map(search => {
          const update = updates.find(u => u.searchId === search.id);
          if (update) {
            const updatedSearch = {
              ...search,
              ...update.data
            };
            
            // If session is complete or has error, mark it as not loading
            if (update.data.isComplete || update.data.error) {
              updatedSearch.isLoading = false;
              console.log(`Session ${search.id} marked as complete/error:`, update.data);
            }
            
            return updatedSearch;
          }
          return search;
        }));
        
        // Check if any sessions are still active using the ref
        const stillActive = searchesRef.current.some(search => search.isLoading);
        console.log('Still active sessions:', stillActive);
        if (!stillActive) {
          setServiceStatus('idle');
        }
      });
      
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

    const tokenAddress = tokenInput.trim();
    const blockNumber = parseInt(blockInput);

    // Check if we already have results for this token and block
    const existingSearch = findExistingSearch(tokenAddress, blockNumber);
    
    if (existingSearch) {
      // If we have cached results, show them and expand the search
      setExpandedSearches(prev => new Set([...prev, existingSearch.id]));
      setError('✅ Results loaded from cache! This search was previously completed.');
      // Clear the error after 3 seconds
      setTimeout(() => setError(null), 3000);
      return;
    }

    setError(null);
    setIsLoading(true);
    setServiceStatus('running');

    const searchId = Date.now().toString();

    const newSearch: SearchData = {
      id: searchId,
      sessionId: '',
      tokenAddress: tokenAddress,
      blockNumber: blockNumber,
      buyers: [],
      timestamp: Date.now(),
      isLoading: true,
      progress: { current: 0, target: 1000, percentage: '0.0', isComplete: false }
    };

    setSearches(prev => [newSearch, ...prev]);

    try {
      // Start the token tracking via API
      const response = await apiService.current.startTracking(
        tokenAddress,
        blockNumber
      );

      // Update search with session ID
      setSearches(prev => prev.map(search => 
        search.id === searchId 
          ? { ...search, sessionId: response.sessionId }
          : search
      ));

      // Restart global progress monitoring to ensure it's running
      startGlobalProgressMonitoring();

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start tracking');
      setSearches(prev => prev.map(search => 
        search.id === searchId 
          ? { ...search, isLoading: false, error: 'Failed to start tracking' }
          : search
      ));
      setIsLoading(false);
      setServiceStatus('error');
    }
  };

  const stopTracking = async () => {
    if (!apiService.current) return;

    try {
      // Stop all active sessions
      for (const search of searches) {
        if (search.isLoading && search.sessionId) {
          await apiService.current.stopTracking(search.sessionId);
        }
      }

      // Clear global progress monitoring
      if (globalProgressInterval.current) {
        clearInterval(globalProgressInterval.current);
      }

      // Update all searches to not loading
      setSearches(prev => prev.map(search => ({ ...search, isLoading: false })));

      setIsLoading(false);
      setServiceStatus('idle');
    } catch (error) {
      // Error stopping tracking
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  const formatAmount = (amount: string | number, decimals: number = 9) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return (num / Math.pow(10, decimals)).toFixed(4);
  };

  const isAddressDuplicate = (address: string) => {
    const count = addressCounts.get(address);
    return count ? count.tokens.length > 1 : false;
  };

  const clearAllSearches = () => {
    // Clear global progress monitoring
    if (globalProgressInterval.current) {
      clearInterval(globalProgressInterval.current);
    }
    
    // Clear localStorage
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
    
    setSearches([]);
    setExpandedSearches(new Set());
    setServiceStatus('idle');
  };

  const sortedSearches = getSortedSearches();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🚀 Token Transaction Tracker
          </h1>
          <p className="text-gray-600 text-lg">
            Track any transaction involving a token by token address and block number. Any transaction with the target token is counted as a buyer address.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
              serviceStatus === 'running' ? 'bg-green-100 text-green-800 border border-green-200' :
              serviceStatus === 'error' ? 'bg-red-100 text-red-800 border border-red-200' :
              'bg-gray-100 text-gray-800 border border-gray-200'
            }`}>
              <div className={`w-2 h-2 rounded-full mr-2 ${
                serviceStatus === 'running' ? 'bg-green-500 animate-pulse' :
                serviceStatus === 'error' ? 'bg-red-500' :
                'bg-gray-500'
              }`}></div>
              Status: {serviceStatus === 'running' ? 'Tracking' : serviceStatus === 'error' ? 'Error' : 'Ready'}
            </span>
            <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
              backendStatus === 'connected' ? 'bg-green-100 text-green-800 border border-green-200' :
              backendStatus === 'disconnected' ? 'bg-red-100 text-red-800 border border-red-200' :
              'bg-yellow-100 text-yellow-800 border border-yellow-200'
            }`}>
              <div className={`w-2 h-2 rounded-full mr-2 ${
                backendStatus === 'connected' ? 'bg-green-500' :
                backendStatus === 'disconnected' ? 'bg-red-500' :
                'bg-yellow-500 animate-pulse'
              }`}></div>
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

        {/* Cache Information */}
        {searches.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Smart Caching Enabled
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>Search results are automatically saved and retrieved from your browser's cache. 
                  If you search for the same token and block number again, results will be loaded instantly. 
                  Cache expires after {CACHE_EXPIRY_DAYS} days.</p>
                  <p className="mt-1 text-xs text-blue-600">
                    💡 <strong>Import Tip:</strong> You can import cache files using the "Import Cache" button. 
                    There's a sample cache file available in the <code className="bg-blue-100 px-1 rounded">exports/</code> folder.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                isLoading || backendStatus !== 'connected'
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              }`}
            >
              {isLoading ? '🔄 Tracking...' : '🚀 Start Tracking'}
            </button>
            
            {isLoading && (
              <button
                onClick={stopTracking}
                className="px-6 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700 shadow-sm transition-colors"
              >
                ⏹️ Stop Tracking
              </button>
            )}
            
            {searches.length > 0 && (
              <>
                <button
                  onClick={startGlobalProgressMonitoring}
                  className="px-6 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 shadow-sm transition-colors"
                >
                  🔄 Refresh Progress
                </button>
                <button
                  onClick={clearExpiredCache}
                  className="px-6 py-2 bg-orange-600 text-white rounded-md font-medium hover:bg-orange-700 shadow-sm transition-colors"
                >
                  🧹 Clear Expired Cache
                </button>
                <button
                  onClick={exportCachedData}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 shadow-sm transition-colors"
                >
                  📤 Export Cache
                </button>
                <label className="px-6 py-2 bg-purple-600 text-white rounded-md font-medium hover:bg-purple-700 shadow-sm transition-colors cursor-pointer">
                  📥 Import Cache
                  <input
                    type="file"
                    accept=".json"
                    onChange={importCachedData}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={clearAllSearches}
                  className="px-6 py-2 bg-gray-600 text-white rounded-md font-medium hover:bg-gray-700 shadow-sm transition-colors"
                >
                  🗑️ Clear All
                </button>
              </>
            )}
          </div>
        </div>

        {/* Overall Statistics */}
        {searches.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Total Processes</p>
                  <p className="text-2xl font-bold text-gray-900">{searches.length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Total Transactions</p>
                  <p className="text-2xl font-bold text-gray-900">{searches.reduce((sum, search) => sum + search.buyers.length, 0)}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Unique Buyers</p>
                  <p className="text-2xl font-bold text-gray-900">{addressCounts.size}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Cross-Token Buyers</p>
                  <p className="text-2xl font-bold text-gray-900">{Array.from(addressCounts.values()).filter(info => info.tokens.length > 1).length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Active Processes</p>
                  <p className="text-2xl font-bold text-gray-900">{searches.filter(s => s.isLoading).length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Cached Results</p>
                  <p className="text-2xl font-bold text-gray-900">{searches.filter(s => s.isFromCache).length}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Duplicate Addresses Summary */}
        {addressCounts.size > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 text-yellow-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Cross-Token Duplicate Addresses
            </h3>
            <div className="grid gap-2">
              {Array.from(addressCounts.entries())
                .filter(([_, info]) => info.tokens.length > 1)
                .sort((a, b) => b[1].tokens.length - a[1].tokens.length)
                .map(([address, info]) => (
                  <div key={address} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <span className="font-mono text-sm">{formatAddress(address)}</span>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                        {info.tokens.length} tokens
                      </span>
                      <span className="text-sm text-gray-600">
                        across {info.tokens.join(', ')}
                      </span>
                    </div>
                  </div>
                ))}
              {Array.from(addressCounts.entries()).filter(([_, info]) => info.tokens.length > 1).length === 0 && (
                <p className="text-gray-500 text-sm">No duplicate addresses found yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Search Results */}
        {sortedSearches.length > 0 ? (
          <div className="space-y-6">
            {/* Sort Controls */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Tracking Processes</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Sort by:</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="timestamp">Time</option>
                      <option value="buyCount">Buy Count</option>
                      <option value="tokenAddress">Token Address</option>
                    </select>
                    <button
                      onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {sortedSearches.map(search => {
              const stats = getSearchStats(search);
              const isExpanded = expandedSearches.has(search.id);
              
              return (
                <div key={search.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  {/* Search Header */}
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            Token: {formatAddress(search.tokenAddress)}
                          </h3>
                          {search.isLoading && (
                            <div className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                              <span className="text-sm text-blue-600 font-medium">Live Tracking</span>
                            </div>
                          )}
                          {search.isFromCache && !search.isLoading && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200">
                                💾 From Cache
                              </span>
                            </div>
                          )}
                          {search.error && (
                            <span className="text-sm text-red-600 bg-red-50 px-2 py-1 rounded">Error: {search.error}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          Block: {search.blockNumber.toLocaleString()} • Started: {new Date(search.timestamp).toLocaleString()}
                          {search.isFromCache && search.lastUpdated && (
                            <span className="ml-2 text-green-600">
                              • Cached: {new Date(search.lastUpdated).toLocaleString()}
                            </span>
                          )}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {/* Statistics Cards */}
                        <div className="flex gap-2">
                          <div className="bg-blue-50 px-3 py-1 rounded-lg">
                            <span className="text-xs text-blue-600 font-medium">{search.buyers.length} transactions</span>
                          </div>
                          <div className="bg-green-50 px-3 py-1 rounded-lg">
                            <span className="text-xs text-green-600 font-medium">{stats.uniqueBuyers} unique</span>
                          </div>
                          {stats.topDex && (
                            <div className="bg-purple-50 px-3 py-1 rounded-lg">
                              <span className="text-xs text-purple-600 font-medium">{stats.topDex.name}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          {search.isFromCache && !search.isLoading && (
                            <button
                              onClick={() => refreshCachedSearch(search)}
                              className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                              title="Refresh this search with new data"
                            >
                              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                          )}
                          
                          <button
                            onClick={() => toggleSearchExpansion(search.id)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <svg className={`w-5 h-5 text-gray-500 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {search.progress && (
                      <div className="mt-4">
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
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="p-6">
                      {/* Detailed Statistics */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-1">Total Volume</h4>
                          <p className="text-lg font-semibold text-gray-900">
                            {stats.totalVolume.toFixed(4)} SOL
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-1">Average Price</h4>
                          <p className="text-lg font-semibold text-gray-900">
                            {stats.avgPrice.toFixed(6)} SOL
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-1">Top DEX</h4>
                          <p className="text-lg font-semibold text-gray-900">
                            {stats.topDex ? `${stats.topDex.name} (${stats.topDex.count})` : 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Transactions Table */}
                      {search.buyers.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transaction #</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Token Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Sold</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Signature</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {search.buyers.map((buyer, index) => (
                                <tr 
                                  key={index} 
                                  className={`hover:bg-gray-50 transition-colors ${isAddressDuplicate(buyer.buyer || buyer.address) ? 'bg-yellow-50' : ''}`}
                                >
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                                      {buyer.buyNumber || index + 1}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono">{formatAddress(buyer.buyer || buyer.address)}</span>
                                      {isAddressDuplicate(buyer.buyer || buyer.address) && (
                                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                                          Duplicate
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                    {formatAmount(buyer.amountBought || buyer.tokenAmount, buyer.decimalsTarget)}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    {formatAmount(buyer.amountSold || buyer.solAmount, buyer.decimalsSold)}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                                      buyer.confidence === 'high' ? 'bg-green-100 text-green-800' :
                                      buyer.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {buyer.dex || 'Unknown'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                    {buyer.pricePerToken ? parseFloat(buyer.pricePerToken).toFixed(6) : 'N/A'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    <a 
                                      href={`https://solscan.io/tx/${buyer.signature}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800 font-mono hover:underline"
                                    >
                                      {buyer.signature.slice(0, 8)}...
                                    </a>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    {new Date(buyer.timestamp).toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-500">
                          <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          <p className="text-lg font-medium">
                            {search.isLoading ? 'Searching for transactions...' : 'No transactions found for this token and block range.'}
                          </p>
                          {search.isLoading && (
                            <p className="text-sm text-gray-400 mt-2">This may take a few moments...</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Search Results Yet</h3>
            <p className="text-gray-600 mb-4">
              Start by entering a token address and block number above, or import existing cache data.
            </p>
            <div className="flex justify-center gap-4">
              <label className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md font-medium hover:bg-purple-700 shadow-sm transition-colors cursor-pointer">
                📥 Import Cache File
                <input
                  type="file"
                  accept=".json"
                  onChange={importCachedData}
                  className="hidden"
                />
              </label>
              <p className="text-sm text-gray-500 flex items-center">
                💡 Sample file: <code className="bg-gray-100 px-1 rounded ml-1">exports/token-tracker-cache-2025-07-15.json</code>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
