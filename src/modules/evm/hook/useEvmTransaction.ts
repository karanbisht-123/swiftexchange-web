import { useCallback, useState } from 'react';
import {
  getTransactionStatus,
  storeSwapOrder,
  getSwapOrdersByWallet,
  type TransactionStatusRequest,
  type StoreSwapOrderRequest,
  type StoreSwapOrderResponse,
  type SwapOrdersResponse,
  type SwapOrder,
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
  getSwapOrdersByWallet: (addresses: string[], page?: number, limit?: number, loadMore?: boolean) => Promise<SwapOrdersResponse>;
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

  const getSwapOrdersByWalletAction = useCallback(async (addresses: string[], page: number = 1, limit: number = 10, loadMore: boolean = false) => {
    if (!addresses || addresses.length === 0) {
      setState(prev => ({ ...prev, loading: false }));
      return { data: [], total: 0, page, limit, totalPages: 0, hasNext: false, hasPrev: false };
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const results = await Promise.all(
        addresses.map(addr =>
          getSwapOrdersByWallet(addr, page, limit).catch(err => {
            console.error(`Failed to fetch orders for address ${addr}:`, err);
            return { data: [], total: 0, page, limit, totalPages: 0, hasNext: false, hasPrev: false } as SwapOrdersResponse;
          })
        )
      );

      // Merge all results
      const allData: SwapOrder[] = [];
      let total = 0;
      let totalPages = 0;
      let hasNext = false;
      let hasPrev = false;

      results.forEach(res => {
        if (res && Array.isArray(res.data)) {
          allData.push(...res.data);
          total += res.total || 0;
          totalPages = Math.max(totalPages, res.totalPages || 0);
          if (res.hasNext) hasNext = true;
          if (res.hasPrev) hasPrev = true;
        }
      });

      // Sort combined data by createdAt descending
      allData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const mergedResponse: SwapOrdersResponse = {
        data: allData,
        total,
        page,
        limit,
        totalPages,
        hasNext,
        hasPrev,
      };

      setState(prev => {
        const existingData = (loadMore && prev.ordersData?.data) ? prev.ordersData.data : [];
        const seenHashes = new Set<string>();
        const mergedDataList: SwapOrder[] = [];

        [...existingData, ...allData].forEach(order => {
          const hashLower = order.txHash.toLowerCase();
          if (!seenHashes.has(hashLower)) {
            seenHashes.add(hashLower);
            mergedDataList.push(order);
          }
        });

        // Re-sort
        mergedDataList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return {
          ...prev,
          ordersData: {
            ...mergedResponse,
            data: mergedDataList,
          },
          loading: false,
        };
      });

      return mergedResponse;
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
