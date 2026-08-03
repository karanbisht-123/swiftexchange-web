import { useMarketStore } from '../core/stores/marketStore';
import { useTradeStore } from '../core/stores/tradeStore';

/**
 * Returns the live trade tape for the currently selected symbol.
 * The ?? [] fallback is intentionally outside the Zustand selector — putting it
 * inside would create a new array reference on every call, causing infinite re-renders.
 */
export const useTrades = () => {
  const symbol = useMarketStore((state) => state.selectedSymbol);
  const trades = useTradeStore((state) => state.tradesBySymbol[symbol]);
  return trades ?? [];
};
