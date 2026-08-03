import { useEffect, useRef, useState } from 'react';
import { useOrderbookStore } from '../core/stores/orderbookStore';
import { useMarketStore } from '../core/stores/marketStore';

export interface OrderbookSnapshot {
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
  isReady: boolean;
}

const EMPTY: OrderbookSnapshot = { bids: [], asks: [], isReady: false };

/**
 * Returns the sorted orderbook for the currently selected symbol.
 * rAF-throttled — at most one React re-render per animation frame regardless
 * of how fast the WebSocket fires.
 */
export const useOrderbook = (): OrderbookSnapshot => {
  const symbol = useMarketStore((state) => state.selectedSymbol);

  const [snapshot, setSnapshot] = useState<OrderbookSnapshot>(() => {
    const book = useOrderbookStore.getState().getOrderBook(symbol);
    return book ? { bids: book.bids, asks: book.asks, isReady: book.isReady } : EMPTY;
  });

  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset immediately when symbol changes
    const current = useOrderbookStore.getState().getOrderBook(symbol);
    setSnapshot(current ? { bids: current.bids, asks: current.asks, isReady: current.isReady } : EMPTY);

    const unsubscribe = useOrderbookStore.subscribe((state) => {
      const book = state.books[symbol];
      if (!book) return;

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        setSnapshot({ bids: book.bids, asks: book.asks, isReady: book.isReady });
        rafRef.current = null;
      });
    });

    return () => {
      unsubscribe();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [symbol]);

  return snapshot;
};
