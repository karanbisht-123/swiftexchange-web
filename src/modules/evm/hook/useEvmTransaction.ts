import { useCallback, useState } from 'react';
import { getTransactionStatus, type TransactionStatusRequest } from '../service/evmTransactionStatusService';

interface UseEvmTransactionState {
  statusData: any | null;
  loading: boolean;
  error: string | null;
}

interface UseEvmTransactionActions {
  getTransactionStatus: (payload: TransactionStatusRequest) => Promise<any>;
  reset: () => void;
}

export const useEvmTransaction = (): UseEvmTransactionState & UseEvmTransactionActions => {
  const [state, setState] = useState<UseEvmTransactionState>({
    statusData: null,
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

  const reset = useCallback(() => {
    setState({
      statusData: null,
      loading: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    getTransactionStatus: getTransactionStatusAction,
    reset,
  };
};
