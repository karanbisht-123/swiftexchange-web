import { create } from 'zustand';

import type { OrderBookLevel } from '../models';

export interface OrderBookSide {
  levels: Map<string, string>; // price -> size
}

export interface OrderBookState {
  symbol: string;
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
  lastUpdateId: number;
  isReady: boolean;
}

interface OrderbookStoreState {
  books: Record<string, OrderBookState>;
  // Raw Maps kept separately for O(1) upsert/delete — only converted on RAF
  _bidMaps: Record<string, Map<string, string>>;
  _askMaps: Record<string, Map<string, string>>;

  applySnapshot: (
    symbol: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[],
    lastUpdateId: number
  ) => void;
  applyDiff: (
    symbol: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[],
    updateId: number
  ) => void;
  flushToState: (symbol: string) => void;
  resetBook: (symbol: string) => void;
  getOrderBook: (symbol: string) => OrderBookState | undefined;
  clear: () => void;
}

function applyLevelsToMap(map: Map<string, string>, levels: OrderBookLevel[]): void {
  for (const { price, size } of levels) {
    if (size === '0' || parseFloat(size) === 0) {
      map.delete(price);
    } else {
      map.set(price, size);
    }
  }
}

function sortedBids(map: Map<string, string>, limit = 60): { price: string; size: string }[] {
  const entries: { price: string; size: string; numPrice: number }[] = [];
  for (const [price, size] of map.entries()) {
    entries.push({ price, size, numPrice: Number(price) });
  }
  entries.sort((a, b) => b.numPrice - a.numPrice);
  return entries.slice(0, limit).map(({ price, size }) => ({ price, size }));
}

function sortedAsks(map: Map<string, string>, limit = 60): { price: string; size: string }[] {
  const entries: { price: string; size: string; numPrice: number }[] = [];
  for (const [price, size] of map.entries()) {
    entries.push({ price, size, numPrice: Number(price) });
  }
  entries.sort((a, b) => a.numPrice - b.numPrice);
  return entries.slice(0, limit).map(({ price, size }) => ({ price, size }));
}

export const useOrderbookStore = create<OrderbookStoreState>((set, get) => ({
  books: {},
  _bidMaps: {},
  _askMaps: {},

  applySnapshot: (symbol, bids, asks, lastUpdateId) => {
    const bidMap = new Map<string, string>();
    const askMap = new Map<string, string>();

    for (const { price, size } of bids) bidMap.set(price, size);
    for (const { price, size } of asks) askMap.set(price, size);

    set(state => ({
      _bidMaps: { ...state._bidMaps, [symbol]: bidMap },
      _askMaps: { ...state._askMaps, [symbol]: askMap },
      books: {
        ...state.books,
        [symbol]: {
          symbol,
          bids: sortedBids(bidMap),
          asks: sortedAsks(askMap),
          lastUpdateId,
          isReady: true,
        },
      },
    }));
  },

  applyDiff: (symbol, bids, asks) => {
    const state = get();
    const bidMap = state._bidMaps[symbol];
    const askMap = state._askMaps[symbol];
    if (!bidMap || !askMap) return;

    applyLevelsToMap(bidMap, bids);
    applyLevelsToMap(askMap, asks);
  },

  flushToState: symbol => {
    const state = get();
    const bidMap = state._bidMaps[symbol];
    const askMap = state._askMaps[symbol];
    if (!bidMap || !askMap) return;

    set(s => ({
      books: {
        ...s.books,
        [symbol]: {
          ...s.books[symbol],
          bids: sortedBids(bidMap),
          asks: sortedAsks(askMap),
        },
      },
    }));
  },

  resetBook: symbol => {
    set(state => {
      const books = { ...state.books };
      const bidMaps = { ...state._bidMaps };
      const askMaps = { ...state._askMaps };
      delete books[symbol];
      delete bidMaps[symbol];
      delete askMaps[symbol];
      return { books, _bidMaps: bidMaps, _askMaps: askMaps };
    });
  },

  getOrderBook: symbol => get().books[symbol],

  clear: () => set({ books: {}, _bidMaps: {}, _askMaps: {} }),
}));

// Non-hook accessor for WebSocket handlers
export const orderBookStore = {
  applySnapshot: (
    symbol: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[],
    lastUpdateId: number
  ) => useOrderbookStore.getState().applySnapshot(symbol, bids, asks, lastUpdateId),
  applyDiff: (symbol: string, bids: OrderBookLevel[], asks: OrderBookLevel[], updateId: number) =>
    useOrderbookStore.getState().applyDiff(symbol, bids, asks, updateId),
  flushToState: (symbol: string) => useOrderbookStore.getState().flushToState(symbol),
  resetBook: (symbol: string) => useOrderbookStore.getState().resetBook(symbol),
  getOrderBook: (symbol: string) => useOrderbookStore.getState().getOrderBook(symbol),
  clear: () => useOrderbookStore.getState().clear(),
};
