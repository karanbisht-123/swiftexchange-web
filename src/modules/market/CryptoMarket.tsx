import {
  RefreshCw,
  TrendingUp,
  X,
  ChevronDown,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import PageLayout from '../../components/layout/PageLayout';
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
  marketCapChangePercentage_24h?: number;
  athDate?: string;
  atlDate?: string;
  lastUpdated?: string;
  roi?: {
    times: number;
    currency: string;
    percentage: number;
  } | null;
}

const CACHE_KEY = 'crypto_market_data';
const CACHE_DURATION = 5 * 60 * 1000;

const CryptoMarket = () => {
  const [data, setData] = useState<Crypto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCrypto, setSelectedCrypto] = useState<Crypto | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (selectedCrypto) {
      requestAnimationFrame(() => setIsSheetOpen(true));
      document.body.style.overflow = 'hidden';
    } else {
      setIsSheetOpen(false);
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedCrypto]);

  const closeSheet = () => {
    setIsSheetOpen(false);
    document.body.style.overflow = '';
    setTimeout(() => setSelectedCrypto(null), 300);
  };

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        const cacheTime = localStorage.getItem(`${CACHE_KEY}_time`);
        const now = Date.now();
        if (cachedData && cacheTime && now - parseInt(cacheTime) < CACHE_DURATION) {
          setData(JSON.parse(cachedData));
          setLoading(false);
          return;
        }
        setLoading(true);
        const response = await fetchApiResponseFromServer<{ marketData: Crypto[] }>('/market-data/', 'GET');
        const marketData = response.data.marketData;
        setData(marketData);
        setError(null);
        localStorage.setItem(CACHE_KEY, JSON.stringify(marketData));
        localStorage.setItem(`${CACHE_KEY}_time`, now.toString());
      } catch {
        setError('Failed to load market data');
      } finally {
        setLoading(false);
      }
    };
    fetchMarketData();
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const response = await fetchApiResponseFromServer<{ marketData: Crypto[] }>('/market-data/', 'GET');
      const marketData = response.data.marketData;
      setData(marketData);
      setError(null);
      const now = Date.now();
      localStorage.setItem(CACHE_KEY, JSON.stringify(marketData));
      localStorage.setItem(`${CACHE_KEY}_time`, now.toString());
    } catch {
      setError('Failed to load market data');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (num: number | undefined | null) => {
    if (num === null || num === undefined) return '$0.00';
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const formatLargeNumber = (num: number | undefined | null) => {
    if (num === null || num === undefined) return '—';
    if (num >= 1_000_000_000_000) return `$${(num / 1_000_000_000_000).toFixed(2)}T`;
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  };

  const formatSupply = (num: number | undefined | null, symbol?: string) => {
    if (num === null || num === undefined) return '—';
    let formatted = '';
    if (num >= 1_000_000_000) formatted = `${(num / 1_000_000_000).toFixed(2)}B`;
    else if (num >= 1_000_000) formatted = `${(num / 1_000_000).toFixed(2)}M`;
    else formatted = num.toLocaleString();
    return symbol ? `${formatted} ${symbol.toUpperCase()}` : formatted;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderContent = () => {
    if (loading && data.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-primary">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[var(--color-border)] border-t-[var(--color-brand-accent)] mx-auto mb-3" />
            <p className="text-sm text-muted">Loading market data...</p>
          </div>
        </div>
      );
    }

    if (error && data.length === 0) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-danger mb-4 text-sm">{error}</p>
            <button onClick={handleRefresh} className="btn btn-primary btn-sm">Retry</button>
          </div>
        </div>
      );
    }

    if (isMobile) {
      return (
        <div>
          {data.map(coin => (
            <div
              key={coin._id}
              onClick={() => setSelectedCrypto(coin)}
              className="flex items-center justify-between py-3.5 px-2 md:px-4 hover:bg-hover active:bg-tertiary transition-colors cursor-pointer "
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <img src={coin.image} alt={coin.name} className="w-9 h-9 rounded-full flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-primary text-sm">{coin.symbol.toUpperCase()}</div>
                  <div className="text-xs text-muted mt-0.5 truncate">{coin.name}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-primary font-semibold text-sm">{formatPrice(coin.currentPrice)}</div>
                <div className={`text-xs font-medium mt-0.5 ${coin.priceChangePercentage24h >= 0 ? 'text-success' : 'text-danger'}`}>
                  {coin.priceChangePercentage24h >= 0 ? '+' : ''}{coin?.priceChangePercentage24h?.toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Desktop table — fixed layout, controlled column widths
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '220px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '130px' }} />
          </colgroup>
          <thead>
            <tr className="bg-primary">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Coin</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">Price</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">24h</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider hidden md:table-cell">High</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider hidden md:table-cell">Low</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider hidden lg:table-cell">Mkt cap</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider hidden lg:table-cell">Volume</th>
            </tr>
          </thead>
          <tbody>
            {data.map(coin => (
              <tr
                key={coin._id}
                onClick={() => setSelectedCrypto(coin)}
                className="bg-tertiary transition-colors cursor-pointer group  "
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <img src={coin.image} alt={coin.name} className="w-7 h-7 rounded-full flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-primary text-sm truncate group-hover:text-brand-primary transition-colors">
                        {coin.name}
                      </div>
                      <div className="text-xs text-muted uppercase">{coin.symbol}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium text-primary text-sm">
                  {formatPrice(coin.currentPrice)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-xs font-medium ${coin.priceChangePercentage24h >= 0 ? 'text-success' : 'text-danger'}`}>
                    {coin.priceChangePercentage24h >= 0 ? '+' : ''}{coin?.priceChangePercentage24h?.toFixed(2)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted hidden md:table-cell">
                  {formatPrice(coin.high24h)}
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted hidden md:table-cell">
                  {formatPrice(coin.low24h)}
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted hidden lg:table-cell">
                  {formatLargeNumber(coin.marketCap)}
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted hidden lg:table-cell">
                  {formatLargeNumber(coin.totalVolume)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const c = selectedCrypto;

  return (
    <>
      <PageLayout
        title="Market"
        subtitle="Global crypto prices"
        maxWidth="7xl"
        showBackButton={false}
        headerActions={
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="btn btn-ghost btn-sm text-muted hover:text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      >
        {renderContent()}
      </PageLayout>


      {c && (
        <div className="fixed inset-0 z-50" aria-modal="true">

          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isSheetOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeSheet}
          />

          {/* Sheet */}
          <div
            className={`
              absolute bg-secondary border-color flex flex-col overflow-hidden
              transition-all duration-300 ease-out
              bottom-0 left-0 right-0 h-[88dvh] rounded-t-2xl border-t
              md:bottom-auto md:top-1/2 md:left-1/2
              md:-translate-x-1/2 md:-translate-y-1/2
              md:w-[500px] md:h-auto md:max-h-[88dvh]
              md:rounded-2xl md:border
              ${isSheetOpen
                ? 'translate-y-0 opacity-100 md:scale-100'
                : 'translate-y-full opacity-0 md:translate-y-6 md:scale-95'}
            `}
          >
            {/* Drag handle — mobile only */}
            <div className="flex justify-center pt-2.5 pb-1 md:hidden shrink-0">
              <div className="w-9 h-1 rounded-full bg-muted/30" />
            </div>

            {/* ── Header ── */}
            <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-color/40">
              <img src={c.image} alt={c.name} className="w-9 h-9 rounded-full bg-tertiary" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-primary text-base leading-tight truncate">{c.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-medium text-muted bg-tertiary px-1.5 py-0.5 rounded uppercase tracking-wide">
                    {c.symbol}
                  </span>
                  <span className="text-xs text-muted">Rank #{c.marketCapRank}</span>
                </div>
              </div>
              <button
                onClick={closeSheet}
                className="shrink-0 p-1.5 rounded-full hover:bg-tertiary text-muted hover:text-primary transition-colors"
                aria-label="Close"
              >
                {isMobile ? <ChevronDown size={20} /> : <X size={18} />}
              </button>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>

              {/* Price hero */}
              <div className="px-5 py-5 text-center border-b border-color/30">
                <p className="text-xs text-muted uppercase tracking-wider mb-2">Current price</p>
                <p className="text-4xl font-semibold text-primary tracking-tight">
                  {formatPrice(c.currentPrice)}
                </p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium
                      ${c.priceChangePercentage24h >= 0
                        ? 'bg-success/10 text-success'
                        : 'bg-danger/10 text-danger'}`}
                  >
                    <TrendingUp size={12} className={c.priceChangePercentage24h < 0 ? 'rotate-180' : ''} />
                    {Math.abs(c.priceChangePercentage24h)?.toFixed(2)}%
                  </span>
                  {c.priceChange24h !== undefined && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-tertiary text-muted">
                      {c.priceChange24h >= 0 ? '+' : ''}{formatPrice(c.priceChange24h)}
                    </span>
                  )}
                </div>
              </div>

              {/* High / Low band */}
              <div className="grid grid-cols-2 border-b border-color/30">
                <div className="px-5 py-4 text-center border-r border-color/30">
                  <p className="text-xs text-muted uppercase tracking-wider mb-1.5">24h high</p>
                  <p className="text-base font-medium text-success">{formatPrice(c.high24h)}</p>
                </div>
                <div className="px-5 py-4 text-center">
                  <p className="text-xs text-muted uppercase tracking-wider mb-1.5">24h low</p>
                  <p className="text-base font-medium text-danger">{formatPrice(c.low24h)}</p>
                </div>
              </div>

              {/* Market data rows */}
              <div className="px-2 py-4 border-b border-color/30">
                <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Market data</p>
                <div className="space-y-0">

                  <div className="flex items-center justify-between py-2.5 border-b border-color/20">
                    <span className="text-sm text-muted flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                      Market cap
                    </span>
                    <div className="text-right">
                      <span className="text-sm font-medium text-primary">{formatLargeNumber(c.marketCap)}</span>
                      {c.marketCapChangePercentage_24h !== undefined && (
                        <p className={`text-xs mt-0.5 ${c.marketCapChangePercentage_24h >= 0 ? 'text-success' : 'text-danger'}`}>
                          {c.marketCapChangePercentage_24h >= 0 ? '+' : ''}{c.marketCapChangePercentage_24h?.toFixed(2)}%
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2.5 border-b border-color/20">
                    <span className="text-sm text-muted flex items-center gap-2">
                      <RefreshCw size={14} className="opacity-60" />
                      Volume 24h
                    </span>
                    <span className="text-sm font-medium text-primary">{formatLargeNumber(c.totalVolume)}</span>
                  </div>

                  {c.circulatingSupply && (
                    <div className="flex items-center justify-between py-2.5 border-b border-color/20">
                      <span className="text-sm text-muted flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        Circulating
                      </span>
                      <span className="text-sm font-medium text-primary">{formatSupply(c.circulatingSupply, c.symbol)}</span>
                    </div>
                  )}

                  {c.fullyDilutedValuation && (
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-sm text-muted flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>
                        Fully diluted
                      </span>
                      <span className="text-sm font-medium text-primary">{formatLargeNumber(c.fullyDilutedValuation)}</span>
                    </div>
                  )}

                  {c.roi && (
                    <div className="flex items-center justify-between py-2.5 border-t border-color/20">
                      <span className="text-sm text-muted flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
                        ROI
                      </span>
                      <span className={`text-sm font-medium ${c.roi.percentage >= 0 ? 'text-success' : 'text-danger'}`}>
                        {c.roi.percentage?.toFixed(2)}%
                        <span className="text-xs text-muted font-normal ml-1">({c.roi.currency})</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ATH / ATL */}
              <div className="grid grid-cols-2">
                <div className="px-5 py-4 border-r border-color/30">
                  <p className="text-xs text-muted uppercase tracking-wider mb-2">All-time high</p>
                  <p className="text-sm font-medium text-primary">{formatPrice(c.ath)}</p>
                  <p className="text-xs text-danger mt-1">{c.athChangePercentage?.toFixed(2)}%</p>
                  <p className="text-xs text-muted mt-1">{formatDate(c.athDate)}</p>
                </div>
                {c.atl && (
                  <div className="px-5 py-4">
                    <p className="text-xs text-muted uppercase tracking-wider mb-2">All-time low</p>
                    <p className="text-sm font-medium text-primary">{formatPrice(c.atl)}</p>
                    <p className="text-xs text-success mt-1">+{c.atlChangePercentage?.toFixed(2)}%</p>
                    <p className="text-xs text-muted mt-1">{formatDate(c.atlDate)}</p>
                  </div>
                )}
              </div>

              {/* Safe area bottom */}
              <div className="md:hidden" style={{ height: 'env(safe-area-inset-bottom, 20px)' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CryptoMarket;