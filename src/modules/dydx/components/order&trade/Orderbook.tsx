import React, { useMemo } from 'react';

import { useOrderbook } from '../../hooks/useOrderbook';
import useMarketStore from '../../store/marketStore';

interface OrderbookRow {
  price: number;
  size: number;
  total: number;
}

interface OrderbookProps {
  maxRows?: number;
}

const Orderbook: React.FC<OrderbookProps> = ({ maxRows = 10 }) => {
  const { selectedMarket } = useMarketStore();
  const { orderbook, error, isLoading, isConnected } = useOrderbook(selectedMarket);

  const { bids, asks, spread, midPrice } = useMemo(() => {
    if (!orderbook || !orderbook.bids?.length || !orderbook.asks?.length) {
      return { bids: [], asks: [], spread: null, midPrice: null };
    }

    let bidTotal = 0;
    const formattedBids: OrderbookRow[] = orderbook.bids.slice(0, maxRows).map(order => {
      const price = parseFloat(order.price);
      const size = parseFloat(order.size);
      bidTotal += size;
      return { price, size, total: bidTotal };
    });

    let askTotal = 0;
    const formattedAsks: OrderbookRow[] = orderbook.asks
      .slice(0, maxRows)
      .map(order => {
        const price = parseFloat(order.price);
        const size = parseFloat(order.size);
        askTotal += size;
        return { price, size, total: askTotal };
      })
      .reverse();

    const bestBid = formattedBids[0]?.price || 0;
    const bestAsk = formattedAsks[formattedAsks.length - 1]?.price || 0;
    const calculatedSpread = bestAsk - bestBid;
    const calculatedMidPrice = (bestBid + bestAsk) / 2;

    return {
      bids: formattedBids,
      asks: formattedAsks,
      spread: calculatedSpread,
      midPrice: calculatedMidPrice,
    };
  }, [orderbook, maxRows]);

  if (isLoading) {
    return (
      <div className="card w-64" style={{ borderRadius: 0, padding: 0 }}>
        <div className="flex items-center justify-center p-8">
          <div className="text-muted">Loading orderbook...</div>
        </div>
      </div>
    );
  }

  if (error && !orderbook) {
    // Only show error if we have no data at all
    return (
      <div className="card w-64" style={{ borderRadius: 0, padding: 0 }}>
        <div className="p-4 bg-danger-bg border border-danger rounded">
          <div className="text-danger font-semibold">Error</div>
          <div className="text-danger text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (!orderbook) {
    return (
      <div className="card w-64" style={{ borderRadius: 0, padding: 0 }}>
        <div className="flex items-center justify-center p-8">
          <div className="text-muted">No orderbook data available</div>
        </div>
      </div>
    );
  }

  const baseCurrency = selectedMarket.split('-')[0] || 'BTC';
  const quoteCurrency = selectedMarket.split('-')[1] || 'USD';

  return (
    <div className="card w-64" style={{ borderRadius: 0, padding: 0 }}>
      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-color">
        <div className="flex items-center gap-2">
          <button className="btn btn-sm btn-secondary">−</button>
          <button className="btn btn-sm btn-secondary">+</button>
          <span className="text-muted text-sm ml-1">$1</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-primary text-sm font-medium">{baseCurrency}</span>
          <span className="text-secondary text-sm">{quoteCurrency}</span>
          {/* Connection Status Indicator */}
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}
            title={isConnected ? 'Live updates active' : 'Using cached data'}
          />
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-3 px-4 py-2 border-b border-color text-xs text-secondary">
        <div className="text-left">
          Price <span className="text-muted">{quoteCurrency}</span>
        </div>
        <div className="text-right">
          Size <span className="text-muted">{baseCurrency}</span>
        </div>
        <div className="text-right">
          Total <span className="text-muted">{baseCurrency}</span>
        </div>
      </div>

      {/* Asks (Sell Orders) */}
      <div className="px-4 h-[200px] overflow-scroll">
        {asks.length > 0 ? (
          asks.map((ask, index) => (
            <div
              key={`ask-${index}`}
              className="grid grid-cols-3 py-1.5 text-sm hover:bg-hover transition-colors relative"
            >
              <div
                className="absolute right-0 top-0 bottom-0 bg-danger-bg"
                style={{ width: `${(ask.total / asks[0]?.total) * 100}%` }}
              />
              <div className="relative z-10 price-down">
                {ask.price.toLocaleString(undefined, {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3,
                })}
              </div>
              <div className="relative z-10 text-right text-primary">{ask.size.toFixed(4)}</div>
              <div className="relative z-10 text-right text-secondary text-xs">
                {ask.total.toFixed(4)}
              </div>
            </div>
          ))
        ) : (
          <div className="py-4 text-center text-muted text-sm">No asks available</div>
        )}
      </div>

      {/* Spread Info */}
      <div className="px-4 py-3 border-y border-color bg-tertiary">
        <div className="grid grid-cols-3 text-sm">
          <div className="text-primary">Spread</div>
          <div className="text-right text-primary">
            {spread !== null ? spread.toFixed(0) : 'N/A'}
          </div>
          <div className="text-right text-secondary">
            {spread !== null && midPrice !== null
              ? `${((spread / midPrice) * 100).toFixed(2)}%`
              : 'N/A'}
          </div>
        </div>
      </div>

      {/* Bids (Buy Orders) */}
      <div className="px-4 h-[200px] overflow-scroll">
        {bids.length > 0 ? (
          bids.map((bid, index) => (
            <div
              key={`bid-${index}`}
              className="grid grid-cols-3 py-1.5 text-sm hover:bg-hover transition-colors relative"
            >
              <div
                className="absolute right-0 top-0 bottom-0 bg-success-bg"
                style={{
                  width: `${(bid.total / bids[bids.length - 1]?.total) * 100}%`,
                }}
              />
              <div className="relative z-10 price-up">
                {bid.price.toLocaleString(undefined, {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3,
                })}
              </div>
              <div className="relative z-10 text-right text-primary">{bid.size.toFixed(4)}</div>
              <div className="relative z-10 text-right text-secondary text-xs">
                {bid.total.toFixed(4)}
              </div>
            </div>
          ))
        ) : (
          <div className="py-4 text-center text-muted text-sm">No bids available</div>
        )}
      </div>

      {/* Optional: Show warning banner if not connected but have data */}
      {!isConnected && orderbook && (
        <div className="px-4 py-2 bg-yellow-500 bg-opacity-10 border-t border-yellow-500 border-opacity-30">
          <div className="text-xs text-yellow-600 dark:text-yellow-400 text-center">
            Showing cached data - Reconnecting...
          </div>
        </div>
      )}
    </div>
  );
};

export default Orderbook;
