import { useEffect, useState } from 'react';

interface OrderBookProps {
  orderBook: any;
  setPrice: (price: string) => void;
  isWalletConnected?: boolean;
  isBuy: boolean;
}

const OrderBook = ({ orderBook, setPrice, isWalletConnected = true }: OrderBookProps) => {
  const [highlightedPrice, setHighlightedPrice] = useState<string | null>(null);
  const [previousAsks, setPreviousAsks] = useState<any[]>([]);
  const [previousBids, setPreviousBids] = useState<any[]>([]);

  console.log(previousAsks, previousBids);

  // Check if order book is empty or not loaded
  const hasAsks = orderBook?.asks && orderBook.asks.length > 0;
  const hasBids = orderBook?.bids && orderBook.bids.length > 0;
  const isEmpty = !hasAsks && !hasBids;

  // Track price changes for animations
  useEffect(() => {
    if (hasAsks) setPreviousAsks(orderBook.asks);
    if (hasBids) setPreviousBids(orderBook.bids);
  }, [orderBook]);

  const handlePriceClick = (price: string) => {
    setPrice(price);
    setHighlightedPrice(price);
    setTimeout(() => setHighlightedPrice(null), 500);
  };

  // Calculate depth percentage for visual bar
  const calculateDepth = (amount: number, maxAmount: number) => {
    return (amount / maxAmount) * 100;
  };

  const maxAskAmount = hasAsks
    ? Math.max(...orderBook.asks.slice(0, 8).map((a: any) => parseFloat(a.amount)))
    : 0;
  const maxBidAmount = hasBids
    ? Math.max(...orderBook.bids.slice(0, 8).map((b: any) => parseFloat(b.amount)))
    : 0;

  return (
    <div className="w-full lg:w-80 rounded-xl">
      <div className="card-header">
        <h3 className="heading-4">Order Book</h3>
      </div>

      {/* Empty State */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-muted mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm font-medium text-primary mb-1">No Order Book Data</p>
            <p className="text-xs text-muted">
              {isWalletConnected
                ? 'Order book is currently empty or not loaded'
                : 'Connect your wallet to load order book'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="grid grid-cols-3 text-xs font-semibold text-muted mb-2 px-2">
            <span>Price</span>
            <span className="text-center">Amount</span>
            <span className="text-right">Total</span>
          </div>

          {/* ASKS (Sell Orders) - Red */}
          <div className="mb-2 max-h-48 overflow-y-auto scrollbar-thin">
            {hasAsks ? (
              orderBook.asks.slice(0, 12).map((ask: any, idx: number) => {
                const amount = parseFloat(ask.amount);
                const price = parseFloat(ask.price);
                const total = amount * price;
                const depthPercent = calculateDepth(amount, maxAskAmount);
                const isHighlighted = highlightedPrice === ask.price;

                return (
                  <div
                    key={`ask-${idx}-${ask.price}`}
                    className={`relative grid grid-cols-3 text-xs py-1.5 px-2 cursor-pointer transition-all duration-200 ${isHighlighted ? 'animate-pulse-once' : ''
                      }`}
                    onClick={() => handlePriceClick(ask.price)}
                    style={{
                      backgroundColor: isHighlighted ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                    }}
                  >
                    {/* Depth Bar */}
                    <div
                      className="absolute right-0 top-0 bottom-0 opacity-20 transition-all duration-300"
                      style={{
                        width: `${depthPercent}%`,
                        backgroundColor: 'var(--color-danger)',
                      }}
                    />

                    <span className="relative z-10 price-down font-medium">{price.toFixed(7)}</span>
                    <span className="relative z-10 text-center text-secondary">
                      {amount.toFixed(4)}
                    </span>
                    <span className="relative z-10 text-right text-muted text-[10px]">
                      {total.toFixed(2)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4 text-xs text-muted">No sell orders</div>
            )}
          </div>

          {/* Spread Indicator */}
          {hasAsks && hasBids && (
            <div className="my-3 py-2 px-3 bg-secondary rounded-lg border border-color">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full animate-pulse"
                  // style={{ backgroundColor: 'var(--color-brand-accent)' }}
                  />
                  <span className="text-[10px] text-muted uppercase tracking-wide font-semibold">
                    Spread
                  </span>
                </div>
                <div className="text-sm font-bold text-primary">
                  {(
                    parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price)
                  ).toFixed(7)}
                </div>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted">Last Price</span>
                <span className="text-xs font-medium text-brand">
                  {parseFloat(orderBook.bids[0].price).toFixed(7)}
                </span>
              </div>
            </div>
          )}

          {/* BIDS (Buy Orders) - Green */}
          <div className="max-h-48 overflow-y-auto scrollbar-thin">
            {hasBids ? (
              orderBook.bids.slice(0, 12).map((bid: any, idx: number) => {
                const amount = parseFloat(bid.amount);
                const price = parseFloat(bid.price);
                const total = amount * price;
                const depthPercent = calculateDepth(amount, maxBidAmount);
                const isHighlighted = highlightedPrice === bid.price;

                return (
                  <div
                    key={`bid-${idx}-${bid.price}`}
                    className={`relative grid grid-cols-3 text-xs py-1.5 px-2 cursor-pointer transition-all duration-200 ${isHighlighted ? 'animate-pulse-once' : ''
                      }`}
                    onClick={() => handlePriceClick(bid.price)}
                    style={{
                      backgroundColor: isHighlighted ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                    }}
                  >
                    {/* Depth Bar */}
                    <div
                      className="absolute right-0 top-0 bottom-0 opacity-20 transition-all duration-300"
                      style={{
                        width: `${depthPercent}%`,
                        backgroundColor: 'var(--color-success)',
                      }}
                    />

                    <span className="relative z-10 price-up font-medium">{price.toFixed(7)}</span>
                    <span className="relative z-10 text-center text-secondary">
                      {amount.toFixed(4)}
                    </span>
                    <span className="relative z-10 text-right text-muted text-[10px]">
                      {total.toFixed(2)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4 text-xs text-muted">No buy orders</div>
            )}
          </div>

          {/* Market Depth Indicator */}
          <div className="mt-4 pt-3 border-t border-color">
            <div className="flex justify-between items-center text-[10px]">
              <div className="flex items-center gap-1">
                <div
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: 'var(--color-success)' }}
                />
                <span className="text-muted">Bid Depth</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted">Ask Depth</span>
                <div
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: 'var(--color-danger)' }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OrderBook;
