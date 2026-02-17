import React, { useMemo } from 'react';

import { useOrderbook } from '../../hooks/useOrderbook';
import useMarketStore from '../../store/marketStore';
import { useOrderbookClickStore } from '../../store/orderbookClickStore';

interface OrderbookRow {
  price: number;
  size: number;
  total: number;
}

const Orderbook: React.FC<{ maxRows?: number }> = ({ maxRows = 9 }) => {
  const { selectedMarket } = useMarketStore();
  const { onPriceClick } = useOrderbookClickStore();
  const { orderbook, isConnected, dataSource } = useOrderbook(selectedMarket);

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

    const bestBid = formattedBids.length > 0 ? formattedBids[0].price : 0;
    const bestAsk = formattedAsks.length > 0 ? formattedAsks[formattedAsks.length - 1].price : 0;

    const spr = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
    const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
    const sprPct = mid > 0 && spr > 0 ? (spr / mid) * 100 : 0;

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
    <div className="w-full max-w-md bg-secondary text-primary font-medium text-sm select-none">
      <div className="flex items-center justify-between px-1 md:px-2 lg:px-4 py-2 border-b border-[#232027]">
        <div className=" items-center gap-3 hidden lg:flex">
          <span className="text-secondary text-xs font-semibold ">Orderbook</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-secondary font-semibold">{base}</span>
          <span className="text-secondary">/</span>
          <span className="text-secondary">{quote}</span>
          <div
            className={`w-2 h-2 rounded-full ${isConnected && dataSource === 'websocket' ? 'bg-[#00ff9d]' : 'bg-[#ffaa00]'
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
          const depthPct = (ask.total / maxTotal) * 100;

          return (
            <div
              key={`ask-${priceKey}`}
              onClick={() => handlePriceClick(ask.price.toString())}
              className="grid grid-cols-3 px-1 md:px-2 lg:px-4 py-0.5 my-0.5 hover:bg-[#1a1620] relative overflow-hidden transition-colors duration-150 cursor-pointer"
            >
              <div
                className="absolute inset-y-0 right-0 bg-[#ff3b6915] origin-right will-change-transform transition-transform duration-500 ease-out"
                style={{
                  width: '100%',
                  transform: `scaleX(${depthPct / 100})`,
                }}
              />

              <div className="relative text-[#ff3b69] font-semibold tabular-nums text-xs lg:text-[14px]">
                {ask.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="relative text-right text-primary tabular-nums text-xs lg:text-[14px] ">
                {ask.size.toFixed(4)}
              </div>
              <div className="relative text-right text-[#6b6b76] tabular-nums text-xs lg:text-[14px] ">
                {ask.total.toFixed(4)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3  text-primary px-1 md:px-2 lg:px-4 py-2.5 bg-primar shadow-sm text-xs lg:text-[14px]">
        <div className="text-primary font-medium">Spread</div>
        <div className="text-right text-primary font-semibold text-white tabular-nums">
          {spread !== null && spread > 0 ? spread.toFixed(2) : '-'}
        </div>
        <div className="text-right text-primary font-medium tabular-nums">
          {spreadPct !== null && spreadPct > 0 ? `${spreadPct.toFixed(3)}%` : '-'}
        </div>
      </div>

      <div className="relative max-h-[200px] overflow-auto hide-scrollbar">
        {bids.map(bid => {
          const priceKey = bid.price.toString();
          const depthPct = (bid.total / maxTotal) * 100;

          return (
            <div
              key={`bid-${priceKey}`}
              onClick={() => handlePriceClick(bid.price.toString())}
              className="grid grid-cols-3 px-1 md:px-2 lg:px-4 py-0.5 my-0.5 hover:bg-[#1a1620] relative overflow-hidden transition-colors duration-150 cursor-pointer"
            >
              <div
                className="absolute inset-y-0 right-0 bg-[#00ff9d15] origin-right will-change-transform transition-transform duration-500 ease-out"
                style={{
                  width: '100%',
                  transform: `scaleX(${depthPct / 100})`,
                }}
              />

              <div className="relative text-[#00ff9d] font-semibold tabular-nums text-xs lg:text-[14px]">
                {bid.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="relative text-right text-primary tabular-nums text-xs lg:text-[14px]">
                {bid.size.toFixed(4)}
              </div>
              <div className="relative text-right text-[#6b6b76] tabular-nums text-xs lg:text-[14px]">
                {bid.total.toFixed(3)}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
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
