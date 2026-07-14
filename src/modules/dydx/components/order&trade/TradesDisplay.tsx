import { memo, useCallback, useMemo } from 'react';

import { useTrades } from '../../hooks/useTrades';
import useMarketStore from '../../store/marketStore';

interface Trade {
  id: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  createdAt: string;
}

interface TradeRowProps {
  trade: Trade;
  depthPct: number;
  formatPrice: (p: string) => string;
  formatSize: (s: string) => string;
  formatTime: (t: string) => string;
}

const TradeRow = memo(
  function TradeRow({ trade, depthPct, formatPrice, formatSize, formatTime }: TradeRowProps) {
    const isBuy = trade.side === 'BUY';
    return (
      <div
        className={`grid grid-cols-3 px-1 md:px-2 lg:px-4 py-1.5 hover:bg-hover relative overflow-hidden transition-colors duration-150 ${
          isBuy ? 'animate-trade-enter-buy' : 'animate-trade-enter-sell'
        }`}
      >
        <div
          className={`absolute inset-y-0 right-0 origin-right transition-transform duration-200 ease-out ${isBuy ? 'bg-success/10' : 'bg-danger/10'}`}
          style={{ width: '100%', transform: `scaleX(${depthPct})` }}
        />
        <div
          className={`relative font-medium text-xs lg:text-[13px] tabular-nums text-left ${isBuy ? 'text-success' : 'text-danger'}`}
        >
          {formatSize(trade.size)}
        </div>
        <div className="relative text-xs lg:text-[13px] text-primary tabular-nums text-center">
          ${formatPrice(trade.price)}
        </div>
        <div className="relative text-xs lg:text-[13px] text-muted tabular-nums text-right">
          {formatTime(trade.createdAt)}
        </div>
      </div>
    );
  },
  (p, n) => p.trade.id === n.trade.id && p.depthPct === n.depthPct
);

const SkeletonTradeRow = memo(function SkeletonTradeRow({ index }: { index: number }) {
  const widths = [
    ['w-[45%]', 'w-[60%]', 'w-[52%]'],
    ['w-[38%]', 'w-[55%]', 'w-[48%]'],
    ['w-[52%]', 'w-[65%]', 'w-[44%]'],
    ['w-[42%]', 'w-[58%]', 'w-[56%]'],
  ];
  const [w1, w2, w3] = widths[index % widths.length];
  const isBuy = index % 3 !== 0;
  return (
    <div className="grid grid-cols-3 px-1 md:px-2 lg:px-4 py-1.5 relative overflow-hidden">
      <div
        className={`skeleton-shimmer rounded h-[13px] ${w1} ${isBuy ? 'bg-success/15' : 'bg-danger/15'}`}
      />
      <div className={`skeleton-shimmer rounded h-[13px] ${w2} bg-primary/10 mx-auto`} />
      <div className={`skeleton-shimmer rounded h-[13px] ${w3} bg-primary/8 ml-auto`} />
    </div>
  );
});

export default function TradesDisplay() {
  const { selectedMarket } = useMarketStore();
  const { trades, isLoading } = useTrades(selectedMarket, 50);

  const maxTradeSize = useMemo(() => {
    if (!trades.length) return 1;
    return trades.reduce((max, t) => Math.max(max, parseFloat(t.size) || 0), 1);
  }, [trades]);

  const formatPrice = useCallback(
    (p: string) =>
      parseFloat(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    []
  );
  const formatSize = useCallback((s: string) => parseFloat(s).toFixed(4), []);
  const formatTime = useCallback(
    (t: string) =>
      new Date(t).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
    []
  );

  const [baseCurrency, quoteCurrency] = useMemo(
    () => selectedMarket.split('-') as [string, string],
    [selectedMarket]
  );

  const showSkeleton = isLoading && trades.length === 0;

  return (
    <div className="w-full h-full flex flex-col bg-secondary text-primary font-medium text-sm select-none">
      <div className="flex items-center shrink-0 justify-between px-1 md:px-2 lg:px-4 py-2 border-b border-color">
        <span className="text-muted text-xs font-semibold hidden lg:block">Recent Trades</span>
        <div className="flex items-center gap-2">
          <span className="text-primary font-semibold">{baseCurrency}</span>
          <span className="text-muted">/</span>
          <span className="text-muted">{quoteCurrency}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 shrink-0 px-1 md:px-2 lg:px-4 py-2 text-[10px] md:text-xs text-muted border-b border-color font-medium">
        <div className="text-left">
          Size{' '}
          <span className="bg-primary text-muted px-1 py-0.5 rounded text-[9px] md:text-[10px] ml-1">
            {baseCurrency}
          </span>
        </div>
        <div className="text-center">
          Price{' '}
          <span className="bg-primary text-muted px-1 py-0.5 rounded text-[9px] md:text-[10px] ml-1">
            {quoteCurrency}
          </span>
        </div>
        <div className="text-right">Time</div>
      </div>

      <div className="relative flex-1 overflow-auto hide-scrollbar">
        {showSkeleton
          ? Array.from({ length: 20 }).map((_, i) => <SkeletonTradeRow key={i} index={i} />)
          : trades.map(t => (
              <TradeRow
                key={t.id}
                trade={t}
                depthPct={maxTradeSize > 0 ? (parseFloat(t.size) || 0) / maxTradeSize : 0}
                formatPrice={formatPrice}
                formatSize={formatSize}
                formatTime={formatTime}
              />
            ))}
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { scrollbar-width: none; }

        @keyframes shimmer {
          0%   { opacity: 0.35; }
          50%  { opacity: 0.85; }
          100% { opacity: 0.35; }
        }
        .skeleton-shimmer {
          animation: shimmer 1.4s ease-in-out infinite;
        }

        @keyframes trade-enter {
          from {
            opacity: 0;
            transform: translateY(-4px);
            background-color: var(--flash-color);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            background-color: transparent;
          }
        }
        .animate-trade-enter-buy {
          animation: trade-enter 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
          --flash-color: rgba(14, 203, 129, 0.15);
        }
        .animate-trade-enter-sell {
          animation: trade-enter 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
          --flash-color: rgba(255, 77, 77, 0.15);
        }
      `}</style>
    </div>
  );
}
