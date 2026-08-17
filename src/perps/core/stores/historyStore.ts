import { create } from 'zustand';

import type { AsterUserTrade, IncomeRecord } from '../../adapters/aster/types/account';
import type { AsterOrderResponse } from '../../adapters/aster/types/orders';

interface HistoryStoreState {
  recentOrders: AsterOrderResponse[];
  recentTrades: AsterUserTrade[];
  recentIncome: IncomeRecord[];
  addOrder: (order: AsterOrderResponse) => void;
  addTrade: (trade: AsterUserTrade) => void;
  addIncome: (income: IncomeRecord) => void;
}

export const useHistoryStore = create<HistoryStoreState>(set => ({
  recentOrders: [],
  recentTrades: [],
  recentIncome: [],
  addOrder: order =>
    set(state => {
      const existingIndex = state.recentOrders.findIndex(o => o.orderId === order.orderId);
      if (existingIndex >= 0) {
        const next = [...state.recentOrders];
        next[existingIndex] = order;
        return { recentOrders: next };
      }
      return { recentOrders: [order, ...state.recentOrders].slice(0, 100) };
    }),
  addTrade: trade =>
    set(state => {
      const existingIndex = state.recentTrades.findIndex(t => t.id === trade.id);
      if (existingIndex >= 0) {
        const next = [...state.recentTrades];
        next[existingIndex] = trade;
        return { recentTrades: next };
      }
      return { recentTrades: [trade, ...state.recentTrades].slice(0, 100) };
    }),
  addIncome: income =>
    set(state => {
      const existingIndex = state.recentIncome.findIndex(
        i =>
          i.tranId === income.tranId && i.incomeType === income.incomeType && i.time === income.time
      );
      if (existingIndex >= 0) {
        const next = [...state.recentIncome];
        next[existingIndex] = income;
        return { recentIncome: next };
      }
      return { recentIncome: [income, ...state.recentIncome].slice(0, 100) };
    }),
}));
