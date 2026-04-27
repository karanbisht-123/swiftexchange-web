import { Radio } from 'lucide-react';
import { useEffect, useState } from 'react';

interface OrderBookProps {
  orderBook: any;
  setPrice: (price: string) => void;
  isWalletConnected?: boolean;
  isBuy: boolean;
}

const OrderBook = ({ orderBook, setPrice, isWalletConnected = true }: OrderBookProps) => {
  const [highlightedPrice, setHighlightedPrice] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const hasAsks = orderBook?.asks && orderBook.asks.length > 0;
  const hasBids = orderBook?.bids && orderBook.bids.length > 0;
  const isEmpty = !hasAsks && !hasBids;

  useEffect(() => {
    if (orderBook) {
      setIsLive(true);
      const timer = setTimeout(() => setIsLive(false), 1000);
      return () => clearTimeout(timer);
    }
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

  const formatPrice = (price: number) => {
    if (price < 0.0001) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    return price.toFixed(4);
  };

  const formatAmount = (amount: number) => {
    if (amount >= 1000000) return (amount / 1000000).toFixed(2) + 'M';
    if (amount >= 1000) return (amount / 1000).toFixed(2) + 'K';
    return amount.toFixed(2);
  };

  return (
    <div className="h-full bg-transparent">
      <div className="px-4 py-3  items-center justify-between hidden lg:flex">
        <h3 className="text-sm font-semibold text-primary">Order Book</h3>
        <div className="flex items-center gap-1.5">
          <Radio className={`w-3 h-3 ${isLive ? 'text-green-500 animate-pulse' : 'text-muted'}`} />
          <span className="text-[10px] text-muted">{isLive ? 'Live' : 'Ready'}</span>
        </div>
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
          <div className="grid grid-cols-3 text-[10px] font-bold text-muted uppercase tracking-wider mb-2 px-3 opacity-70">
            <span>Price</span>
            <span className="text-center">Amount</span>
            <span className="text-right">Total</span>
          </div>

          <div className="max-h-[180px] overflow-y-auto scrollbar-hide mb-2">
            {hasAsks ? (
              [...orderBook.asks]
                .slice(0, 10)
                .reverse()
                .map((ask: any, idx: number) => {
                  const amount = parseFloat(ask.amount);
                  const price = parseFloat(ask.price);
                  const total = amount * price;
                  const depthPercent = calculateDepth(amount, maxAskAmount);
                  const isHighlighted = highlightedPrice === ask.price;

                  return (
                    <div
                      key={`ask-${idx}-${ask.price}`}
                      className={`relative grid grid-cols-3 text-xs py-2 px-3 cursor-pointer transition-all duration-150 hover:bg-red-500/5 ${isHighlighted ? 'bg-red-500/20' : ''}`}
                      onClick={() => handlePriceClick(ask.price)}
                    >
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

          {hasAsks && hasBids && (
            <div className="py-3 px-3 my-1 border-y border-white/5 bg-white/5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted uppercase font-bold tracking-wider">
                  Spread
                </span>
                <span className="text-sm font-bold text-primary font-mono">
                  {formatPrice(
                    parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price)
                  )}
                </span>
              </div>
            </div>
          )}

          <div className="max-h-[180px] overflow-y-auto scrollbar-hide ">
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
                    className={`relative grid grid-cols-3 text-xs py-2 px-3 cursor-pointer transition-all duration-150 hover:bg-green-500/5 ${isHighlighted ? 'bg-green-500/20' : ''}`}
                    onClick={() => handlePriceClick(bid.price)}
                  >
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

          {/* <div className="flex justify-between items-center pt-3 mt-2 border-t border-color/30">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
              <span className="text-[10px] text-muted">Bids</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted">Asks</span>
              <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            </div>
          </div> */}
        </div>
      )}
    </div>
  );
};

export default OrderBook;
