import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { fetchApiResponseFromServer } from '../../service/apiService';

interface Crypto {
  _id: string;
  id: string;
  name: string;
  symbol: string;
  image: string;
  currentPrice: number;
  priceChangePercentage24h: number;
  marketCap: number;
  marketCapRank: number;
  totalVolume: number;
  high24h: number;
  low24h: number;
  ath: number;
  athChangePercentage: number;
  atl?: number;
  atlChangePercentage?: number;
  circulatingSupply?: number;
  maxSupply?: number;
  totalSupply?: number;
  fullyDilutedValuation?: number;
  priceChange24h?: number;
  marketCapChange24h?: number;
  athDate?: string;
  atlDate?: string;
  lastUpdated?: string;
}

const CACHE_KEY = 'crypto_market_data';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const CryptoMarket = () => {
  const [data, setData] = useState<Crypto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCrypto, setSelectedCrypto] = useState<Crypto | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  useEffect(() => {
    const fetchMarketData = async (forceRefresh = false) => {
      try {

        const cachedData = localStorage.getItem(CACHE_KEY);
        const cacheTime = localStorage.getItem(`${CACHE_KEY}_time`);
        const now = Date.now();

        if (!forceRefresh && cachedData && cacheTime) {
          const timeDiff = now - parseInt(cacheTime);

          if (timeDiff < CACHE_DURATION) {
            setData(JSON.parse(cachedData));
            setLastFetchTime(parseInt(cacheTime));
            setLoading(false);
            return;
          }
        }
        setLoading(true);
        const response = await fetchApiResponseFromServer<{ marketData: Crypto[] }>(
          '/market-data/',
          'GET'
        );

        const marketData = response.data.marketData;
        setData(marketData);
        setError(null);
        localStorage.setItem(CACHE_KEY, JSON.stringify(marketData));
        localStorage.setItem(`${CACHE_KEY}_time`, now.toString());
        setLastFetchTime(now);
      } catch (err) {
        setError('Failed to load market data');
      } finally {
        setLoading(false);
      }
    };

    fetchMarketData();
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    const fetchMarketData = async () => {
      try {
        const response = await fetchApiResponseFromServer<{ marketData: Crypto[] }>(
          '/market-data/',
          'GET'
        );

        const marketData = response.data.marketData;
        setData(marketData);
        setError(null);

        const now = Date.now();
        localStorage.setItem(CACHE_KEY, JSON.stringify(marketData));
        localStorage.setItem(`${CACHE_KEY}_time`, now.toString());
        setLastFetchTime(now);
      } catch (err) {
        setError('Failed to load market data');
      } finally {
        setLoading(false);
      }
    };
    fetchMarketData();
  };

  const formatPrice = (num: number) =>
    `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const formatLargeNumber = (num: number) => {
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          Loading market data...
        </div>
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-red-400">
        <div className="text-center">
          <p className="mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="p-4 bg-gray-800 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Crypto Market</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            Last updated:{' '}
            {lastFetchTime ? new Date(lastFetchTime).toLocaleTimeString() : 'Just now'}
          </span>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded text-sm transition-colors"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-800 sticky top-0">
            <tr>
              <th className="px-6 py-4 text-xs font-medium text-gray-400 uppercase">#</th>
              <th className="px-6 py-4 text-xs font-medium text-gray-400 uppercase">Coin</th>
              <th className="px-6 py-4 text-xs font-medium text-gray-400 uppercase text-right">
                Price
              </th>
              <th className="px-6 py-4 text-xs font-medium text-gray-400 uppercase text-right">
                24h
              </th>
              <th className="px-6 py-4 text-xs font-medium text-gray-400 uppercase text-right hidden md:table-cell">
                24h High
              </th>
              <th className="px-6 py-4 text-xs font-medium text-gray-400 uppercase text-right hidden md:table-cell">
                24h Low
              </th>
              <th className="px-6 py-4 text-xs font-medium text-gray-400 uppercase text-right hidden lg:table-cell">
                Market Cap
              </th>
              <th className="px-6 py-4 text-xs font-medium text-gray-400 uppercase text-right hidden lg:table-cell">
                Volume (24h)
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map(coin => (
              <tr
                key={coin._id}
                onClick={() => setSelectedCrypto(coin)}
                className="border-t border-gray-700 hover:bg-gray-800 transition-colors cursor-pointer"
              >
                <td className="px-6 py-4 text-sm">{coin.marketCapRank}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <img src={coin.image} alt={coin.name} className="w-8 h-8 rounded-full" />
                    <div>
                      <div className="font-medium">{coin.name}</div>
                      <div className="text-xs text-gray-400 uppercase">{coin.symbol}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right font-medium">
                  {formatPrice(coin.currentPrice)}
                </td>
                <td className="px-6 py-4 text-right">
                  <span
                    className={`font-medium ${coin.priceChangePercentage24h >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {coin.priceChangePercentage24h >= 0 ? '↑' : '↓'}{' '}
                    {Math.abs(coin.priceChangePercentage24h).toFixed(2)}%
                  </span>
                </td>
                <td className="px-6 py-4 text-right text-green-400 hidden md:table-cell">
                  {formatPrice(coin.high24h)}
                </td>
                <td className="px-6 py-4 text-right text-red-400 hidden md:table-cell">
                  {formatPrice(coin.low24h)}
                </td>
                <td className="px-6 py-4 text-right hidden lg:table-cell">
                  {formatLargeNumber(coin.marketCap)}
                </td>
                <td className="px-6 py-4 text-right hidden lg:table-cell">
                  {formatLargeNumber(coin.totalVolume)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedCrypto && (
        <div className="fixed inset-0 bg-black/40 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 flex justify-between items-start">
              <div className="flex items-center gap-4">
                <img
                  src={selectedCrypto.image}
                  alt={selectedCrypto.name}
                  className="w-12 h-12 rounded-full"
                />
                <div>
                  <h2 className="text-2xl font-bold">{selectedCrypto.name}</h2>
                  <p className="text-gray-400 uppercase">{selectedCrypto.symbol}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCrypto(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-2">
              {/* Price Section */}
              <div>
                <div className="bg-gray-900  p-4">
                  <div className="text-3xl font-bold mb-2">
                    {formatPrice(selectedCrypto.currentPrice)}
                  </div>
                  <div
                    className={`text-lg ${selectedCrypto.priceChangePercentage24h >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {selectedCrypto.priceChangePercentage24h >= 0 ? '↑' : '↓'}{' '}
                    {Math.abs(selectedCrypto.priceChangePercentage24h).toFixed(2)}% (24h)
                  </div>
                  {selectedCrypto.priceChange24h && (
                    <div className="text-sm text-gray-400 mt-1">
                      {formatPrice(Math.abs(selectedCrypto.priceChange24h))} change
                    </div>
                  )}
                </div>
              </div>

              {/* 24h Stats */}
              <div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-900 p-4">
                    <div className="text-sm text-gray-400 mb-1">24h High</div>
                    <div className="text-xl font-semibold text-green-400">
                      {formatPrice(selectedCrypto.high24h)}
                    </div>
                  </div>
                  <div className="bg-gray-900  p-4">
                    <div className="text-sm text-gray-400 mb-1">24h Low</div>
                    <div className="text-xl font-semibold text-red-400">
                      {formatPrice(selectedCrypto.low24h)}
                    </div>
                  </div>
                  <div className="bg-gray-900  p-4">
                    <div className="text-sm text-gray-400 mb-1">24h Volume</div>
                    <div className="text-xl font-semibold">
                      {formatLargeNumber(selectedCrypto.totalVolume)}
                    </div>
                  </div>
                  <div className="bg-gray-900  p-4">
                    <div className="text-sm text-gray-400 mb-1">Market Cap Change</div>
                    <div className="text-xl font-semibold">
                      {selectedCrypto.marketCapChange24h
                        ? formatLargeNumber(Math.abs(selectedCrypto.marketCapChange24h))
                        : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Market Data */}
              <div>
                <div className="bg-gray-900 p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Market Cap Rank</span>
                    <span className="font-semibold">#{selectedCrypto.marketCapRank}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Market Cap</span>
                    <span className="font-semibold">
                      {formatLargeNumber(selectedCrypto.marketCap)}
                    </span>
                  </div>
                  {selectedCrypto.fullyDilutedValuation && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Fully Diluted Valuation</span>
                      <span className="font-semibold">
                        {formatLargeNumber(selectedCrypto.fullyDilutedValuation)}
                      </span>
                    </div>
                  )}
                  {selectedCrypto.circulatingSupply && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Circulating Supply</span>
                      <span className="font-semibold">
                        {selectedCrypto.circulatingSupply.toLocaleString()}{' '}
                        {selectedCrypto.symbol.toUpperCase()}
                      </span>
                    </div>
                  )}
                  {selectedCrypto.maxSupply && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Max Supply</span>
                      <span className="font-semibold">
                        {selectedCrypto.maxSupply.toLocaleString()}{' '}
                        {selectedCrypto.symbol.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* All-Time Stats */}
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-900  p-4">
                    <div className="text-sm text-gray-400 mb-1">All-Time High</div>
                    <div className="text-xl font-semibold text-green-400 mb-1">
                      {formatPrice(selectedCrypto.ath)}
                    </div>
                    <div className="text-sm text-red-400">
                      {selectedCrypto.athChangePercentage.toFixed(2)}% from ATH
                    </div>
                    {selectedCrypto.athDate && (
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDate(selectedCrypto.athDate)}
                      </div>
                    )}
                  </div>
                  {selectedCrypto.atl && (
                    <div className="bg-gray-900 p-4">
                      <div className="text-sm text-gray-400 mb-1">All-Time Low</div>
                      <div className="text-xl font-semibold text-red-400 mb-1">
                        {formatPrice(selectedCrypto.atl)}
                      </div>
                      {selectedCrypto.atlChangePercentage && (
                        <div className="text-sm text-green-400">
                          {selectedCrypto.atlChangePercentage.toFixed(2)}% from ATL
                        </div>
                      )}
                      {selectedCrypto.atlDate && (
                        <div className="text-xs text-gray-500 mt-1">
                          {formatDate(selectedCrypto.atlDate)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {selectedCrypto.lastUpdated && (
                <div className="text-center text-sm text-gray-500">
                  Last updated: {new Date(selectedCrypto.lastUpdated).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CryptoMarket;
