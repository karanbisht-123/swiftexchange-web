import {
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import React, { memo, useCallback, useMemo, useState } from 'react';

import { useMarkets } from '../hooks/useMarkets';

interface MarketRowProps {
  market: any;
  formatPrice: (price: string) => string;
  formatVolume: (volume: string) => string;
  formatPercent: (percent: string) => string;
  formatFundingRate: (rate: string) => string;
  getTimeUntilFunding: (fundingAt: string) => string;
  isMobile: boolean;
}

type SortField = 'ticker' | 'price' | 'change' | 'volume' | 'trades';
type SortDirection = 'asc' | 'desc';

const ROWS_PER_PAGE = 50;

const MarketRow = memo(function MarketRow({
  market,
  formatPrice,
  formatVolume,
  formatPercent,
  formatFundingRate,
  getTimeUntilFunding,
  isMobile,
}: MarketRowProps) {
  const priceChange = parseFloat(market.priceChange24H);
  const isPositive = priceChange >= 0;
  const fundingRate = parseFloat(market.nextFundingRate);

  if (isMobile) {
    return (
      <div className=" p-4 active:bg-[#1e293b]/30 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative w-10 h-10 flex-shrink-0">
              {market.coinIcon ? (
                <img
                  src={market.coinIcon}
                  alt={market.ticker}
                  className="w-10 h-10 rounded-full"
                  onError={e => {
                    const img = e.currentTarget;
                    img.style.display = 'none';
                    const fallback = img.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-xs font-bold absolute top-0 left-0"
                style={{ display: market.coinIcon ? 'none' : 'flex' }}
              >
                {market.ticker.split('-')[0].slice(0, 2)}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white text-base">{market.ticker}</div>
              <div className="text-xs text-slate-500 truncate">
                {market.coinName || 'Perpetual'}
              </div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-white font-semibold text-base">
              ${formatPrice(market.oraclePrice)}
            </div>
            <div
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                isPositive ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {isPositive ? '+' : ''}
              {formatPercent(market.priceChange24H)}%
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-slate-500 mb-1">Volume</div>
            <div className="text-slate-300 font-medium">{formatVolume(market.volume24H)}</div>
          </div>
          <div>
            <div className="text-slate-500 mb-1">Trades</div>
            <div className="text-slate-400 font-medium">{market.trades24H.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-slate-500 mb-1">Funding</div>
            <div
              className={`font-medium ${fundingRate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {fundingRate >= 0 ? '+' : ''}
              {formatFundingRate(market.nextFundingRate)}%
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <tr className="border-b border-[#1e293b]/30 hover:bg-[#1e293b]/20 transition-colors">
      <td className="py-3 px-4 sticky left-0 bg-secondary z-10">
        <div className="flex items-center gap-2.5">
          <div className="relative w-12 h-12 flex-shrink-0">
            {market.coinIcon ? (
              <img
                src={market.coinIcon}
                alt={market.ticker}
                className="w-12 h-12 rounded-full"
                onError={e => {
                  const img = e.currentTarget;
                  img.style.display = 'none';
                  const fallback = img.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-[10px] font-bold absolute top-0 left-0"
              style={{ display: market.coinIcon ? 'none' : 'flex' }}
            >
              {market.ticker.split('-')[0].slice(0, 2)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="font-medium text-white text-sm leading-tight">{market.ticker}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {market.coinName || 'Perpetual'}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-white font-mono text-sm">${formatPrice(market.oraclePrice)}</span>
      </td>
      <td className="py-3 px-4 text-right">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
            isPositive ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isPositive ? '+' : ''}
          {formatPercent(market.priceChange24H)}%
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-slate-300 text-sm">{formatVolume(market.volume24H)}</span>
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-slate-400 text-sm">{market.trades24H.toLocaleString()}</span>
      </td>
      <td className="py-3 px-4 text-right">
        <span
          className={`font-mono text-xs ${fundingRate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {fundingRate >= 0 ? '+' : ''}
          {formatFundingRate(market.nextFundingRate)}%
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-slate-500 text-xs">{getTimeUntilFunding(market.nextFundingAt)}</span>
      </td>
    </tr>
  );
});

MarketRow.displayName = 'MarketRow';

export default function MarketsDisplay() {
  const { marketsList, error, isLoading } = useMarkets();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('volume');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const formatPrice = useCallback((price: string): string => {
    const num = parseFloat(price);
    if (isNaN(num)) return '0.00';
    return num >= 1000
      ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }, []);

  const formatVolume = useCallback((volume: string): string => {
    const num = parseFloat(volume);
    if (isNaN(num)) return '$0';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  }, []);

  const formatPercent = useCallback((percent: string): string => {
    const num = parseFloat(percent) * 100;
    return isNaN(num) ? '0.00' : num.toFixed(2);
  }, []);

  const formatFundingRate = useCallback((rate: string): string => {
    const num = parseFloat(rate) * 100;
    return isNaN(num) ? '0.0000' : num.toFixed(4);
  }, []);

  const getTimeUntilFunding = useCallback((fundingAt: string): string => {
    if (!fundingAt) return 'N/A';
    const now = Date.now();
    const funding = new Date(fundingAt).getTime();
    const diff = funding - now;
    if (diff < 0) return 'Passed';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }, []);

  const filteredAndSortedMarkets = useMemo(() => {
    let filtered = marketsList.filter(
      m =>
        m.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.coinName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aVal = 0;
      let bVal = 0;

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

  const totalPages = Math.ceil(filteredAndSortedMarkets.length / ROWS_PER_PAGE);
  const paginatedMarkets = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredAndSortedMarkets.slice(start, start + ROWS_PER_PAGE);
  }, [filteredAndSortedMarkets, currentPage]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('desc');
      }
      setCurrentPage(1);
      setShowSortMenu(false);
    },
    [sortField]
  );

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  }, []);

  const statistics = useMemo(() => {
    const totalVolume = marketsList.reduce((sum, m) => sum + parseFloat(m.volume24H || '0'), 0);
    const avgChange =
      marketsList.length > 0
        ? (marketsList.reduce((acc, m) => acc + parseFloat(m.priceChange24H || '0'), 0) /
            marketsList.length) *
          100
        : 0;
    const positiveMarkets = marketsList.filter(m => parseFloat(m.priceChange24H || '0') > 0).length;
    return { totalVolume, avgChange, positiveMarkets };
  }, [marketsList]);

  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxVisible = isMobile ? 5 : 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= (isMobile ? 3 : 5); i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - (isMobile ? 2 : 4); i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  }, [currentPage, totalPages, isMobile]);

  const SortIcon = useCallback(
    ({ field }: { field: SortField }) => {
      if (sortField !== field) {
        return <span className="text-slate-600 text-xs ml-1">⇅</span>;
      }
      return sortDirection === 'asc' ? (
        <TrendingUp className="w-3.5 h-3.5 text-blue-400 ml-1" />
      ) : (
        <TrendingDown className="w-3.5 h-3.5 text-blue-400 ml-1" />
      );
    },
    [sortField, sortDirection]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-700 border-t-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading markets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary text-white">
      {/* Stats Bar */}
      <div className="bg-secondary sticky top-0 z-30 backdrop-blur-sm px-4">
        <div className="max-w-[1920px] mx-aut *:py-3">
          <div className={`grid ${isMobile ? 'grid-cols-2' : 'grid-cols-4'} gap-3 md:gap-6`}>
            <div className="flex items-center gap-2 md:gap-3">
              <div className="text-[10px] md:text-xs text-slate-500">Markets</div>
              <div className="font-semibold text-white text-sm md:text-base">
                {marketsList.length}
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <div className="text-[10px] md:text-xs text-slate-500">24h Vol</div>
              <div className="font-semibold text-white text-sm md:text-base">
                {formatVolume(statistics.totalVolume.toString())}
              </div>
            </div>
            {!isMobile && (
              <>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500">Avg Change</div>
                  <div
                    className={`font-semibold ${statistics.avgChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                  >
                    {statistics.avgChange >= 0 ? '+' : ''}
                    {statistics.avgChange.toFixed(2)}%
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500">Positive</div>
                  <div className="font-semibold text-emerald-400">
                    {statistics.positiveMarkets}/{marketsList.length}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-svw mx-auto  ">
        {/* Search & Sort */}
        <div className="my-1">
          <div className={`flex gap-2 ${isMobile ? 'flex-row' : 'flex-col'}`}>
            <div className="relative flex-1 ">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500" />
              <input
                type="text"
                placeholder="Search markets..."
                value={searchTerm}
                onChange={handleSearch}
                className="w-full bg-secondary  pl-10 pr-10 py-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 active:scale-90 transition-transform"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {isMobile && (
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className={`h-full bg-primary border border-[#334155] rounded-lg text-white transition-all active:scale-95 ${
                    showSortMenu ? 'bg-blue-500/20 border-blue-500/50' : ''
                  }`}
                >
                  <SlidersHorizontal className="w-5 h-5" />
                </button>

                {showSortMenu && (
                  <>
                    <div
                      className="fixed inset-0 bg-black/50 z-40"
                      onClick={() => setShowSortMenu(false)}
                    />
                    <div className="fixed left-4 right-4 top-1/2 -translate-y-1/2 bg-[#1e293b] border border-[#334155] rounded-xl overflow-hidden shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200">
                      <div className="px-4 py-3 border-b border-[#334155]/50 flex items-center justify-between bg-[#1e293b]/80 backdrop-blur-sm">
                        <h3 className="font-semibold text-white">Sort Markets</h3>
                        <button
                          onClick={() => setShowSortMenu(false)}
                          className="p-1 hover:bg-[#334155]/50 rounded-lg transition-colors active:scale-90"
                        >
                          <X className="w-5 h-5 text-slate-400" />
                        </button>
                      </div>
                      <div className="py-2">
                        {[
                          { field: 'volume' as SortField, label: '24h Volume', icon: '📊' },
                          { field: 'change' as SortField, label: '24h Change', icon: '📈' },
                          { field: 'price' as SortField, label: 'Price', icon: '💰' },
                          { field: 'trades' as SortField, label: 'Trades', icon: '🔄' },
                          { field: 'ticker' as SortField, label: 'Market Name', icon: '🏷️' },
                        ].map(({ field, label, icon }) => (
                          <button
                            key={field}
                            onClick={() => handleSort(field)}
                            className={`w-full px-4 py-3.5 text-left transition-all flex items-center justify-between active:scale-[0.98] ${
                              sortField === field
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'text-slate-300 hover:bg-[#334155]/30'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{icon}</span>
                              <span className="font-medium">{label}</span>
                            </div>
                            {sortField === field && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-400/70">
                                  {sortDirection === 'asc' ? 'Low to High' : 'High to Low'}
                                </span>
                                {sortDirection === 'asc' ? (
                                  <TrendingUp className="w-4 h-4" />
                                ) : (
                                  <TrendingDown className="w-4 h-4" />
                                )}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        {filteredAndSortedMarkets.length > 0 ? (
          <div className="bg-[#1e293b]/30 border border-[#334155]/50  overflow-hidden">
            {isMobile ? (
              <div className="divide-y divide-[#1e293b]/30">
                {paginatedMarkets.map(market => (
                  <MarketRow
                    key={market.ticker}
                    market={market}
                    formatPrice={formatPrice}
                    formatVolume={formatVolume}
                    formatPercent={formatPercent}
                    formatFundingRate={formatFundingRate}
                    getTimeUntilFunding={getTimeUntilFunding}
                    isMobile={true}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#1e293b]/50 border-b border-[#334155]/50">
                      <th
                        onClick={() => handleSort('ticker')}
                        className="py-3 px-4 text-left text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200 sticky left-0 bg-[#1e293b]/50 z-20"
                      >
                        <div className="flex items-center">
                          Market
                          <SortIcon field="ticker" />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('price')}
                        className="py-3 px-4 text-right text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200"
                      >
                        <div className="flex items-center justify-end">
                          Price
                          <SortIcon field="price" />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('change')}
                        className="py-3 px-4 text-right text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200"
                      >
                        <div className="flex items-center justify-end">
                          24h Change
                          <SortIcon field="change" />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('volume')}
                        className="py-3 px-4 text-right text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200"
                      >
                        <div className="flex items-center justify-end">
                          24h Volume
                          <SortIcon field="volume" />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('trades')}
                        className="py-3 px-4 text-right text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200"
                      >
                        <div className="flex items-center justify-end">
                          Trades
                          <SortIcon field="trades" />
                        </div>
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-medium text-slate-400">
                        Funding
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-medium text-slate-400">
                        Next
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedMarkets.map(market => (
                      <MarketRow
                        key={market.ticker}
                        market={market}
                        formatPrice={formatPrice}
                        formatVolume={formatVolume}
                        formatPercent={formatPercent}
                        formatFundingRate={formatFundingRate}
                        getTimeUntilFunding={getTimeUntilFunding}
                        isMobile={false}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#334155]/50 bg-[#1e293b]/30">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-[#334155]/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-1">
                  {pageNumbers.map((page, idx) =>
                    page === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-slate-600">
                        ...
                      </span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page as number)}
                        className={`${isMobile ? 'min-w-[36px]' : 'min-w-[40px]'} h-9 rounded-lg text-sm transition-all active:scale-95 ${
                          currentPage === page
                            ? 'bg-blue-500 text-white font-medium shadow-lg shadow-blue-500/30'
                            : 'hover:bg-[#334155]/50 text-slate-400'
                        }`}
                      >
                        {page}
                      </button>
                    )
                  )}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-[#334155]/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="px-4 py-2 border-t border-[#334155]/30 text-center">
              <span className="text-xs text-slate-500">
                Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}-
                {Math.min(currentPage * ROWS_PER_PAGE, filteredAndSortedMarkets.length)} of{' '}
                {filteredAndSortedMarkets.length} markets
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <Search className="w-12 h-12 mx-auto mb-3 text-slate-700" />
            <p className="text-slate-500">No markets found</p>
            {searchTerm && <p className="text-xs text-slate-600 mt-1">Try a different search</p>}
          </div>
        )}
      </div>
    </div>
  );
}
