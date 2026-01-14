import { ChevronLeft, ChevronRight, Search, Star, TrendingDown, TrendingUp, X } from 'lucide-react';
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

type SortField = 'ticker' | 'price' | 'change' | 'volume' | 'trades' | 'openInterest';
type SortDirection = 'asc' | 'desc';

const ROWS_PER_PAGE = 50;

const PriceChart = memo(({ change }: { change: number }) => {
  const isPositive = change >= 0;
  const points = useMemo(() => {
    const basePoints = [40, 35, 45, 30, 50, 25, 55, 20];
    const trend = isPositive ? 1 : -1;
    return basePoints.map((p, i) => p + i * trend * 3);
  }, [isPositive]);

  const path = points.map((y, i) => `${i === 0 ? 'M' : 'L'} ${i * 8} ${y}`).join(' ');

  return (
    <svg width="60" height="30" viewBox="0 0 60 60" className="opacity-80">
      <path
        d={path}
        fill="none"
        stroke={isPositive ? 'var(--color-success)' : 'var(--color-danger)'}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
});

PriceChart.displayName = 'PriceChart';

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
  const [isFavorite, setIsFavorite] = useState(false);

  if (isMobile) {
    return (
      <div className="flex items-center justify-between py-3 px-4 border-b border-color hover:bg-hover transition-colors">
        {/* Left: Icon + Name + Volume */}
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
              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold absolute top-0 left-0"
              style={{
                display: market.coinIcon ? 'none' : 'flex',
                background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-accent))'
              }}
            >
              {market.ticker.split('-')[0].slice(0, 2)}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-primary text-base">
              {market.ticker.split('-')[0]}
            </div>
            <div className="text-xs text-muted">
              Volume {formatVolume(market.volume24H)}
            </div>
          </div>
        </div>

        {/* Right: Price + Change */}
        <div className="text-right flex-shrink-0">
          <div className="text-primary font-semibold text-base">
            ${formatPrice(market.oraclePrice)}
          </div>
          <div
            className={`text-xs font-medium ${isPositive ? 'price-up' : 'price-down'
              }`}
          >
            {isPositive ? '+' : ''}
            {formatPercent(market.priceChange24H)}%
          </div>
        </div>
      </div>
    );
  }

  return (
    <tr className="border-b border-color hover:bg-hover transition-colors group">
      <td className="py-3 px-4 sticky left-0 bg-secondary group-hover:bg-hover z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsFavorite(!isFavorite)}
            className="flex-shrink-0 transition-colors hover:scale-110"
          >
            <Star
              className={`w-4 h-4 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted hover:text-secondary'}`}
            />
          </button>
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
              className="w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-bold absolute top-0 left-0"
              style={{
                display: market.coinIcon ? 'none' : 'flex',
                background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-accent))'
              }}
            >
              {market.ticker.split('-')[0].slice(0, 2)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="font-medium text-primary text-sm leading-tight flex items-center gap-2">
              {market.ticker.split('-')[0]}
              {market.clobPairId && (
                <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                  {market.clobPairId}×
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted truncate">
              {market.coinName || 'Perpetual'}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-primary font-mono text-sm">${formatPrice(market.oraclePrice)}</span>
      </td>
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <PriceChart change={priceChange} />
          <span
            className={`inline-flex items-center gap-1 text-sm font-medium ${isPositive ? 'price-up' : 'price-down'
              }`}
          >
            {isPositive ? '+' : ''}
            {formatPercent(market.priceChange24H)}%
          </span>
        </div>
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-secondary text-sm">{formatVolume(market.volume24H)}</span>
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-secondary text-sm">${formatVolume(market.openInterest)}</span>
      </td>
      <td className="py-3 px-4 text-right">
        <span className="text-muted text-sm">{market.trades24H.toLocaleString()}</span>
      </td>
      <td className="py-3 px-4 text-right">
        <div
          className={`font-mono text-sm ${fundingRate >= 0 ? 'price-up' : 'price-down'}`}
        >
          {fundingRate >= 0 ? '+' : ''}
          {formatFundingRate(market.nextFundingRate)}%
        </div>
        <div className="text-muted text-xs mt-0.5">
          {getTimeUntilFunding(market.nextFundingAt)}
        </div>
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
    if (diff < 0) return 'Soon';
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
        case 'openInterest':
          aVal = parseFloat(a.openInterest);
          bVal = parseFloat(b.openInterest);
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
      if (sortField !== field) return null;
      return sortDirection === 'asc' ? (
        <TrendingUp className="w-3.5 h-3.5 ml-1 inline" style={{ color: 'var(--color-brand-accent)' }} />
      ) : (
        <TrendingDown className="w-3.5 h-3.5 ml-1 inline" style={{ color: 'var(--color-brand-accent)' }} />
      );
    },
    [sortField, sortDirection]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 mx-auto mb-4" style={{ borderColor: 'var(--color-border)', borderTopColor: 'var(--color-brand-accent)' }} />
          <p className="text-muted">Loading markets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary text-primary">
      {/* Search Bar */}
      <div className="bg-secondary sticky top-0 z-30 border-b border-color">
        <div className="max-w-[1920px] mx-auto px-4 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="Search markets..."
              value={searchTerm}
              onChange={handleSearch}
              className="input w-full pl-10 pr-10"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-4 py-4">
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-danger-bg)', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
            {error}
          </div>
        )}

        {filteredAndSortedMarkets.length > 0 ? (
          <div className="card">
            {isMobile ? (
              <div className="divide-y divide-color">
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
                    <tr className="bg-tertiary border-b border-color">
                      <th
                        onClick={() => handleSort('ticker')}
                        className="py-3 px-4 text-left text-xs font-medium text-muted cursor-pointer hover:text-secondary sticky left-0 bg-secondary z-20"
                      >
                        Market
                        <SortIcon field="ticker" />
                      </th>
                      <th
                        onClick={() => handleSort('price')}
                        className="py-3 px-4 text-right text-xs font-medium text-muted cursor-pointer hover:text-secondary"
                      >
                        Oracle Price
                        <SortIcon field="price" />
                      </th>
                      <th
                        onClick={() => handleSort('change')}
                        className="py-3 px-4 text-right text-xs font-medium text-muted cursor-pointer hover:text-secondary"
                      >
                        24h Change
                        <SortIcon field="change" />
                      </th>
                      <th
                        onClick={() => handleSort('volume')}
                        className="py-3 px-4 text-right text-xs font-medium text-muted cursor-pointer hover:text-secondary"
                      >
                        24h Volume
                        <SortIcon field="volume" />
                      </th>
                      <th
                        onClick={() => handleSort('openInterest')}
                        className="py-3 px-4 text-right text-xs font-medium text-muted cursor-pointer hover:text-secondary"
                      >
                        Open Interest
                        <SortIcon field="openInterest" />
                      </th>
                      <th
                        onClick={() => handleSort('trades')}
                        className="py-3 px-4 text-right text-xs font-medium text-muted cursor-pointer hover:text-secondary"
                      >
                        Trades
                        <SortIcon field="trades" />
                      </th>
                      <th className="py-3 px-4 text-right text-xs font-medium text-muted">
                        1h Funding
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-color bg-tertiary">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-1">
                  {pageNumbers.map((page, idx) =>
                    page === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-muted">
                        ...
                      </span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page as number)}
                        className={`${isMobile ? 'min-w-[36px]' : 'min-w-[40px]'} h-9 rounded-lg text-sm transition-all active:scale-95 ${currentPage === page
                            ? 'text-white font-medium shadow-lg'
                            : 'hover:bg-hover text-muted'
                          }`}
                        style={currentPage === page ? { backgroundColor: 'var(--color-brand-accent)' } : {}}
                      >
                        {page}
                      </button>
                    )
                  )}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors active:scale-95"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="px-4 py-2 border-t border-color text-center">
              <span className="text-xs text-muted">
                Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}-
                {Math.min(currentPage * ROWS_PER_PAGE, filteredAndSortedMarkets.length)} of{' '}
                {filteredAndSortedMarkets.length} markets
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <Search className="w-12 h-12 mx-auto mb-3 text-muted" />
            <p className="text-muted">No markets found</p>
            {searchTerm && <p className="text-xs text-muted mt-1">Try a different search</p>}
          </div>
        )}
      </div>
    </div>
  );
}