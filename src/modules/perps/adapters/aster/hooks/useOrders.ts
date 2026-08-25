import { useCallback, useState } from 'react';

import type { Signer } from 'ethers';

import {
  cancelAllOpenOrders,
  cancelBatchOrders,
  cancelOrder,
  getAllOrders,
  getOpenOrders,
  placeBatchOrders,
  placeChaseOrder,
  placeOrder,
  queryOrder,
} from '../api/orders';
import type {
  AsterOrderResponse,
  CancelBatchParams,
  CancelOrderParams,
  GetAllOrdersParams,
  PlaceChaseParams,
  PlaceOrderParams,
} from '../types/orders';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

function initState<T>(): AsyncState<T> {
  return { data: null, loading: false, error: null };
}

export function useOrders(signer: Signer | null, userAddr: string | null) {
  const [placeState, setPlaceState] = useState<AsyncState<AsterOrderResponse>>(initState());
  const [cancelState, setCancelState] =
    useState<AsyncState<AsterOrderResponse | { code: number; msg: string }>>(initState());
  const [openOrdersState, setOpenOrdersState] =
    useState<AsyncState<AsterOrderResponse[]>>(initState());
  const [orderHistoryState, setOrderHistoryState] =
    useState<AsyncState<AsterOrderResponse[]>>(initState());

  const place = useCallback(
    async (params: PlaceOrderParams) => {
      if (!signer || !userAddr) return;
      setPlaceState({ data: null, loading: true, error: null });
      try {
        const data = await placeOrder(signer, userAddr, params);
        setPlaceState({ data, loading: false, error: null });
        return data;
      } catch (e) {
        setPlaceState({
          data: null,
          loading: false,
          error: e instanceof Error ? e : new Error(String(e)),
        });
        throw e;
      }
    },
    [signer, userAddr]
  );

  const placeChase = useCallback(
    async (params: PlaceChaseParams) => {
      if (!signer || !userAddr) return;
      setPlaceState({ data: null, loading: true, error: null });
      try {
        const data = await placeChaseOrder(signer, userAddr, params);
        setPlaceState({ data, loading: false, error: null });
        return data;
      } catch (e) {
        setPlaceState({
          data: null,
          loading: false,
          error: e instanceof Error ? e : new Error(String(e)),
        });
        throw e;
      }
    },
    [signer, userAddr]
  );

  const placeBatch = useCallback(
    async (orders: PlaceOrderParams[]) => {
      if (!signer || !userAddr) return;
      return placeBatchOrders(signer, userAddr, orders);
    },
    [signer, userAddr]
  );

  const cancel = useCallback(
    async (params: CancelOrderParams) => {
      if (!signer || !userAddr) return;
      setCancelState({ data: null, loading: true, error: null });
      try {
        const data = await cancelOrder(signer, userAddr, params);
        setCancelState({ data, loading: false, error: null });
        return data;
      } catch (e) {
        setCancelState({
          data: null,
          loading: false,
          error: e instanceof Error ? e : new Error(String(e)),
        });
        throw e;
      }
    },
    [signer, userAddr]
  );

  const cancelAll = useCallback(
    async (symbol: string) => {
      if (!signer || !userAddr) return;
      return cancelAllOpenOrders(signer, userAddr, symbol);
    },
    [signer, userAddr]
  );

  const cancelBatch = useCallback(
    async (params: CancelBatchParams) => {
      if (!signer || !userAddr) return;
      return cancelBatchOrders(signer, userAddr, params);
    },
    [signer, userAddr]
  );

  const fetchQuery = useCallback(
    async (params: Parameters<typeof queryOrder>[2]) => {
      if (!signer || !userAddr) return;
      return queryOrder(signer, userAddr, params);
    },
    [signer, userAddr]
  );

  const fetchOpenOrders = useCallback(
    async (symbol?: string) => {
      if (!signer || !userAddr) return;
      setOpenOrdersState({ data: null, loading: true, error: null });
      try {
        const data = await getOpenOrders(signer, userAddr, symbol);
        setOpenOrdersState({ data, loading: false, error: null });
        return data;
      } catch (e) {
        setOpenOrdersState({
          data: null,
          loading: false,
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    },
    [signer, userAddr]
  );

  const fetchOrderHistory = useCallback(
    async (params: GetAllOrdersParams) => {
      if (!signer || !userAddr) return;
      setOrderHistoryState({ data: null, loading: true, error: null });
      try {
        const data = await getAllOrders(signer, userAddr, params);
        setOrderHistoryState({ data, loading: false, error: null });
        return data;
      } catch (e) {
        setOrderHistoryState({
          data: null,
          loading: false,
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    },
    [signer, userAddr]
  );

  return {
    place,
    placeChase,
    placeBatch,
    cancel,
    cancelAll,
    cancelBatch,
    query: fetchQuery,
    fetchOpenOrders,
    fetchOrderHistory,
    placeState,
    cancelState,
    openOrdersState,
    orderHistoryState,
  };
}
