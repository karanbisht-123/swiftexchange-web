import { create } from 'zustand';

export type ExchangeName = 'hyperliquid' | 'aster';

interface ExchangeManagerState {
  currentExchange: ExchangeName;
  setExchange: (exchange: ExchangeName) => void;
}

export const useExchangeManager = create<ExchangeManagerState>(set => ({
  currentExchange: 'aster' as ExchangeName,
  setExchange: exchange => set({ currentExchange: exchange }),
}));

export const exchangeManager = {
  setExchange: (exchange: ExchangeName) => useExchangeManager.getState().setExchange(exchange),
  current: () => useExchangeManager.getState().currentExchange,
  subscribe: (listener: (state: ExchangeManagerState, prevState: ExchangeManagerState) => void) =>
    useExchangeManager.subscribe(listener),
};
