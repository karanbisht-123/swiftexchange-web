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

  const hasAsks = orderBook?.asks && orderBook.asks.length > 0;
  const hasBids = orderBook?.bids && orderBook.bids.length > 0;
  const isEmpty = !hasAsks && !hasBids;

  useEffect(() => {
    if (hasAsks) setPreviousAsks(orderBook.asks);
    if (hasBids) setPreviousBids(orderBook.bids);
  }, [orderBook]);

  const handlePriceClick = (price: string) => {
    setPrice(price);
    setHighlightedPrice(price);
    setTimeout(() => setHighlightedPrice(null), 500);
  };

  const calculateDepth = (amount: number, maxAmount: number) => {
    return Math.min((amount / maxAmount) * 100, 100);
  };

  const maxAskAmount = hasAsks
    ? Math.max(...orderBook.asks.slice(0, 10).map((a: any) => parseFloat(a.amount)))
    : 0;
  const maxBidAmount = hasBids
    ? Math.max(...orderBook.bids.slice(0, 10).map((b: any) => parseFloat(b.amount)))
    : 0;

  // Format price for display
  const formatPrice = (price: number) => {
    if (price < 0.0001) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    return price.toFixed(4);
  };

  // Format amount for display
  const formatAmount = (amount: number) => {
    if (amount >= 1000000) return (amount / 1000000).toFixed(2) + 'M';
    if (amount >= 1000) return (amount / 1000).toFixed(2) + 'K';
    return amount.toFixed(2);
  };

  return (
    <div className="h-full bg-secondary">
      {/* Header */}
      <div className="px-4 py-3 ">
        <h3 className="text-sm font-semibold text-primary">Order Book</h3>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <svg
            className="w-12 h-12 text-muted/30 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-sm font-medium text-primary mb-1">No Orders</p>
          <p className="text-xs text-muted text-center">
            {isWalletConnected
              ? 'Order book is empty for this pair'
              : 'Connect wallet to view orders'}
          </p>
        </div>
      ) : (
        <div className="p-3">
          {/* Column Headers */}
          <div className="grid grid-cols-3 text-[10px] font-medium text-muted uppercase tracking-wider mb-2 px-2">
            <span>Price</span>
            <span className="text-center">Amount</span>
            <span className="text-right">Total</span>
          </div>

          {/* Asks (Sell Orders) */}
          <div className="max-h-[180px] overflow-y-auto scrollbar-thin mb-2">
            {hasAsks ? (
              [...orderBook.asks].slice(0, 10).reverse().map((ask: any, idx: number) => {
                const amount = parseFloat(ask.amount);
                const price = parseFloat(ask.price);
                const total = amount * price;
                const depthPercent = calculateDepth(amount, maxAskAmount);
                const isHighlighted = highlightedPrice === ask.price;

                return (
                  <div
                    key={`ask-${idx}-${ask.price}`}
                    className={`relative grid grid-cols-3 text-xs py-1.5 px-2 cursor-pointer transition-all duration-150 hover:bg-red-500/10 ${isHighlighted ? 'bg-red-500/20' : ''
                      }`}
                    onClick={() => handlePriceClick(ask.price)}
                  >
                    {/* Depth Visualization */}
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-red-500/10 transition-all duration-300"
                      style={{ width: `${depthPercent}%` }}
                    />

                    <span className="relative z-10 text-red-500 font-mono font-medium">
                      {formatPrice(price)}
                    </span>
                    <span className="relative z-10 text-center text-secondary font-mono">
                      {formatAmount(amount)}
                    </span>
                    <span className="relative z-10 text-right text-muted font-mono text-[10px]">
                      {formatAmount(total)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4 text-xs text-muted">No sell orders</div>
            )}
          </div>

          {/* Spread */}
          {hasAsks && hasBids && (
            <div className="py-2 px-3 border-t border-b border-color/10  my-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted uppercase font-medium">Spread</span>
                <span className="text-sm font-bold text-primary font-mono">
                  {formatPrice(parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price))}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted">Mid Price</span>
                <span className="text-xs font-medium text-blue-500 font-mono">
                  {formatPrice((parseFloat(orderBook.asks[0].price) + parseFloat(orderBook.bids[0].price)) / 2)}
                </span>
              </div>
            </div>
          )}

          <div className="max-h-[180px] overflow-y-auto scrollbar-thin">
            {hasBids ? (
              orderBook.bids.slice(0, 10).map((bid: any, idx: number) => {
                const amount = parseFloat(bid.amount);
                const price = parseFloat(bid.price);
                const total = amount * price;
                const depthPercent = calculateDepth(amount, maxBidAmount);
                const isHighlighted = highlightedPrice === bid.price;

                return (
                  <div
                    key={`bid-${idx}-${bid.price}`}
                    className={`relative grid grid-cols-3 text-xs py-1.5 px-2 cursor-pointer transition-all duration-150 hover:bg-green-500/10 ${isHighlighted ? 'bg-green-500/20' : ''
                      }`}
                    onClick={() => handlePriceClick(bid.price)}
                  >
                    {/* Depth Visualization */}
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-green-500/10 transition-all duration-300"
                      style={{ width: `${depthPercent}%` }}
                    />

                    <span className="relative z-10 text-green-500 font-mono font-medium">
                      {formatPrice(price)}
                    </span>
                    <span className="relative z-10 text-center text-secondary font-mono">
                      {formatAmount(amount)}
                    </span>
                    <span className="relative z-10 text-right text-muted font-mono text-[10px]">
                      {formatAmount(total)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4 text-xs text-muted">No buy orders</div>
            )}
          </div>

          {/* Legend */}
          <div className="flex justify-between items-center pt-3 mt-2 border-t border-color/30">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
              <span className="text-[10px] text-muted">Bids</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted">Asks</span>
              <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderBook;
