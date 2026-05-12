import { fetchApiResponseFromProxy } from '../../../service/apiService';
import { parseSwapError } from '../utils/swapErrorHandler';

export interface TransactionStatusRequest {
  walletType: string;
  txHash: string;
  provider: string;
}

export async function getTransactionStatus(payload: TransactionStatusRequest): Promise<any> {
  try {
    const res = await fetchApiResponseFromProxy<any>('/swapOrders/bridgeOrderStatus', 'POST', payload);
    const data = res.data?.data || res.data;
    if (!data) throw new Error('Failed to fetch transaction status');
    return data;
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}
