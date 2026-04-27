import { useEffect, useMemo, useRef, useState } from 'react';

import { useMarkets } from '../../hooks/useMarkets';
import { useOrderbook } from '../../hooks/useOrderbook';
import useMarketStore from '../../store/marketStore';
import { useOrderbookClickStore } from '../../store/orderbookClickStore';

interface OrderbookRow {
  price: number;
  size: number;
  usdSize: number;
  total: number;
  usdTotal: number;
}

// Skeleton shimmer row 
const SkeletonRow = ({ isAsk = false }: { isAsk?: boolean }) => (
  <div className="grid grid-cols-3 px-1 md:px-2 lg:px-4 py-0.5 my-0.5 relative overflow-hidden">
    <div
      className={`skeleton-shimmer rounded h-[13px] w-[68%] ${isAsk ? 'bg-danger/15' : 'bg-success/15'
        }`}
    />
    <div className="skeleton-shimmer rounded h-[13px] w-[52%] bg-primary/10 ml-auto" />
    <div className="skeleton-shimmer rounded h-[13px] w-[44%] bg-primary/8 ml-auto" />
  </div>
);


const Orderbook = () => {
  const { selectedMarket } = useMarketStore();
  const { onPriceClick } = useOrderbookClickStore();
  const { orderbook, isConnected, isLoading } = useOrderbook(selectedMarket);
  const { getMarket } = useMarkets();

  const marketData = getMarket(selectedMarket);
  const baseTickSize = marketData?.tickSize ? parseFloat(marketData.tickSize) : 1;

  const [displayMode, setDisplayMode] = useState<'base' | 'usd'>('base');
  const [groupIndex, setGroupIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const [maxRows, setMaxRows] = useState(10);
  const ROW_HEIGHT = 20;

  const multipliers = [1, 5, 10, 50, 100];
  const currentTickSize = baseTickSize * multipliers[groupIndex];

  const { bids, asks, spread, spreadPct, maxBaseTotal, maxUsdTotal } = useMemo(() => {
    if (!orderbook?.bids?.length || !orderbook?.asks?.length) {
      return {
        bids: [],
        asks: [],
        spread: null,
        spreadPct: null,
        maxBaseTotal: 1,
        maxUsdTotal: 1,
      };
    }

    const aggregatedBids = new Map<number, number>();
    orderbook.bids.forEach(o => {
      const price = parseFloat(o.price);
      const size = parseFloat(o.size) || 0;
      if (size > 0 && !isNaN(price)) {
        let groupedPrice = Math.floor(price / currentTickSize) * currentTickSize;
        groupedPrice = parseFloat(groupedPrice.toFixed(8));
        aggregatedBids.set(groupedPrice, (aggregatedBids.get(groupedPrice) || 0) + size);
      }
    });

    const aggregatedAsks = new Map<number, number>();
    orderbook.asks.forEach(o => {
      const price = parseFloat(o.price);
      const size = parseFloat(o.size) || 0;
      if (size > 0 && !isNaN(price)) {
        let groupedPrice = Math.ceil(price / currentTickSize) * currentTickSize;
        groupedPrice = parseFloat(groupedPrice.toFixed(8));
        aggregatedAsks.set(groupedPrice, (aggregatedAsks.get(groupedPrice) || 0) + size);
      }
    });

    const sortedBids = Array.from(aggregatedBids.entries())
      .sort(([a], [b]) => b - a)
      .slice(0, maxRows);

    let bidCumBase = 0;
    let bidCumUsd = 0;
    const formattedBids: OrderbookRow[] = sortedBids.map(([price, size]) => {
      const usdSize = size * price;
      bidCumBase += size;
      bidCumUsd += usdSize;
      return { price, size, usdSize, total: bidCumBase, usdTotal: bidCumUsd };
    });

    const sortedAsks = Array.from(aggregatedAsks.entries())
      .sort(([a], [b]) => a - b)
      .slice(0, maxRows);

    let askCumBase = 0;
    let askCumUsd = 0;
    const formattedAsks: OrderbookRow[] = sortedAsks.map(([price, size]) => {
      const usdSize = size * price;
      askCumBase += size;
      askCumUsd += usdSize;
      return { price, size, usdSize, total: askCumBase, usdTotal: askCumUsd };
    });

    formattedAsks.reverse();

    let bestRawBid = 0;
    orderbook.bids.forEach(o => {
      const p = parseFloat(o.price);
      if (p > bestRawBid) bestRawBid = p;
    });

    let bestRawAsk = Infinity;
    orderbook.asks.forEach(o => {
      const p = parseFloat(o.price);
      if (p < bestRawAsk && p > 0) bestRawAsk = p;
    });
    if (bestRawAsk === Infinity) bestRawAsk = 0;

    const spr = bestRawAsk > 0 && bestRawBid > 0 ? Math.max(0, bestRawAsk - bestRawBid) : 0;
    const mid = bestRawBid > 0 && bestRawAsk > 0 ? (bestRawBid + bestRawAsk) / 2 : 0;
    const sprPct = mid > 0 && spr > 0 ? (spr / mid) * 100 : 0;

    const maxBaseTotal = Math.max(bidCumBase, askCumBase) || 1;
    const maxUsdTotal = Math.max(bidCumUsd, askCumUsd) || 1;

    return {
      bids: formattedBids,
      asks: formattedAsks,
      spread: spr,
      spreadPct: sprPct,
      maxBaseTotal,
      maxUsdTotal,
    };
  }, [orderbook, maxRows, currentTickSize]);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const availableHeight = entry.contentRect.height;
        const listHeight = (availableHeight - 120) / 2;
        const calculatedRows = Math.floor(listHeight / ROW_HEIGHT);
        setMaxRows(Math.max(calculatedRows, 2));
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [ROW_HEIGHT]);

  const base = selectedMarket.split('-')[0] || 'BTC';
  const quote = selectedMarket.split('-')[1] || 'USD';

  const handlePriceClick = (price: string) => {
    if (onPriceClick) {
      onPriceClick(price);
    }
  };

  const getDecimals = (val: number) => {
    if (val < 1) return 4;
    return 2;
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col bg-secondary text-primary font-medium text-sm select-none"
    >
      <div className="flex items-center justify-between shrink-0 px-1 md:px-2 lg:px-4 py-2 border-b border-color">
        <div className="flex items-center gap-1">
          <button
            className="text-primary hover:bg-hover px-1.5 py-0.5 rounded transition-colors disabled:opacity-50"
            onClick={() => setGroupIndex(Math.max(0, groupIndex - 1))}
            disabled={groupIndex === 0}
          >
            -
          </button>
          <button
            className="text-primary hover:bg-hover px-1.5 py-0.5 rounded transition-colors disabled:opacity-50"
            onClick={() => setGroupIndex(Math.min(multipliers.length - 1, groupIndex + 1))}
            disabled={groupIndex === multipliers.length - 1}
          >
            +
          </button>
          <span className="text-muted text-xs font-semibold ml-1">
            ${currentTickSize >= 1 ? currentTickSize : currentTickSize.toString()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-primary rounded p-0.5">
            <button
              className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors ${displayMode === 'base' ? 'bg-hover text-primary' : 'text-muted hover:text-primary'
                }`}
              onClick={() => setDisplayMode('base')}
            >
              {base}
            </button>
            <button
              className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors ${displayMode === 'usd' ? 'bg-hover text-primary' : 'text-muted hover:text-primary'
                }`}
              onClick={() => setDisplayMode('usd')}
            >
              {quote}
            </button>
          </div>
          <div
            className={`w-2 h-2 rounded-full hidden lg:block ${isConnected && !isLoading ? 'bg-success' : 'bg-warning'
              } ${isConnected ? 'animate-pulse' : ''}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 shrink-0 px-1 md:px-2 lg:px-4 py-2 text-xs text-muted border-b border-color font-medium">
        <div>
          Price{' '}
          <span className="bg-primary text-muted px-1 py-0.5 rounded text-[10px]">{quote}</span>
        </div>
        <div className="text-right">
          Size{' '}
          <span className="bg-primary text-muted px-1 py-0.5 rounded text-[10px]">
            {displayMode === 'base' ? base : quote}
          </span>
        </div>
        <div className="text-right">
          Total{' '}
          <span className="bg-primary text-muted px-1 py-0.5 rounded text-[10px]">
            {displayMode === 'base' ? base : quote}
          </span>
        </div>
      </div>

      {/* ── ASKS ─────────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-auto hide-scrollbar flex flex-col justify-end">
        {asks.map(ask => {
          const priceKey = ask.price.toString();
          const depthPct =
            displayMode === 'base'
              ? (ask.total / maxBaseTotal) * 100
              : (ask.usdTotal / maxUsdTotal) * 100;
          const displaySize =
            displayMode === 'base'
              ? ask.size.toFixed(4)
              : ask.usdSize.toLocaleString(undefined, {
                minimumFractionDigits: getDecimals(ask.usdSize),
                maximumFractionDigits: getDecimals(ask.usdSize),
              });
          const displayTotal =
            displayMode === 'base'
              ? ask.total.toFixed(4)
              : ask.usdTotal.toLocaleString(undefined, {
                minimumFractionDigits: getDecimals(ask.usdTotal),
                maximumFractionDigits: getDecimals(ask.usdTotal),
              });

          return (
            <div
              key={`ask-${priceKey}`}
              onClick={() => handlePriceClick(ask.price.toString())}
              className="grid grid-cols-3 px-1 md:px-2 lg:px-4 py-0.5 my-0.5 hover:bg-hover relative overflow-hidden transition-colors duration-150 cursor-pointer"
            >
              <div
                className="absolute inset-y-0 right-0 bg-danger/10 origin-right will-change-transform transition-transform duration-500 ease-out"
                style={{
                  width: '100%',
                  transform: `scaleX(${Math.min(1, depthPct / 100)})`,
                }}
              />
              <div className="relative text-danger font-semibold tabular-nums text-xs lg:text-[13px]">
                {ask.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="relative text-right text-primary tabular-nums text-xs lg:text-[13px]">
                {displaySize}
              </div>
              <div className="relative text-right text-muted tabular-nums text-xs lg:text-[13px]">
                {displayTotal}
              </div>
            </div>
          );
        })}

        {/* Skeleton rows shown while loading with no real data yet */}
        {isLoading && asks.length === 0 &&
          Array.from({ length: maxRows }).map((_, i) => (
            <SkeletonRow key={`ask-skel-${i}`} isAsk />
          ))
        }
      </div>

      {/* ── SPREAD ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 shrink-0 text-primary px-1 md:px-2 lg:px-4 py-2.5 border-y border-color bg-secondary shadow-sm text-xs lg:text-[13px]">
        <div className="text-muted font-medium">Spread</div>
        <div className="text-right font-semibold text-primary tabular-nums">
          {spread !== null && spread >= 0
            ? spread.toLocaleString(undefined, { minimumFractionDigits: 2 })
            : '0.00'}
        </div>
        <div className="text-right text-muted font-medium tabular-nums">
          {spreadPct !== null && spreadPct > 0 ? `${spreadPct.toFixed(3)}%` : '0.00%'}
        </div>
      </div>

      {/* ── BIDS ─────────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-auto hide-scrollbar">
        {bids.map(bid => {
          const priceKey = bid.price.toString();
          const depthPct =
            displayMode === 'base'
              ? (bid.total / maxBaseTotal) * 100
              : (bid.usdTotal / maxUsdTotal) * 100;
          const displaySize =
            displayMode === 'base'
              ? bid.size.toFixed(4)
              : bid.usdSize.toLocaleString(undefined, {
                minimumFractionDigits: getDecimals(bid.usdSize),
                maximumFractionDigits: getDecimals(bid.usdSize),
              });
          const displayTotal =
            displayMode === 'base'
              ? bid.total.toFixed(4)
              : bid.usdTotal.toLocaleString(undefined, {
                minimumFractionDigits: getDecimals(bid.usdTotal),
                maximumFractionDigits: getDecimals(bid.usdTotal),
              });

          return (
            <div
              key={`bid-${priceKey}`}
              onClick={() => handlePriceClick(bid.price.toString())}
              className="grid grid-cols-3 px-1 md:px-2 lg:px-4 py-0.5 my-0.5 hover:bg-hover relative overflow-hidden transition-colors duration-150 cursor-pointer"
            >
              <div
                className="absolute inset-y-0 right-0 bg-success/10 origin-right will-change-transform transition-transform duration-500 ease-out"
                style={{
                  width: '100%',
                  transform: `scaleX(${Math.min(1, depthPct / 100)})`,
                }}
              />
              <div className="relative text-success font-semibold tabular-nums text-xs lg:text-[13px]">
                {bid.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="relative text-right text-primary tabular-nums text-xs lg:text-[13px]">
                {displaySize}
              </div>
              <div className="relative text-right text-muted tabular-nums text-xs lg:text-[13px]">
                {displayTotal}
              </div>
            </div>
          );
        })}

        {isLoading && bids.length === 0 &&
          Array.from({ length: maxRows }).map((_, i) => (
            <SkeletonRow key={`bid-skel-${i}`} />
          ))
        }
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        @keyframes shimmer {
          0%   { opacity: 0.35; }
          50%  { opacity: 0.85; }
          100% { opacity: 0.35; }
        }
        .skeleton-shimmer {
          animation: shimmer 1.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default Orderbook;