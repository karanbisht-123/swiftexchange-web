import { create } from 'zustand';

import type { Order } from '../models';

interface OrderStoreState {
  orders: Record<string, Order>;
  setOrders: (orders: Order[]) => void;
  updateOrder: (order: Order) => void;
  removeOrder: (orderId: string) => void;
  getOpenOrders: () => Order[];
}

export const useOrderStore = create<OrderStoreState>((set, get) => ({
  orders: {},
  setOrders: orders => {
    const nextOrders: Record<string, Order> = {};
    orders.forEach(o => {
      nextOrders[o.id] = o;
    });
    set({ orders: nextOrders });
  },
  updateOrder: order =>
    set(state => ({
      orders: {
        ...state.orders,
        [order.id]: order,
      },
    })),
  removeOrder: orderId =>
    set(state => {
      const newOrders = { ...state.orders };
      delete newOrders[orderId];
      return { orders: newOrders };
    }),
  getOpenOrders: () =>
    Object.values(get().orders).filter(o => o.status === 'new' || o.status === 'partially_filled'),
}));
