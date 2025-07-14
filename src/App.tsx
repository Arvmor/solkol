import React, { useState } from 'react';

interface BuyerAddress {
  address: string;
  tokenAmount: number;
  solAmount: number;
  signature: string;
  timestamp: number;
}

interface TokenSearch {
  id: string;
  tokenAddress: string;
  blockNumber: number;
  buyers: BuyerAddress[];
  timestamp: number;
  isLoading: boolean;
  error?: string;
}

function App() {
  const [searches, setSearches] = useState<TokenSearch[]>([]);
  const [tokenInput, setTokenInput] = useState('');
  const [blockInput, setBlockInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Get all unique addresses and their occurrences across searches
  const getAllAddresses = () => {
    const addressCounts = new Map<string, { count: number; tokens: string[] }>();
    
    searches.forEach((search: TokenSearch) => {
      const tokenShort = `${search.tokenAddress.slice(0, 8)}...`;
      search.buyers.forEach((buyer: BuyerAddress) => {
        const current = addressCounts.get(buyer.address);
        if (current) {
          current.count += 1;
          if (!current.tokens.includes(tokenShort)) {
            current.tokens.push(tokenShort);
          }
        } else {
          addressCounts.set(buyer.address, { count: 1, tokens: [tokenShort] });
        }
      });
    });
    
    return addressCounts;
  };

  const addressCounts = getAllAddresses();

  // Mock function to simulate fetching buyer data
  const fetchBuyersForToken = async (tokenAddress: string, blockNumber: number): Promise<BuyerAddress[]> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    // Mock data - in real implementation, this would call your Solana service
    const mockBuyers: BuyerAddress[] = [];
    const numBuyers = Math.floor(Math.random() * 8) + 3; // 3-10 buyers
    
    const mockAddresses = [
      '8WzsEsjJGMPZjh2FCGWT5P4tCfLdAJPcJJJJJJJJJJJJ',
      '6KP8WxKRGVmQVZhPtCfGYT3PtJhKJWxPdJPdJPdJPd',
      '9XKShKYhPwQVZiFHGYT8PtJgLdAJPcFdJdJdJdJdJd',
      '7QJKSkYhPwQmVZiFHRYT5PtCfLAAJPcJJJJJJJJJJJ',
      '5MJKShKYhPwQVZiFHAYT6PtJgLdAJPcJJJJJJJJJJJ',
      '4LJKShKYhPwQVZiFHBYT7PtJgLdAJPcJJJJJJJJJJJ',
      '3KJKShKYhPwQVZiFHCYT8PtJgLdAJPcJJJJJJJJJJJ',
      '2IJKShKYhPwQVZiFHDYT9PtJgLdAJPcJJJJJJJJJJJ',
      '1HJKShKYhPwQVZiFHEYT1PtJgLdAJPcJJJJJJJJJJJ',
      '9GJKShKYhPwQVZiFHFYT2PtJgLdAJPcJJJJJJJJJJJ'
    ];
    
    for (let i = 0; i < numBuyers; i++) {
      mockBuyers.push({
        address: mockAddresses[i % mockAddresses.length],
        tokenAmount: Math.random() * 1000000,
        solAmount: Math.random() * 50,
        signature: `${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`,
        timestamp: Date.now() - Math.random() * 3600000 // Within last hour
      });
    }
    
    return mockBuyers;
  };

  const handleSearch = async () => {
    if (!tokenInput.trim() || !blockInput.trim()) {
      alert('Please enter both token address and block number');
      return;
    }

    const searchId = Date.now().toString();
    const newSearch: TokenSearch = {
      id: searchId,
      tokenAddress: tokenInput.trim(),
      blockNumber: parseInt(blockInput),
      buyers: [],
      timestamp: Date.now(),
      isLoading: true
    };

    setSearches((prev: TokenSearch[]) => [newSearch, ...prev]);
    setIsSearching(true);

    try {
      const buyers = await fetchBuyersForToken(tokenInput.trim(), parseInt(blockInput));
      
      setSearches((prev: TokenSearch[]) => 
        prev.map((search: TokenSearch) => 
          search.id === searchId 
            ? { ...search, buyers, isLoading: false }
            : search
        )
      );
    } catch (error) {
      setSearches((prev: TokenSearch[]) => 
        prev.map((search: TokenSearch) => 
          search.id === searchId 
            ? { ...search, isLoading: false, error: error instanceof Error ? error.message : 'Unknown error' }
            : search
        )
      );
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearches = () => {
    setSearches([]);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  const formatAmount = (amount: number) => {
    return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  const isAddressDuplicate = (address: string) => {
    const info = addressCounts.get(address);
    return info && info.count > 1;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Token Buyer Address Tracker
          </h1>
          <p className="text-gray-600">
            Search for buyer addresses by token and block number. Duplicate addresses across different tokens are highlighted.
          </p>
        </div>

        {/* Search Controls */}
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
                disabled={isSearching}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Block Number *
              </label>
              <input
                type="number"
                value={blockInput}
                onChange={(e) => setBlockInput(e.target.value)}
                placeholder="Enter block number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSearching}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? 'Searching...' : 'Search Buyers'}
              </button>
              <button
                onClick={clearSearches}
                disabled={searches.length === 0}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear All Searches
              </button>
            </div>
            <div className="text-sm text-gray-600">
              Total searches: {searches.length}
            </div>
          </div>
        </div>

        {/* Duplicate Addresses Summary */}
        {addressCounts.size > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Duplicate Addresses Summary
            </h2>
            <div className="grid gap-2">
              {Array.from(addressCounts.entries())
                .filter(([_, info]) => info.count > 1)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([address, info]) => (
                  <div key={address} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="font-mono text-sm">
                      {formatAddress(address)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Found in {info.count} searches across tokens: {info.tokens.join(', ')}
                    </div>
                  </div>
                ))}
            </div>
            {Array.from(addressCounts.entries()).filter(([_, info]) => info.count > 1).length === 0 && (
              <p className="text-gray-500 text-sm">No duplicate addresses found yet.</p>
            )}
          </div>
        )}

        {/* Search Results */}
        <div className="space-y-6">
          {searches.map((search) => (
            <div key={search.id} className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Token: {formatAddress(search.tokenAddress)}
                  </h3>
                  <p className="text-sm text-gray-600">
                    Block: {search.blockNumber.toLocaleString()} • 
                    Searched: {new Date(search.timestamp).toLocaleString()}
                  </p>
                </div>
                <div className="text-sm text-gray-600">
                  {search.isLoading ? (
                    <span className="text-blue-600">Loading...</span>
                  ) : search.error ? (
                    <span className="text-red-600">Error: {search.error}</span>
                  ) : (
                    <span>{search.buyers.length} buyers found</span>
                  )}
                </div>
              </div>

              {search.isLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              )}

              {search.error && (
                <div className="text-center py-8 text-red-600">
                  Failed to load buyer data: {search.error}
                </div>
              )}

              {!search.isLoading && !search.error && search.buyers.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full table-auto">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Buyer Address</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Token Amount</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">SOL Amount</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {search.buyers.map((buyer, index) => (
                        <tr 
                          key={index} 
                          className={`border-t ${isAddressDuplicate(buyer.address) ? 'bg-yellow-50' : ''}`}
                        >
                          <td className="px-4 py-2 text-sm text-gray-900">
                            <div className="flex items-center gap-2">
                              <span className="font-mono">
                                {formatAddress(buyer.address)}
                              </span>
                              {isAddressDuplicate(buyer.address) && (
                                <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                                  Duplicate
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {formatAmount(buyer.tokenAmount)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {formatAmount(buyer.solAmount)} SOL
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            <a
                              href={`https://solscan.io/tx/${buyer.signature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-mono"
                            >
                              {buyer.signature.substring(0, 8)}...
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!search.isLoading && !search.error && search.buyers.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No buyers found for this token at the specified block.
                </div>
              )}
            </div>
          ))}
        </div>

        {searches.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <p className="text-gray-500">
              Enter a token address and block number above to start searching for buyer addresses.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
