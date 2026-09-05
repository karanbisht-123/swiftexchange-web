import { useMarketStore } from '../core/stores/marketStore';
import { useOrderbookStore } from '../core/stores/orderbookStore';

export interface OrderbookSnapshot {
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
  isReady: boolean;
}

const EMPTY: OrderbookSnapshot = { bids: [], asks: [], isReady: false };

export const useOrderbook = (): OrderbookSnapshot => {
  const symbol = useMarketStore(state => state.selectedSymbol);
  const book = useOrderbookStore(state => state.books[symbol]);

  return book ? { bids: book.bids, asks: book.asks, isReady: book.isReady } : EMPTY;
};
