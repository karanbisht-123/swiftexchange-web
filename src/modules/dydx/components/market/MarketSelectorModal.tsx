import { Search, Star, TrendingDown, TrendingUp, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type MarketData, useMarkets } from '../../hooks/useMarkets';
import useMarketStore from '../../store/marketStore';
import { formatMarketPrice } from '../../utils/BigNumberUtils';

interface MarketSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MarketRowProps {
  market: MarketData;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: (ticker: string, data: MarketData) => void;
  onToggleFavorite: (ticker: string) => void;
}

const MarketRow = memo(function MarketRow({
  market,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: MarketRowProps) {
  const priceChange = parseFloat(market.priceChange24H);
  const isPositive = priceChange >= 0;
  const percentChange = (priceChange * 100).toFixed(2);

  const formatPrice = (price: string) => {
    return formatMarketPrice(price);
  };

  const formatVolume = (volume: string) => {
    const num = parseFloat(volume);
    if (isNaN(num)) return '$0';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(market.ticker, market)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(market.ticker, market);
        }
      }}
      className={`w-full flex items-center gap-3 px-4 lg:px-4 py-4 lg:py-3 hover:bg-[#1e293b]/60 active:bg-[#1e293b]/80 cursor-pointer transition-colors border-b border-[#1e293b]/30 ${
        isSelected ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''
      }`}
    >
      <button
        onClick={e => {
          e.stopPropagation();
          onToggleFavorite(market.ticker);
        }}
        className="flex-shrink-0 p-2 lg:p-1 -m-2 lg:-m-1 hover:scale-110 active:scale-95 transition-transform"
      >
        <Star
          className={`w-5 h-5 lg:w-4 lg:h-4 ${
            isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600 hover:text-slate-400'
          }`}
        />
      </button>

      <div className="relative w-10 h-10 lg:w-8 lg:h-8 flex-shrink-0">
        {market.coinIcon ? (
          <img
            src={market.coinIcon}
            alt={market.ticker}
            className="w-10 h-10 lg:w-8 lg:h-8 rounded-full"
            onError={e => {
              const img = e.currentTarget;
              img.style.display = 'none';
              const fallback = img.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="w-10 h-10 lg:w-8 lg:h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-xs lg:text-[10px] font-bold absolute top-0 left-0"
          style={{ display: market.coinIcon ? 'none' : 'flex' }}
        >
          {market.ticker.split('-')[0].slice(0, 2)}
        </div>
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="font-medium text-white text-base lg:text-sm flex items-center gap-1.5">
          <span>{market.ticker.split('-')[0]}</span>
          <span className="text-slate-500 text-sm lg:text-xs">/USD</span>
        </div>
        <div className="text-xs lg:text-[11px] text-slate-500 truncate">
          {market.coinName || 'Perpetual'}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className="text-base lg:text-sm font-medium text-white font-mono">
          ${formatPrice(market.oraclePrice)}
        </div>
        <div
          className={`text-sm lg:text-xs font-medium flex items-center justify-end gap-0.5 ${
            isPositive ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {isPositive ? (
            <TrendingUp className="w-3.5 h-3.5 lg:w-3 lg:h-3" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 lg:w-3 lg:h-3" />
          )}
          {isPositive ? '+' : ''}
          {percentChange}%
        </div>
      </div>

      <div className="text-right flex-shrink-0 hidden lg:block min-w-[70px]">
        <div className="text-[10px] text-slate-500">Vol</div>
        <div className="text-xs text-slate-300 font-medium">{formatVolume(market.volume24H)}</div>
      </div>
    </div>
  );
});

type TabType = 'all' | 'favorites';

export default function MarketSelectorModal({ isOpen, onClose }: MarketSelectorModalProps) {
  const { marketsList, isLoading } = useMarkets();
  const { selectedMarket, setSelectedMarket } = useMarketStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('market_favorites');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 300);
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    localStorage.setItem('market_favorites', JSON.stringify([...favorites]));
  }, [favorites]);

  const toggleFavorite = useCallback((ticker: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (ticker: string, data: MarketData) => {
      setSelectedMarket(ticker, data);
      onClose();
    },
    [setSelectedMarket, onClose]
  );

  const filteredMarkets = useMemo(() => {
    let filtered = marketsList;

    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        m => m.ticker.toLowerCase().includes(term) || m.coinName?.toLowerCase().includes(term)
      );
    }

    if (activeTab === 'favorites') {
      filtered = filtered.filter(m => favorites.has(m.ticker));
    }

    return filtered;
  }, [marketsList, searchTerm, activeTab, favorites]);

  const itemHeight = isMobile ? 88 : 76;
  const containerHeight = typeof window !== 'undefined' ? window.innerHeight - 220 : 600;
  const totalHeight = filteredMarkets.length * itemHeight;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const visibleItems = useMemo(() => {
    const startNode = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, startNode - 2);
    const endIndex = Math.min(filteredMarkets.length, startNode + visibleCount + 2);

    return filteredMarkets.slice(startIndex, endIndex).map((market, index) => ({
      market,
      index: startIndex + index,
      top: (startIndex + index) * itemHeight,
    }));
  }, [scrollTop, itemHeight, containerHeight, filteredMarkets]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`fixed top-0 left-0 z-50 h-full w-full lg:max-w-sm bg-secondary border-r border-[#334155] shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 lg:px-4 py-4 lg:py-3 border-b border-[#334155] pt-safe">
          <h2 className="text-xl lg:text-lg font-semibold text-white">Markets</h2>
          <button
            onClick={onClose}
            className="p-2.5 lg:p-2 hover:bg-[#334155] active:bg-[#334155]/80 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 lg:w-5 lg:h-5 text-slate-400" />
          </button>
        </div>

        <div className="px-4 py-4 lg:py-3 border-b border-[#334155]/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 lg:w-4 lg:h-4 text-slate-500" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search markets..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-primary border border-[#334155] rounded-lg pl-10 lg:pl-9 pr-10 lg:pr-4 py-3 lg:py-2.5 text-base lg:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 active:text-slate-200 p-1"
              >
                <X className="w-5 h-5 lg:w-4 lg:h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex border-b border-[#334155]/50">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 px-4 py-3.5 lg:py-2.5 text-base lg:text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-300 active:text-slate-200'
            }`}
          >
            All Markets
          </button>
          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex-1 px-4 py-3.5 lg:py-2.5 text-base lg:text-sm font-medium transition-colors flex items-center justify-center gap-2 lg:gap-1.5 ${
              activeTab === 'favorites'
                ? 'text-white border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-300 active:text-slate-200'
            }`}
          >
            <Star className="w-5 h-5 lg:w-4 lg:h-4" />
            Favorites
            {favorites.size > 0 && (
              <span className="bg-[#334155] text-xs px-2 py-0.5 lg:px-1.5 rounded-full">
                {favorites.size}
              </span>
            )}
          </button>
        </div>

        <div
          ref={listRef}
          className="overflow-y-auto overscroll-contain relative"
          style={{
            height: 'calc(100vh - 220px)',
            WebkitOverflowScrolling: 'touch',
          }}
          onScroll={handleScroll}
        >
          {isLoading ? (
            <div className="py-16 lg:py-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 lg:h-8 lg:w-8 border-2 border-slate-700 border-t-blue-500 mx-auto mb-4 lg:mb-3" />
              <p className="text-base lg:text-sm text-slate-500">Loading markets...</p>
            </div>
          ) : filteredMarkets.length > 0 ? (
            <div style={{ height: totalHeight, position: 'relative' }}>
              {visibleItems.map(({ market, top }) => (
                <div
                  key={market.ticker}
                  style={{
                    position: 'absolute',
                    top,
                    left: 0,
                    right: 0,
                    height: itemHeight,
                  }}
                >
                  <MarketRow
                    market={market}
                    isSelected={selectedMarket === market.ticker}
                    isFavorite={favorites.has(market.ticker)}
                    onSelect={handleSelect}
                    onToggleFavorite={toggleFavorite}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 lg:py-12 text-center px-4">
              <Search className="w-12 h-12 lg:w-10 lg:h-10 mx-auto mb-4 lg:mb-3 text-slate-700" />
              <p className="text-base lg:text-sm text-slate-500">
                {activeTab === 'favorites' && favorites.size === 0
                  ? 'No favorites yet'
                  : 'No markets found'}
              </p>
              {searchTerm && (
                <p className="text-sm lg:text-xs text-slate-600 mt-2 lg:mt-1">
                  Try a different search
                </p>
              )}
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 px-4 py-3 lg:py-2.5 border-t border-[#334155]/50 bg-secondary pb-safe">
          <p className="text-sm lg:text-xs text-slate-500 text-center">
            {filteredMarkets.length} of {marketsList.length} markets
          </p>
        </div>
      </div>
    </>
  );
}
