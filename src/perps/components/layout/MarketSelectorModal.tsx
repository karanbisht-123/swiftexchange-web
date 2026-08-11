import React, { useCallback, useEffect, useMemo, useState } from 'react';

import type { Market } from '../../core/models';
import { useLeverageStore } from '../../core/stores/leverageStore';
import { marketStore, useMarketStore } from '../../core/stores/marketStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { CoinIcon } from '../ui/CoinIcon';

interface MarketSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MarketSelectorModal: React.FC<MarketSelectorModalProps> = ({ isOpen, onClose }) => {
  const marketMap = useMarketStore(state => state.markets);
  const markets = useMemo(() => Object.values(marketMap), [marketMap]);
  const assetCtxByMarket = useTickerStore(state => state.assetCtxByMarket);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filteredMarkets = useMemo(() => {
    const q = search.toLowerCase();
    return markets.filter(
      m => m.symbol.toLowerCase().includes(q) || m.baseAsset.toLowerCase().includes(q)
    );
  }, [markets, search]);

  const handleSelect = useCallback(
    (symbol: string) => {
      marketStore.setSelectedSymbol(symbol);
      onClose();
    },
    [onClose]
  );

  if (!isOpen) return null;

  const tabs = ['All', 'Favorites', 'Crypto', 'Stocks', 'Commodities', 'Indices'];

  return (
    <>
      <style>{`
        @keyframes slideUpModal {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up-modal {
          animation: slideUpModal 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <div
        className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 "
        onClick={onClose}
      >
        <div
          className="w-full sm:max-w-3xl bg-secondary border border-color rounded-t-xl sm:rounded-xl flex flex-col shadow-2xl font-body h-[85vh] sm:h-auto max-h-[85vh] animate-slide-up-modal"
          onClick={e => e.stopPropagation()}
        >
          {/* Search */}
          <div className="p-4 border-b border-color">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                className="w-full bg-secondary border border-color rounded-lg py-2.5 pl-10 pr-4 text-sm text-primary outline-none focus:border-brand transition-colors"
                placeholder="Search by name or ticker"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="px-4 border-b border-color flex items-center gap-2 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap px-3 py-3 text-[13px] font-medium border-b-2 transition-colors ${activeTab === tab ? 'text-primary border-brand' : 'text-secondary border-transparent hover:text-primary'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Column Headers */}
          <div className="grid grid-cols-5 px-4 py-3 text-[11px] font-medium text-secondary border-b border-color">
            <div className="col-span-2">Name</div>
            <div className="text-right">Mark Price</div>
            <div className="text-right">24h Change</div>
            <div className="text-right">24h Volume</div>
          </div>

          {/* Market List */}
          <div className="flex-1 overflow-y-auto max-h-[400px]">
            {filteredMarkets.length === 0 ? (
              <div className="p-8 text-center text-muted text-sm">
                {markets.length === 0 ? 'Fetching markets…' : 'No markets match your search.'}
              </div>
            ) : (
              filteredMarkets.map(market => (
                <MarketRow
                  key={market.symbol}
                  market={market}
                  assetCtx={assetCtxByMarket[market.symbol]}
                  onSelect={handleSelect}
                />
              ))
            )}
          </div>

          {/* Footer hints */}
          <div className="p-3 border-t border-color bg-secondary flex items-center gap-4 text-[10px] text-muted rounded-b-xl shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="bg-tertiary px-1.5 py-0.5 rounded border border-color font-mono">
                ↵
              </span>{' '}
              Select
            </div>
            <div className="flex items-center gap-1.5">
              <span className="bg-tertiary px-1.5 py-0.5 rounded border border-color font-mono">
                Esc
              </span>{' '}
              Close
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// Extracted to avoid re-rendering the whole list when a single ticker updates
const MarketRow = React.memo(function MarketRow({
  market,
  assetCtx,
  onSelect,
}: {
  market: Market;
  assetCtx: ReturnType<typeof useTickerStore.getState>['assetCtxByMarket'][string] | undefined;
  onSelect: (symbol: string) => void;
}) {
  const markPx = parseFloat(assetCtx?.markPx || '0');
  const prevDayPx = parseFloat(assetCtx?.prevDayPx || '0');
  const dayNtlVlm = parseFloat(assetCtx?.dayNtlVlm || '0');
  const changePct = prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;
  const isPositive = changePct >= 0;

  const formatPrice = (v: number) =>
    v > 0
      ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
      : '—';

  const formatVolume = (v: number) => {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return v > 0 ? `$${v.toFixed(2)}` : '—';
  };

  // Get max leverage from store
  const maxLeverage = useLeverageStore(state => {
    const brackets = state.bracketsBySymbol[market.symbol.replace('-', '')];
    if (!brackets || brackets.length === 0) return market.maxLeverage > 0 ? market.maxLeverage : 20;
    return Math.max(...brackets.map(b => b.initialLeverage));
  });

  return (
    <div
      onClick={() => onSelect(market.symbol)}
      className="grid grid-cols-5 px-4 py-3 items-center hover:bg-secondary cursor-pointer border-b border-color/50 transition-colors"
    >
      <div className="col-span-2 flex items-center gap-3">
        {/* Asset Icon */}
        <CoinIcon symbol={market.baseAsset} size={28} />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-primary">{market.symbol}</span>
            {/* Leverage Pill */}
            <span className="px-1.5 py-[1px] rounded text-[9px] font-semibold bg-tertiary border border-color text-muted">
              {maxLeverage}x
            </span>
          </div>
          <div className="text-[11px] text-muted">{market.baseAsset}</div>
        </div>
      </div>

      <div className="text-right text-[13px] font-medium text-primary font-mono-tabular">
        {formatPrice(markPx)}
      </div>

      <div
        className={`text-right text-[13px] font-medium ${isPositive ? 'text-success' : 'text-danger'}`}
      >
        {markPx > 0 ? `${isPositive ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
      </div>

      <div className="text-right text-[13px] text-secondary">{formatVolume(dayNtlVlm)}</div>
    </div>
  );
});
