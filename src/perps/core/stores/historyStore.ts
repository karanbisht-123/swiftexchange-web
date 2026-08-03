import { create } from 'zustand';
import type { AsterOrderResponse } from '../../adapters/aster/types/orders';
import type { AsterUserTrade } from '../../adapters/aster/types/account';

interface HistoryStoreState {
  recentOrders: AsterOrderResponse[];
  recentTrades: AsterUserTrade[];
  addOrder: (order: AsterOrderResponse) => void;
  addTrade: (trade: AsterUserTrade) => void;
}

export const useHistoryStore = create<HistoryStoreState>((set) => ({
  recentOrders: [],
  recentTrades: [],
  addOrder: (order) => set((state) => {
    const existingIndex = state.recentOrders.findIndex(o => o.orderId === order.orderId);
    if (existingIndex >= 0) {
      const next = [...state.recentOrders];
      next[existingIndex] = order;
      return { recentOrders: next };
    }
    return { recentOrders: [order, ...state.recentOrders].slice(0, 100) };
  }),
  addTrade: (trade) => set((state) => {
    const existingIndex = state.recentTrades.findIndex(t => t.id === trade.id);
    if (existingIndex >= 0) {
      const next = [...state.recentTrades];
      next[existingIndex] = trade;
      return { recentTrades: next };
    }
    return { recentTrades: [trade, ...state.recentTrades].slice(0, 100) };
  })
}));
