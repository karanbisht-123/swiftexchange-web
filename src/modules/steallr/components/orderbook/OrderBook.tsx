import { Loader2 } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

interface OrderBookProps {
  orderBook: any;
  setPrice: (price: string) => void;
  isWalletConnected?: boolean;
  isLoading?: boolean;
}

const OrderBook = ({ orderBook, setPrice, isWalletConnected = true, isLoading = false }: OrderBookProps) => {
  const [highlightedPrice, setHighlightedPrice] = useState<string | null>(null);
  const [updatedPrices, setUpdatedPrices] = useState<{ [price: string]: 'up' | 'down' | 'new' }>({});
  const prevAsksRef = useRef<{ [price: string]: string }>({});
  const prevBidsRef = useRef<{ [price: string]: string }>({});

  const hasAsks = orderBook?.asks && orderBook.asks.length > 0;
  const hasBids = orderBook?.bids && orderBook.bids.length > 0;
  const isEmpty = !hasAsks && !hasBids;

  useEffect(() => {
    if (!orderBook) return;

    const nextUpdated: { [price: string]: 'up' | 'down' | 'new' } = {};

    if (orderBook.asks) {
      orderBook.asks.forEach((a: any) => {
        const prev = prevAsksRef.current[a.price];
        if (prev === undefined) nextUpdated[a.price] = 'new';
        else if (parseFloat(a.amount) > parseFloat(prev)) nextUpdated[a.price] = 'up';
        else if (parseFloat(a.amount) < parseFloat(prev)) nextUpdated[a.price] = 'down';
      });
      const m: { [p: string]: string } = {};
      orderBook.asks.forEach((a: any) => { m[a.price] = a.amount; });
      prevAsksRef.current = m;
    }

    if (orderBook.bids) {
      orderBook.bids.forEach((b: any) => {
        const prev = prevBidsRef.current[b.price];
        if (prev === undefined) nextUpdated[b.price] = 'new';
        else if (parseFloat(b.amount) > parseFloat(prev)) nextUpdated[b.price] = 'up';
        else if (parseFloat(b.amount) < parseFloat(prev)) nextUpdated[b.price] = 'down';
      });
      const m: { [p: string]: string } = {};
      orderBook.bids.forEach((b: any) => { m[b.price] = b.amount; });
      prevBidsRef.current = m;
    }

    if (Object.keys(nextUpdated).length > 0) {
      setUpdatedPrices(nextUpdated);
      const t = setTimeout(() => setUpdatedPrices({}), 600);
      return () => clearTimeout(t);
    }
  }, [orderBook]);

  const handlePriceClick = (price: string) => {
    setPrice(price);
    setHighlightedPrice(price);
    setTimeout(() => setHighlightedPrice(null), 400);
  };

  const topAsks = hasAsks ? [...orderBook.asks].slice(0, 12) : [];
  let cumAsk = 0;
  const asksWithTotal = topAsks.map((a: any) => {
    cumAsk += parseFloat(a.amount);
    return { ...a, cumulativeAmount: cumAsk };
  });

  const topBids = hasBids ? [...orderBook.bids].slice(0, 12) : [];
  let cumBid = 0;
  const bidsWithTotal = topBids.map((b: any) => {
    cumBid += parseFloat(b.amount);
    return { ...b, cumulativeAmount: cumBid };
  });

  const fmtPrice = (p: number) => {
    if (p < 0.0001) return p.toFixed(8);
    if (p < 1) return p.toFixed(6);
    return p.toFixed(4);
  };

  const fmtAmt = (a: number) => {
    if (a >= 1e6) return (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return (a / 1e3).toFixed(1) + 'K';
    return a.toFixed(2);
  };

  const flashCls = (type: string | undefined) => {
    if (type === 'up') return 'flash-up';
    if (type === 'down') return 'flash-down';
    if (type === 'new') return 'flash-new';
    return '';
  };

  if (isEmpty && isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary/60 mb-2" />
        <p className="text-[11px] text-muted/60">Loading...</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-16 px-4">
        <p className="text-xs font-medium text-muted/50 mb-0.5">No Orders</p>
        <p className="text-[10px] text-muted/40 text-center">
          {isWalletConnected ? 'Empty order book for this pair' : 'Connect wallet to view'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <style>{`
        @keyframes ob-flash-up {
          0% { background-color: rgba(34, 197, 94, 0.2); }
          100% { background-color: transparent; }
        }
        @keyframes ob-flash-down {
          0% { background-color: rgba(239, 68, 68, 0.2); }
          100% { background-color: transparent; }
        }
        @keyframes ob-flash-new {
          0% { background-color: rgba(59, 130, 246, 0.15); }
          100% { background-color: transparent; }
        }
        .flash-up { animation: ob-flash-up 1s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
        .flash-down { animation: ob-flash-down 1s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
        .flash-new { animation: ob-flash-new 1s cubic-bezier(0.25, 1, 0.5, 1) forwards; }
        .ob-row { transition: background-color 0.4s ease-out; }
      `}</style>

      <div className="hidden lg:grid grid-cols-3 text-[9px] font-bold text-muted/50 uppercase tracking-widest px-3 pt-1 pb-1.5 shrink-0">
        <span>Price</span>
        <span className="text-center">Size</span>
        <span className="text-right">Total</span>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Asks (Sell Orders) */}
        <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0 flex flex-col justify-end">
          <div className="w-full">
            {hasAsks ? (
              asksWithTotal.slice().reverse().map((ask: any, idx: number) => {
                const amount = parseFloat(ask.amount);
                const price = parseFloat(ask.price);
                const total = amount * price;
                const depth = Math.min((ask.cumulativeAmount / cumAsk) * 100, 100);

                return (
                  <div
                    key={`a-${idx}`}
                    onClick={() => handlePriceClick(ask.price)}
                    className={`ob-row relative grid grid-cols-3 text-[11px] lg:text-xs py-[5px] px-3 cursor-pointer hover:bg-white/[0.02] ${highlightedPrice === ask.price ? '!bg-red-500/15' : ''} ${flashCls(updatedPrices[ask.price])}`}
                  >
                    <div
                      className="absolute right-0 inset-y-0 bg-red-500/[0.06] pointer-events-none"
                      style={{ width: `${depth}%` }}
                    />
                    <span className="relative z-10 text-red-400 font-mono">{fmtPrice(price)}</span>
                    <span className="relative z-10 text-center font-mono text-text-secondary">{fmtAmt(amount)}</span>
                    <span className="relative z-10 text-right font-mono text-muted/50 text-[10px]">{fmtAmt(total)}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-[10px] text-muted/40">No asks</div>
            )}
          </div>
        </div>

        {/* Spread Row */}
        {hasAsks && hasBids && (
          <div className="flex items-center justify-between px-3 py-[6px] mx-1 my-[2px] rounded bg-white/[0.03] shrink-0">
            <span className="text-[9px] text-muted/40 uppercase tracking-widest font-bold">Spread</span>
            <span className="text-xs font-bold text-primary/80 font-mono">
              {fmtPrice(parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price))}
            </span>
          </div>
        )}

        {/* Bids (Buy Orders) */}
        <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0">
          {hasBids ? (
            bidsWithTotal.map((bid: any, idx: number) => {
              const amount = parseFloat(bid.amount);
              const price = parseFloat(bid.price);
              const total = amount * price;
              const depth = Math.min((bid.cumulativeAmount / cumBid) * 100, 100);

              return (
                <div
                  key={`b-${idx}`}
                  onClick={() => handlePriceClick(bid.price)}
                  className={`ob-row relative grid grid-cols-3 text-[11px] lg:text-xs py-[5px] px-3 cursor-pointer hover:bg-white/[0.02] ${highlightedPrice === bid.price ? '!bg-green-500/15' : ''} ${flashCls(updatedPrices[bid.price])}`}
                >
                  <div
                    className="absolute right-0 inset-y-0 bg-green-500/[0.06] pointer-events-none"
                    style={{ width: `${depth}%` }}
                  />
                  <span className="relative z-10 text-green-400 font-mono">{fmtPrice(price)}</span>
                  <span className="relative z-10 text-center font-mono text-text-secondary">{fmtAmt(amount)}</span>
                  <span className="relative z-10 text-right font-mono text-muted/50 text-[10px]">{fmtAmt(total)}</span>
                </div>
              );
            })
          ) : (
            <div className="text-center py-6 text-[10px] text-muted/40">No bids</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderBook;