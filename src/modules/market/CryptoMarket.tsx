import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronDown,
  Clock,
  Globe,
  Percent,
  RefreshCw,
  TrendingUp,
  X,
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
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (selectedCrypto) {
      requestAnimationFrame(() => setIsSheetOpen(true));
    } else {
      setIsSheetOpen(false);
    }
  }, [selectedCrypto]);

  const closeSheet = () => {
    setIsSheetOpen(false);
    setTimeout(() => {
      setSelectedCrypto(null);
    }, 300);
  };

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
      } catch (err) {
        setError('Failed to load market data');
      } finally {
        setLoading(false);
      }
    };
    fetchMarketData();
  };

  const formatPrice = (num: number | undefined | null) => {
    if (num === null || num === undefined) return '$0.00';
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const formatLargeNumber = (num: number | undefined | null) => {
    if (num === null || num === undefined) return '$0.00';
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const renderContent = () => {
    if (loading && data.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-primary">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-[var(--color-border)] border-t-[var(--color-brand-accent)] mx-auto mb-4"></div>
            Loading market data...
          </div>
        </div>
      );
    }

    if (error && data.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-danger">
          <div className="text-center">
            <p className="mb-4">{error}</p>
            <button onClick={handleRefresh} className="btn btn-primary">
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (isMobile) {
      return (
        <div className="">
          {data.map(coin => (
            <div
              key={coin._id}
              onClick={() => setSelectedCrypto(coin)}
              className="flex items-center justify-between py-4 px-4 hover:bg-hover active:bg-tertiary transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <img
                  src={coin.image}
                  alt={coin.name}
                  className="w-10 h-10 rounded-full flex-shrink-0 bg-secondary border border-color"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-primary text-base">
                    {coin.symbol.toUpperCase()}
                  </div>
                  <div className="text-xs text-muted font-medium mt-0.5">{coin.name}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-primary font-bold text-base tracking-tight">
                  {formatPrice(coin.currentPrice)}
                </div>
                <div
                  className={`text-xs font-semibold mt-0.5 ${
                    coin.priceChangePercentage24h >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {coin.priceChangePercentage24h >= 0 ? '+' : ''}
                  {coin.priceChangePercentage24h.toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-tertiary/50 sticky top-0 z-10 backdrop-blur-sm">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">#</th>
              <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">
                Coin
              </th>
              <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider text-right">
                Price
              </th>
              <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider text-right">
                24h
              </th>
              <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider text-right hidden md:table-cell">
                High
              </th>
              <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider text-right hidden md:table-cell">
                Low
              </th>
              <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider text-right hidden lg:table-cell">
                Mkt Cap
              </th>
              <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider text-right hidden lg:table-cell">
                Vol (24h)
              </th>
            </tr>
          </thead>
          <tbody className="">
            {data.map(coin => (
              <tr
                key={coin._id}
                onClick={() => setSelectedCrypto(coin)}
                className="hover:bg-hover transition-colors cursor-pointer group"
              >
                <td className="px-6 py-4 text-sm font-medium text-muted">{coin.marketCapRank}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <img src={coin.image} alt={coin.name} className="w-8 h-8 rounded-full" />
                    <div>
                      <div className="font-semibold text-primary group-hover:text-brand-primary transition-colors">
                        {coin.name}
                      </div>
                      <div className="text-xs text-muted font-medium uppercase">{coin.symbol}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right font-semibold text-primary">
                  {formatPrice(coin.currentPrice)}
                </td>
                <td className="px-6 py-4 text-right">
                  <span
                    className={`font-semibold inline-flex items-center gap-0.5 ${
                      coin.priceChangePercentage24h >= 0 ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {coin.priceChangePercentage24h >= 0 ? (
                      <ArrowUp size={12} />
                    ) : (
                      <ArrowDown size={12} />
                    )}
                    {Math.abs(coin.priceChangePercentage24h).toFixed(2)}%
                  </span>
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium hidden md:table-cell text-primary/80">
                  {formatPrice(coin.high24h)}
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium hidden md:table-cell text-primary/80">
                  {formatPrice(coin.low24h)}
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium hidden lg:table-cell text-primary/80">
                  {formatLargeNumber(coin.marketCap)}
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium hidden lg:table-cell text-primary/80">
                  {formatLargeNumber(coin.totalVolume)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

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
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      >
        {renderContent()}
      </PageLayout>

      {selectedCrypto && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end md:justify-center md:items-center px-0 md:px-4"
          aria-hidden={!isSheetOpen}
        >
          <div
            className={`fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300 ${
              isSheetOpen ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={closeSheet}
          />

          <div
            className={`
              relative w-full md:max-w-xl bg-secondary md:rounded-3xl 
              rounded-t-3xl shadow-2xl border-t md:border border-color 
              max-h-[90dvh] overflow-hidden flex flex-col
              transition-all duration-300 ease-out
              ${isSheetOpen ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-full opacity-0 md:translate-y-8 md:scale-95'}
            `}
          >
            <div className="sticky top-0 bg-secondary/95 backdrop-blur-sm border-b border-color p-5 flex justify-between items-center z-10 shrink-0">
              <div className="flex items-center gap-3">
                <img
                  src={selectedCrypto.image}
                  alt={selectedCrypto.name}
                  className="w-10 h-10 rounded-full bg-tertiary"
                />
                <div>
                  <h2 className="text-lg font-bold leading-tight">{selectedCrypto.name}</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted uppercase tracking-wider bg-tertiary px-1.5 py-0.5 rounded-md">
                      {selectedCrypto.symbol}
                    </span>
                    <span className="text-xs text-muted">Rank #{selectedCrypto.marketCapRank}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={closeSheet}
                className="btn-ghost p-2 rounded-full hover:bg-tertiary text-muted hover:text-primary transition-colors"
              >
                {isMobile ? <ChevronDown size={24} /> : <X size={24} />}
              </button>
            </div>

            <div className="overflow-y-auto p-5 md:p-6 space-y-8">
              <div className="flex flex-col items-center justify-center py-4">
                <span className="text-sm font-medium text-muted mb-1">Current Price</span>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-primary mb-2">
                  {formatPrice(selectedCrypto.currentPrice)}
                </h1>
                <div className="flex gap-3">
                  <div
                    className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold
                        ${
                          selectedCrypto.priceChangePercentage24h >= 0
                            ? 'bg-success-bg/50 text-success'
                            : 'bg-danger-bg/50 text-danger'
                        }
                     `}
                  >
                    {selectedCrypto.priceChangePercentage24h >= 0 ? (
                      <TrendingUp size={16} />
                    ) : (
                      <TrendingUp size={16} className="rotate-180" />
                    )}
                    {Math.abs(selectedCrypto.priceChangePercentage24h).toFixed(2)}%
                  </div>
                  {selectedCrypto.priceChange24h && (
                    <div
                      className={`
                           flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold bg-tertiary text-secondary
                        `}
                    >
                      {selectedCrypto.priceChange24h >= 0 ? '+' : ''}
                      {formatPrice(selectedCrypto.priceChange24h)}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-tertiary/40 rounded-2xl p-4 flex flex-col items-center text-center">
                  <div className="text-xs font-bold text-muted uppercase mb-1">24h High</div>
                  <div className="text-lg font-bold text-success">
                    {formatPrice(selectedCrypto.high24h)}
                  </div>
                </div>
                <div className="bg-tertiary/40 rounded-2xl p-4 flex flex-col items-center text-center">
                  <div className="text-xs font-bold text-muted uppercase mb-1">24h Low</div>
                  <div className="text-lg font-bold text-danger">
                    {formatPrice(selectedCrypto.low24h)}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider">
                  Market Data
                </h3>

                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-color/40">
                    <span className="text-secondary font-medium flex items-center gap-2">
                      <Globe size={16} className="text-muted" /> Market Cap
                    </span>
                    <div className="text-right">
                      <div className="font-bold">{formatLargeNumber(selectedCrypto.marketCap)}</div>
                      {selectedCrypto.marketCapChangePercentage_24h && (
                        <div
                          className={`text-xs font-medium ${selectedCrypto.marketCapChangePercentage_24h >= 0 ? 'text-success' : 'text-danger'}`}
                        >
                          {selectedCrypto.marketCapChangePercentage_24h >= 0 ? '+' : ''}
                          {selectedCrypto.marketCapChangePercentage_24h.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-color/40">
                    <span className="text-secondary font-medium flex items-center gap-2">
                      <RefreshCw size={16} className="text-muted" /> Volume (24h)
                    </span>
                    <span className="font-bold">
                      {formatLargeNumber(selectedCrypto.totalVolume)}
                    </span>
                  </div>

                  {selectedCrypto.roi && (
                    <div className="flex justify-between items-center py-2 border-b border-color/40">
                      <span className="text-secondary font-medium flex items-center gap-2">
                        <BarChart3 size={16} className="text-muted" /> ROI
                      </span>
                      <span
                        className={`font-bold ${selectedCrypto.roi.percentage >= 0 ? 'text-success' : 'text-danger'}`}
                      >
                        {selectedCrypto.roi.percentage.toFixed(2)}%
                        <span className="text-xs text-muted font-normal ml-1">
                          ({selectedCrypto.roi.currency})
                        </span>
                      </span>
                    </div>
                  )}
                  {selectedCrypto.fullyDilutedValuation && (
                    <div className="flex justify-between items-center py-2 border-b border-color/40">
                      <span className="text-secondary font-medium flex items-center gap-2">
                        <Percent size={16} className="text-muted" /> Fully Diluted
                      </span>
                      <span className="font-bold">
                        {formatLargeNumber(selectedCrypto.fullyDilutedValuation)}
                      </span>
                    </div>
                  )}

                  {selectedCrypto.circulatingSupply && (
                    <div className="flex justify-between items-center py-2 border-b border-color/40">
                      <span className="text-secondary font-medium flex items-center gap-2">
                        <Clock size={16} className="text-muted" /> Circ. Supply
                      </span>
                      <span className="font-bold">
                        {formatLargeNumber(selectedCrypto.circulatingSupply)}{' '}
                        <span className="text-xs text-muted uppercase">
                          {selectedCrypto.symbol}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider">
                  Historical
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted mb-1">All-Time High</div>
                    <div className="font-bold text-primary">{formatPrice(selectedCrypto.ath)}</div>
                    <div className="text-xs text-danger font-medium">
                      {selectedCrypto.athChangePercentage.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {formatDate(selectedCrypto.athDate)}
                    </div>
                  </div>
                  {selectedCrypto.atl && (
                    <div>
                      <div className="text-xs text-muted mb-1">All-Time Low</div>
                      <div className="font-bold text-primary">
                        {formatPrice(selectedCrypto.atl)}
                      </div>
                      <div className="text-xs text-success font-medium">
                        +{selectedCrypto.atlChangePercentage?.toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-muted mt-0.5">
                        {formatDate(selectedCrypto.atlDate)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CryptoMarket;
