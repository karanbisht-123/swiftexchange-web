import { useCallback, useState } from 'react';

import { OrderService } from '../service/OrderService';
import { type Order } from '../types/types';
import { useDemoWallet } from './useDemoWallet';

interface OrderState {
  orders: Order[];
  isLoading: boolean;
  error: string | null;
}

export function useOrderService() {
  const { walletService, address } = useDemoWallet();
  const [state, setState] = useState<OrderState>({
    orders: [],
    isLoading: false,
    error: null,
  });
  const [orderService, setOrderService] = useState<OrderService | null>(null);

  const initializeOrderService = useCallback(() => {
    if (walletService) {
      const indexerClient = walletService.getIndexerClient();
      if (indexerClient) {
        setOrderService(new OrderService({ indexerClient }));
      } else {
        setState(prev => ({
          ...prev,
          error: 'Indexer client not initialized',
        }));
      }
    } else {
      setState(prev => ({
        ...prev,
        error: 'Wallet service not initialized',
      }));
    }
  }, [walletService]);

  const fetchActiveOrders = useCallback(
    async (subaccountNumber: number = 0) => {
      if (!orderService || !address) {
        setState(prev => ({
          ...prev,
          error: 'Order service or wallet address not initialized',
        }));
        return;
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const orders = await orderService.getActiveOrders(address, subaccountNumber);
        setState(prev => ({
          ...prev,
          orders,
          isLoading: false,
        }));
        return orders;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch orders';
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        console.error('Failed to fetch active orders:', error);
      }
    },
    [orderService, address]
  );

  const fetchOrderById = useCallback(
    async (orderId: string) => {
      if (!orderService) {
        setState(prev => ({
          ...prev,
          error: 'Order service not initialized',
        }));
        return null;
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const order = await orderService.getOrderById(orderId);
        setState(prev => ({
          ...prev,
          isLoading: false,
        }));
        return order;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch order';
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        console.error('Failed to fetch order by ID:', error);
        return null;
      }
    },
    [orderService]
  );

  return {
    ...state,
    orderService,
    initializeOrderService,
    fetchActiveOrders,
    fetchOrderById,
  };
}
