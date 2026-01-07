import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useOrderbook } from '../../hooks/useOrderbook';
import useMarketStore from '../../store/marketStore';
import { useOrderbookClickStore } from '../../store/orderbookClickStore';

interface OrderbookRow {
  price: number;
  size: number;
  total: number;
}

interface FlashState {
  type: 'up' | 'down' | 'new';
  timestamp: number;
}

const Orderbook: React.FC<{ maxRows?: number }> = ({ maxRows = 12 }) => {
  const { selectedMarket } = useMarketStore();
  const { onPriceClick } = useOrderbookClickStore();
  const [hoveredPrice, setHoveredPrice] = useState<string | null>(null);
  const { orderbook, isConnected, dataSource } = useOrderbook(selectedMarket);

  const prevBidsRef = useRef<Map<string, number>>(new Map());
  const prevAsksRef = useRef<Map<string, number>>(new Map());
  const prevMarketRef = useRef<string>(selectedMarket);
  const flashTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const animationFrameRef = useRef<number | null>(null);

  const [flashBids, setFlashBids] = useState<Map<string, FlashState>>(new Map());
  const [flashAsks, setFlashAsks] = useState<Map<string, FlashState>>(new Map());
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (prevMarketRef.current !== selectedMarket) {
      setIsTransitioning(true);

      prevBidsRef.current.clear();
      prevAsksRef.current.clear();
      setFlashBids(new Map());
      setFlashAsks(new Map());
      prevMarketRef.current = selectedMarket;

      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const transitionTimer = setTimeout(() => {
        if (mountedRef.current) {
          setIsTransitioning(false);
        }
      }, 50);

      return () => clearTimeout(transitionTimer);
    }
  }, [selectedMarket]);

  const clearFlashAnimations = useCallback(() => {
    if (!mountedRef.current) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      setFlashBids(new Map());
      setFlashAsks(new Map());
      animationFrameRef.current = null;
    });
  }, []);

  useEffect(() => {
    if (
      !orderbook?.bids?.length ||
      !orderbook?.asks?.length ||
      !mountedRef.current ||
      isTransitioning
    ) {
      return;
    }

    const currentBidPrices = new Set(orderbook.bids.map(b => b.price));
    const currentAskPrices = new Set(orderbook.asks.map(a => a.price));

    for (const key of prevBidsRef.current.keys()) {
      if (!currentBidPrices.has(key)) {
        prevBidsRef.current.delete(key);
      }
    }

    for (const key of prevAsksRef.current.keys()) {
      if (!currentAskPrices.has(key)) {
        prevAsksRef.current.delete(key);
      }
    }

    const newFlashBids = new Map<string, FlashState>();
    const newFlashAsks = new Map<string, FlashState>();
    const timestamp = Date.now();

    orderbook.bids.slice(0, maxRows).forEach(bid => {
      const priceKey = bid.price;
      const size = parseFloat(bid.size) || 0;
      const prev = prevBidsRef.current.get(priceKey);

      if (prev === undefined) {
        newFlashBids.set(priceKey, { type: 'new', timestamp });
      } else if (size > prev) {
        newFlashBids.set(priceKey, { type: 'up', timestamp });
      } else if (size < prev) {
        newFlashBids.set(priceKey, { type: 'down', timestamp });
      }

      prevBidsRef.current.set(priceKey, size);
    });

    orderbook.asks.slice(0, maxRows).forEach(ask => {
      const priceKey = ask.price;
      const size = parseFloat(ask.size) || 0;
      const prev = prevAsksRef.current.get(priceKey);

      if (prev === undefined) {
        newFlashAsks.set(priceKey, { type: 'new', timestamp });
      } else if (size > prev) {
        newFlashAsks.set(priceKey, { type: 'up', timestamp });
      } else if (size < prev) {
        newFlashAsks.set(priceKey, { type: 'down', timestamp });
      }

      prevAsksRef.current.set(priceKey, size);
    });

    if ((newFlashBids.size > 0 || newFlashAsks.size > 0) && mountedRef.current) {
      setFlashBids(newFlashBids);
      setFlashAsks(newFlashAsks);

      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
      }

      flashTimerRef.current = window.setTimeout(() => {
        clearFlashAnimations();
        flashTimerRef.current = null;
      }, 600);
    }
  }, [orderbook, maxRows, isTransitioning, clearFlashAnimations]);

  const { bids, asks, spread, spreadPct, maxTotal } = useMemo(() => {
    if (!orderbook?.bids?.length || !orderbook?.asks?.length) {
      return {
        bids: [],
        asks: [],
        spread: null,
        spreadPct: null,
        maxTotal: 1,
      };
    }

    const formattedBids: OrderbookRow[] = [];
    const formattedAsks: OrderbookRow[] = [];

    let bidCum = 0;
    let askCum = 0;

    orderbook.bids.slice(0, maxRows).forEach(o => {
      const price = parseFloat(o.price);
      const size = parseFloat(o.size) || 0;

      if (size > 0 && !isNaN(price)) {
        bidCum += size;
        formattedBids.push({ price, size, total: bidCum });
      }
    });

    orderbook.asks.slice(0, maxRows).forEach(o => {
      const price = parseFloat(o.price);
      const size = parseFloat(o.size) || 0;

      if (size > 0 && !isNaN(price)) {
        askCum += size;
        formattedAsks.push({ price, size, total: askCum });
      }
    });

    formattedAsks.reverse();

    const bestBid = formattedBids[0]?.price || 0;
    const bestAsk = formattedAsks[formattedAsks.length - 1]?.price || 0;
    const mid = (bestBid + bestAsk) / 2;
    const spr = bestAsk - bestBid;
    const sprPct = mid > 0 ? (spr / mid) * 100 : 0;
    const maxTotal = Math.max(bidCum, askCum) || 1;

    return {
      bids: formattedBids,
      asks: formattedAsks,
      spread: spr,
      spreadPct: sprPct,
      maxTotal,
    };
  }, [orderbook, maxRows]);

  const base = selectedMarket.split('-')[0] || 'BTC';
  const quote = selectedMarket.split('-')[1] || 'USD';

  const handlePriceClick = (price: string) => {
    if (onPriceClick) {
      onPriceClick(price);
    }
  };
  return (
    <div className="w-full max-w-md bg-[#0e0c15] text-white font-medium text-sm select-none">
      <div className="flex items-center justify-between px-1 md:px-2 lg:px-4 py-2 border-b border-[#232027]">
        <div className=" items-center gap-3 hidden lg:flex">
          <span className="text-[#aaaaaa] text-xs font-semibold ">Orderbook</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold">{base}</span>
          <span className="text-[#aaaaaa]">/</span>
          <span className="text-[#aaaaaa]">{quote}</span>
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected && dataSource === 'websocket' ? 'bg-[#00ff9d]' : 'bg-[#ffaa00]'
            } ${isConnected ? 'animate-pulse' : ''}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 px-1 md:px-2 lg:px-4 py-2 text-xs text-[#6b6b76] border-b border-[#232027] font-medium">
        <div>Price ({quote})</div>
        <div className="text-right">Size ({base})</div>
        <div className="text-right">Total ({base})</div>
      </div>

      <div className="relative max-h-[200px] overflow-auto hide-scrollbar">
        {asks.map(ask => {
          const priceKey = ask.price.toString();
          const flash = flashAsks.get(priceKey);
          const depthPct = (ask.total / maxTotal) * 100;

          return (
            <div
              key={`ask-${priceKey}`}
              onClick={() => handlePriceClick(ask.price.toString())}
              onMouseEnter={() => setHoveredPrice(priceKey)}
              onMouseLeave={() => setHoveredPrice(null)}
              className={`grid grid-cols-3 px-1 md:px-2 lg:px-4 py-0.5 my-0.5 hover:bg-[#1a1620] relative overflow-hidden transition-colors duration-150 ${
                flash?.type === 'up'
                  ? 'bg-[#ff3b6955] animate-flash-up'
                  : flash?.type === 'down'
                    ? 'bg-[#ff3b6944] animate-flash-down'
                    : flash?.type === 'new'
                      ? 'bg-[#e31545ab] animate-flash-new'
                      : ''
              }`}
            >
              <div
                className="absolute inset-y-0 right-0 bg-[#ff3b6915] transition-all duration-500 ease-out"
                style={{ width: `${depthPct}%` }}
              />

              <div className="relative text-[#ff3b69] font-semibold tabular-nums text-xs lg:text-[14px]">
                {ask.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="relative text-right text-[#e8e8e8] tabular-nums text-xs lg:text-[14px] ">
                {ask.size.toFixed(4)}
              </div>
              <div className="relative text-right text-[#6b6b76] tabular-nums text-xs lg:text-[14px] ">
                {ask.total.toFixed(4)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 px-1 md:px-2 lg:px-4 py-2.5 bg-[#1a1620] border-y border-[#232027] text-xs lg:text-[14px]">
        <div className="text-[#6b6b76] font-medium">Spread</div>
        <div className="text-right font-semibold text-white tabular-nums">
          {spread !== null ? spread.toFixed(2) : '-'}
        </div>
        <div className="text-right text-[#6b6b76] font-medium tabular-nums">
          {spreadPct !== null && spreadPct > 0 ? `${spreadPct.toFixed(3)}%` : '-'}
        </div>
      </div>

      <div className="relative max-h-[200px] overflow-auto hide-scrollbar">
        {bids.map(bid => {
          const priceKey = bid.price.toString();
          const flash = flashBids.get(priceKey);
          const depthPct = (bid.total / maxTotal) * 100;

          return (
            <div
              key={`bid-${priceKey}`}
              onClick={() => handlePriceClick(bid.price.toString())}
              onMouseEnter={() => setHoveredPrice(priceKey)}
              onMouseLeave={() => setHoveredPrice(null)}
              className={`grid grid-cols-3 px-1 md:px-2 lg:px-4 py-0.5 my-0.5 hover:bg-[#1a1620] relative overflow-hidden transition-colors duration-150 ${
                flash?.type === 'up'
                  ? 'bg-[#00ff9d55] animate-flash-up'
                  : flash?.type === 'down'
                    ? 'bg-[#00ff9d44] animate-flash-down'
                    : flash?.type === 'new'
                      ? 'bg-[#00ff9d33] animate-flash-new'
                      : ''
              }`}
            >
              <div
                className="absolute inset-y-0 right-0 bg-[#00ff9d15] transition-all duration-500 ease-out"
                style={{ width: `${depthPct}%` }}
              />

              <div className="relative text-[#00ff9d] font-semibold tabular-nums text-xs lg:text-[14px]">
                {bid.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="relative text-right text-[#e8e8e8] tabular-nums text-xs lg:text-[14px]">
                {bid.size.toFixed(4)}
              </div>
              <div className="relative text-right text-[#6b6b76] tabular-nums text-xs lg:text-[14px]">
                {bid.total.toFixed(4)}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes flash-up {
          0% {
            background-color: transparent;
          }
          20% {
            background-color: currentColor;
          }
          100% {
            background-color: transparent;
          }
        }

        @keyframes flash-down {
          0% {
            background-color: transparent;
          }
          20% {
            background-color: currentColor;
          }
          100% {
            background-color: transparent;
          }
        }

        @keyframes flash-new {
          0% {
            opacity: 0;
            transform: scale(0.98);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-flash-up {
          animation: flash-up 600ms ease-out;
        }

        .animate-flash-down {
          animation: flash-down 600ms ease-out;
        }

        .animate-flash-new {
          animation: flash-new 300ms ease-out;
        }

        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }

        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default Orderbook;
