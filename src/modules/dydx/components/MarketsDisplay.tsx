import {
  Activity,
  ArrowUpDown,
  BarChart3,
  Clock,
  Database,
  DollarSign,
  Percent,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { useMarkets } from '../hooks/useMarkets';

type SortField = 'ticker' | 'price' | 'change' | 'volume' | 'trades';
type SortDirection = 'asc' | 'desc';

export default function MarketsDisplay() {
  const { marketsList, error, isLoading, isConnected, totalMarkets, cacheStats } = useMarkets();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('volume');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (num >= 1000) {
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  };

  const formatVolume = (volume: string) => {
    const num = parseFloat(volume);
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatPercent = (percent: string) => {
    const num = parseFloat(percent) * 100;
    return num.toFixed(2);
  };

  const formatFundingRate = (rate: string) => {
    const num = parseFloat(rate) * 100;
    return num.toFixed(4);
  };

  const getTimeUntilFunding = (fundingAt: string) => {
    if (!fundingAt) return 'N/A';
    const now = new Date().getTime();
    const funding = new Date(fundingAt).getTime();
    const diff = funding - now;
    if (diff < 0) return 'Funding passed';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const filteredAndSortedMarkets = useMemo(() => {
    let filtered = marketsList.filter(
      market =>
        market.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
        market.coinName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aVal: number = 0;
      let bVal: number = 0;

      switch (sortField) {
        case 'ticker':
          return sortDirection === 'asc'
            ? a.ticker.localeCompare(b.ticker)
            : b.ticker.localeCompare(a.ticker);
        case 'price':
          aVal = parseFloat(a.oraclePrice);
          bVal = parseFloat(b.oraclePrice);
          break;
        case 'change':
          aVal = parseFloat(a.priceChange24H);
          bVal = parseFloat(b.priceChange24H);
          break;
        case 'volume':
          aVal = parseFloat(a.volume24H);
          bVal = parseFloat(b.volume24H);
          break;
        case 'trades':
          aVal = a.trades24H;
          bVal = b.trades24H;
          break;
      }

      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  }, [marketsList, searchTerm, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const totalVolume = useMemo(() => {
    return marketsList.reduce((sum, m) => sum + parseFloat(m.volume24H || '0'), 0);
  }, [marketsList]);

  const avgChange = useMemo(() => {
    if (marketsList.length === 0) return 0;
    const sum = marketsList.reduce((acc, m) => acc + parseFloat(m.priceChange24H || '0'), 0);
    return (sum / marketsList.length) * 100;
  }, [marketsList]);

  const positiveMarkets = useMemo(() => {
    return marketsList.filter(m => parseFloat(m.priceChange24H || '0') > 0).length;
  }, [marketsList]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-4 h-4 opacity-30" />;
    return sortDirection === 'asc' ? (
      <TrendingUp className="w-4 h-4 text-blue-400" />
    ) : (
      <TrendingDown className="w-4 h-4 text-blue-400" />
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Markets Overview
              </h1>
              <p className="text-slate-400 mt-1">Real-time perpetual markets from dYdX</p>
            </div>

            {/* Connection & Cache Status */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                  }`}
                />
                <span className="text-slate-400">{isConnected ? 'Live Data' : 'Disconnected'}</span>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Database className="w-4 h-4" />
                <span>
                  Cache: {cacheStats.valid}/{cacheStats.total}
                </span>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search markets by ticker or name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <BarChart3 className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-slate-400 text-sm">Total Markets</span>
            </div>
            <p className="text-2xl font-bold">{totalMarkets}</p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <DollarSign className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-slate-400 text-sm">24h Volume</span>
            </div>
            <p className="text-2xl font-bold">{formatVolume(totalVolume.toString())}</p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <Percent className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-slate-400 text-sm">Avg Change</span>
            </div>
            <p
              className={`text-2xl font-bold ${avgChange >= 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {avgChange >= 0 ? '+' : ''}
              {avgChange.toFixed(2)}%
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <span className="text-slate-400 text-sm">Positive</span>
            </div>
            <p className="text-2xl font-bold text-green-400">
              {positiveMarkets}/{totalMarkets}
            </p>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 text-red-400">
            <p className="font-medium">Error: {error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-700 border-t-blue-500" />
          </div>
        )}

        {/* Markets Table */}
        {!isLoading && !error && (
          <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/50">
                    <th
                      className="text-left p-4 text-slate-400 font-medium text-sm cursor-pointer hover:text-slate-200 transition-colors"
                      onClick={() => handleSort('ticker')}
                    >
                      <div className="flex items-center gap-2">
                        Market
                        <SortIcon field="ticker" />
                      </div>
                    </th>
                    <th
                      className="text-right p-4 text-slate-400 font-medium text-sm cursor-pointer hover:text-slate-200 transition-colors"
                      onClick={() => handleSort('price')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Price
                        <SortIcon field="price" />
                      </div>
                    </th>
                    <th
                      className="text-right p-4 text-slate-400 font-medium text-sm cursor-pointer hover:text-slate-200 transition-colors"
                      onClick={() => handleSort('change')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        24h Change
                        <SortIcon field="change" />
                      </div>
                    </th>
                    <th
                      className="text-right p-4 text-slate-400 font-medium text-sm cursor-pointer hover:text-slate-200 transition-colors"
                      onClick={() => handleSort('volume')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        24h Volume
                        <SortIcon field="volume" />
                      </div>
                    </th>
                    <th
                      className="text-right p-4 text-slate-400 font-medium text-sm cursor-pointer hover:text-slate-200 transition-colors"
                      onClick={() => handleSort('trades')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        Trades
                        <SortIcon field="trades" />
                      </div>
                    </th>
                    <th className="text-right p-4 text-slate-400 font-medium text-sm">
                      Funding Rate
                    </th>
                    <th className="text-right p-4 text-slate-400 font-medium text-sm">
                      Next Funding
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedMarkets.map(market => {
                    const priceChange = parseFloat(market.priceChange24H);
                    const isPositive = priceChange >= 0;
                    const fundingRate = parseFloat(market.nextFundingRate);

                    return (
                      <tr
                        key={market.ticker}
                        className="border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {/* Coin Icon with fallback */}
                            <div className="relative w-10 h-10 flex-shrink-0">
                              {market.coinIcon ? (
                                <img
                                  src={market.coinIcon}
                                  alt={market.ticker}
                                  className="w-10 h-10 rounded-full object-cover"
                                  onError={e => {
                                    // Fallback to gradient if image fails to load
                                    e.currentTarget.style.display = 'none';
                                    const fallback = e.currentTarget
                                      .nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div
                                className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center font-bold text-sm absolute top-0 left-0"
                                style={{
                                  display: market.coinIcon ? 'none' : 'flex',
                                }}
                              >
                                {market.ticker.split('-')[0].slice(0, 2)}
                              </div>
                            </div>
                            <div>
                              <div className="font-semibold text-white">{market.ticker}</div>
                              <div className="text-xs text-slate-400">
                                {market.coinName || 'Perpetual'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-right text-slate-200 font-mono">
                          ${formatPrice(market.oraclePrice)}
                        </td>
                        <td className="p-4 text-right">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-medium ${
                              isPositive
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {isPositive ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {isPositive ? '+' : ''}
                            {formatPercent(market.priceChange24H)}%
                          </span>
                        </td>
                        <td className="p-4 text-right text-slate-200 font-medium">
                          {formatVolume(market.volume24H)}
                        </td>
                        <td className="p-4 text-right text-slate-300">
                          {market.trades24H.toLocaleString()}
                        </td>
                        <td className="p-4 text-right">
                          <span
                            className={`font-mono text-sm ${
                              fundingRate >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}
                          >
                            {fundingRate >= 0 ? '+' : ''}
                            {formatFundingRate(market.nextFundingRate)}%
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 text-slate-400 text-sm">
                            <Clock className="w-3.5 h-3.5" />
                            {getTimeUntilFunding(market.nextFundingAt)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredAndSortedMarkets.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No markets found matching "{searchTerm}"</p>
          </div>
        )}

        {/* Results Count */}
        {!isLoading && !error && searchTerm && (
          <div className="text-center text-slate-400 text-sm">
            Showing {filteredAndSortedMarkets.length} of {totalMarkets} markets
          </div>
        )}
      </div>
    </div>
  );
}
