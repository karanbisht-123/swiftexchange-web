import { fetchApiResponseFromProxy } from '../../../service/apiService';

import { parseSwapError } from '../utils/swapErrorHandler';

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

  /** Shared group key linking the bridge order and its deposit order. */
  requestId?: string;

  quoteId?: string;

  txType?:
  | 'Native Transfer'
  | 'Token Transfer'
  | 'Token Approval'
  | 'Swap'
  | 'Bridge'
  | 'Contract Call'
  | 'Unknown';
}

export interface StoreSwapOrderResponse {
  deviceId: string;

  txHash: string;
  provider: string;

  quoteId?: string;

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
  txType?: string;
}

export interface SwapOrder {
  _id: string;

  requestId?: string;
  quoteId?: string;

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
  txType?: string;
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

// Chain alias mapping
const CHAIN_ALIAS_MAP: Record<
  string,
  string
> = {
  BNB: 'BSC',
};

// Normalize chain name
function normalizeChain(
  chain: string
): string {
  return (
    CHAIN_ALIAS_MAP[
    chain.toUpperCase()
    ] ?? chain
  );
}

// Get transaction status
export async function getTransactionStatus(
  payload: TransactionStatusRequest
): Promise<any> {
  try {
    const res =
      await fetchApiResponseFromProxy<any>(
        '/swapOrders/bridgeOrderStatus',
        'POST',
        payload
      );

    const data =
      res.data?.data || res.data;

    if (!data) {
      throw new Error(
        'Failed to fetch transaction status'
      );
    }

    return data;
  } catch (error: any) {
    const message =
      parseSwapError(error);

    throw new Error(message);
  }
}

// Store swap order
export async function storeSwapOrder(
  payload: StoreSwapOrderRequest
): Promise<StoreSwapOrderResponse> {
  try {
    // Normalize chain names
    const normalizedPayload: StoreSwapOrderRequest =
    {
      ...payload,

      fromChain: normalizeChain(
        payload.fromChain
      ),

      toChain: normalizeChain(
        payload.toChain
      ),
    };

    const res =
      await fetchApiResponseFromProxy<any>(
        '/swapOrders/store',
        'POST',
        normalizedPayload,
        1, // retries
        true // keepalive
      );

    const data =
      res.data?.data || res.data;

    if (!data) {
      throw new Error(
        'Failed to store swap order'
      );
    }

    return data;
  } catch (error: any) {
    const message =
      parseSwapError(error);

    throw new Error(message);
  }
}

// Get swap orders by wallet
export async function getSwapOrdersByWallet(
  address: string,
  page: number = 1,
  limit: number = 10
): Promise<SwapOrdersResponse> {
  try {
    const res =
      await fetchApiResponseFromProxy<any>(
        `/swapOrders/orderByWallet?address=${address}&limit=${limit}&page=${page}`,
        'GET'
      );

    const data =
      res.data?.data || res.data;

    if (!data) {
      throw new Error(
        'Failed to fetch swap orders'
      );
    }

    return data;
  } catch (error: any) {
    const message =
      parseSwapError(error);

    throw new Error(message);
  }
}

export interface UpdateSwapOrderStatusRequest {
  txHash: string;
  orderStatus: string;
}

// Update swap order status
export async function updateSwapOrderStatus(
  payload: UpdateSwapOrderStatusRequest
): Promise<any> {
  try {
    const res =
      await fetchApiResponseFromProxy<any>(
        '/swapOrders/updateStatus',
        'PUT',
        payload
      );

    const data =
      res.data?.data || res.data;

    if (!data) {
      throw new Error(
        'Failed to update swap order status'
      );
    }

    return data;
  } catch (error: any) {
    const message =
      parseSwapError(error);

    throw new Error(message);
  }
}

export interface FusionOrderFill {
  txHash: string;
  filledMakerAmount: string;
  filledAuctionTakerAmount: string;
  takerFeeAmount: string;
  status: string;
}

export interface FusionOrderStatusResponse {
  status: string;
  makingAmount?: string;
  takingAmount?: string;
  auctionStartDate?: number;
  auctionDuration?: number;
  fills?: FusionOrderFill[];
}

// Get 1inch Fusion Order Status
export async function getFusionOrderStatus(
  chain: string,
  orderHash: string,
  swapProvider: string
): Promise<FusionOrderStatusResponse> {
  try {
    const res = await fetchApiResponseFromProxy<any>(
      `/swap/1inch/orderStatus?chain=${chain}&orderHash=${orderHash}&swapProvider=${swapProvider}`,
      'GET'
    );

    const data = res.data?.data || res.data;
    if (!data) throw new Error('Failed to fetch Fusion order status');

    return data as FusionOrderStatusResponse;
  } catch (error: any) {
    const message = parseSwapError(error);
    throw new Error(message);
  }
}