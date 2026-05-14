import { fetchApiResponseFromProxy } from '../../../service/apiService';
import { parseSwapError } from '../utils/swapErrorHandler';
// import { ethers } from 'ethers';
export interface TransactionStatusRequest {
  walletType: string;
  txHash: string;
  provider: string;
}

export interface StoreSwapOrderRequest {
  txHash: string;
  walletAddress: string;
  provider: string;
  fromChain: string;
  fromToken: string;
  toChain: string;
  toToken: string;
  amountIn: string;
  amountOut: string;
}

export interface StoreSwapOrderResponse {
  deviceId: string;
  txHash: string;
  provider: string;
  walletAddress: string;
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amountIn: string;
  amountOut: string;
  status: string;
  blockNumber: number | null;
  confirmedAt: string | null;
  deviceFcmToken: string;
  _id: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export interface SwapOrder {
  _id: string;
  requestId?: string;
  txHash: string;
  provider: string;
  walletAddress: string;
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amountIn: string;
  amountOut: string;
  status: string;
  blockNumber: number | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export interface SwapOrdersResponse {
  data: SwapOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const CHAIN_ALIAS_MAP: Record<string, string> = {
  BNB: "BSC",
};

function normalizeChain(chain: string): string {
  return CHAIN_ALIAS_MAP[chain.toUpperCase()] ?? chain;
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

// export async function storeSwapOrder(payload: StoreSwapOrderRequest): Promise<StoreSwapOrderResponse> {
//   try {
//     const res = await fetchApiResponseFromProxy<any>('/swapOrders/store', 'POST', payload);
//     const data = res.data?.data || res.data;
//     if (!data) throw new Error('Failed to store swap order');
//     return data;
//   } catch (error: any) {
//     const message = parseSwapError(error);
//     throw new Error(message);
//   }
// }

export async function storeSwapOrder(payload: StoreSwapOrderRequest): Promise<StoreSwapOrderResponse> {
  try {
    const normalizedPayload: StoreSwapOrderRequest = {
      ...payload,
      fromChain: normalizeChain(payload.fromChain),
      toChain: normalizeChain(payload.toChain),
    };

    const res = await fetchApiResponseFromProxy<any>('/swapOrders/store', 'POST', normalizedPayload);
    const data = res.data?.data || res.data;
    if (!data) throw new Error('Failed to store swap order');
    return data;
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}

export async function getSwapOrdersByWallet(address: string, page: number = 1, limit: number = 10): Promise<SwapOrdersResponse> {
  // const checksumAddress = ethers.getAddress(address);
  try {
    const res = await fetchApiResponseFromProxy<any>(`/swapOrders/orderByWallet?address=${address}&limit=${limit}&page=${page}`, 'GET');
    const data = res.data?.data || res.data;
    console.log(data, "");

    if (!data) throw new Error('Failed to fetch swap orders');
    return data;
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}
