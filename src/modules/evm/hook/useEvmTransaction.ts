import { useCallback, useState } from 'react';
import {
  getTransactionStatus,
  storeSwapOrder,
  getSwapOrdersByWallet,
  type TransactionStatusRequest,
  type StoreSwapOrderRequest,
  type StoreSwapOrderResponse,
  type SwapOrdersResponse,
} from '../service/evmTransactionStatusService';

interface UseEvmTransactionState {
  statusData: any | null;
  ordersData: SwapOrdersResponse | null;
  loading: boolean;
  error: string | null;
}

interface UseEvmTransactionActions {
  getTransactionStatus: (payload: TransactionStatusRequest) => Promise<any>;
  storeSwapOrder: (payload: StoreSwapOrderRequest) => Promise<StoreSwapOrderResponse>;
  getSwapOrdersByWallet: (address: string, page?: number, limit?: number, loadMore?: boolean) => Promise<SwapOrdersResponse>;
  reset: () => void;
}

export const useEvmTransaction = (): UseEvmTransactionState & UseEvmTransactionActions => {
  const [state, setState] = useState<UseEvmTransactionState>({
    statusData: null,
    ordersData: null,
    loading: false,
    error: null,
  });

  const getTransactionStatusAction = useCallback(async (payload: TransactionStatusRequest) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await getTransactionStatus(payload);
      setState(prev => ({ ...prev, statusData: data, loading: false }));
      return data;
    } catch (err: any) {
      const message = err.message || 'An error occurred';
      setState(prev => ({ ...prev, error: message, loading: false }));
      throw err;
    }
  }, []);

  const storeSwapOrderAction = useCallback(async (payload: StoreSwapOrderRequest) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await storeSwapOrder(payload);
      setState(prev => ({ ...prev, loading: false }));
      return data;
    } catch (err: any) {
      const message = err.message || 'An error occurred';
      setState(prev => ({ ...prev, error: message, loading: false }));
      throw err;
    }
  }, []);

  const getSwapOrdersByWalletAction = useCallback(async (address: string, page: number = 1, limit: number = 10, loadMore: boolean = false) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await getSwapOrdersByWallet(address, page, limit);
      setState(prev => {
        const existingData = (loadMore && prev.ordersData?.data) ? prev.ordersData.data : [];
        return {
          ...prev,
          ordersData: {
            ...data,
            data: [...existingData, ...data.data],
          },
          loading: false,
        };
      });
      return data;
    } catch (err: any) {
      const message = err.message || 'An error occurred';
      setState(prev => ({ ...prev, error: message, loading: false }));
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      statusData: null,
      ordersData: null,
      loading: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    getTransactionStatus: getTransactionStatusAction,
    storeSwapOrder: storeSwapOrderAction,
    getSwapOrdersByWallet: getSwapOrdersByWalletAction,
    reset,
  };
};
