import type { Signer } from 'ethers';

import { ASTER_ENDPOINTS } from '../constants';
import type {
  AsterOrderResponse,
  CancelBatchParams,
  CancelOrderParams,
  GetAllOrdersParams,
  PlaceOrderParams,
  QueryOrderParams,
} from '../types/orders';
import { signedRequest } from './auth';

const BATCH_ORDER_LIMIT = 5;

/**
 * Place a single order.
 * Supported types: LIMIT, MARKET, STOP, STOP_MARKET, TAKE_PROFIT,
 * TAKE_PROFIT_MARKET, TRAILING_STOP_MARKET.
 */
export async function placeOrder(
  signer: Signer,
  userAddr: string,
  params: PlaceOrderParams
): Promise<AsterOrderResponse> {
  const p: Record<string, string> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
  };

  if (params.quantity !== undefined) p.quantity = params.quantity;
  if (params.price !== undefined) p.price = params.price;
  if (params.timeInForce !== undefined) p.timeInForce = params.timeInForce;
  if (params.stopPrice !== undefined) p.stopPrice = params.stopPrice;
  if (params.activationPrice !== undefined) p.activationPrice = params.activationPrice;
  if (params.callbackRate !== undefined) p.callbackRate = params.callbackRate;
  if (params.workingType !== undefined) p.workingType = params.workingType;
  if (params.priceProtect !== undefined) p.priceProtect = String(params.priceProtect).toUpperCase();
  if (params.reduceOnly !== undefined) p.reduceOnly = String(params.reduceOnly);
  if (params.closePosition !== undefined) p.closePosition = String(params.closePosition);
  if (params.positionSide !== undefined) p.positionSide = params.positionSide;
  if (params.newClientOrderId !== undefined) p.newClientOrderId = params.newClientOrderId;
  if (params.newOrderRespType !== undefined) p.newOrderRespType = params.newOrderRespType;

  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.ORDER, p);
}

export async function placeChaseOrder(
  signer: Signer,
  userAddr: string,
  params: import('../types/orders').PlaceChaseParams
): Promise<any> {
  const p: Record<string, string> = {
    symbol: params.symbol,
    side: params.side,
    quantity: params.quantity,
    quantityUnit: params.quantityUnit || 'BASE',
  };

  if (params.positionSide !== undefined) p.positionSide = params.positionSide;
  if (params.reduceOnly !== undefined) p.reduceOnly = String(params.reduceOnly);
  if (params.chaseOffset !== undefined) p.chaseOffset = params.chaseOffset;
  if (params.chaseOffsetType !== undefined) p.chaseOffsetType = params.chaseOffsetType;
  if (params.maxChaseOffset !== undefined) p.maxChaseOffset = params.maxChaseOffset;
  if (params.maxChaseOffsetType !== undefined) p.maxChaseOffsetType = params.maxChaseOffsetType;
  if (params.timeInForce !== undefined) p.timeInForce = params.timeInForce;
  if (params.clientStrategyId !== undefined) p.clientStrategyId = params.clientStrategyId;

  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.CHASE, p);
}

/**
 * Place multiple orders in a single request.
 * batchOrders param is sent as a JSON-stringified array — this is confirmed from Aster docs.
 * Max 5 orders per batch (BATCH_ORDER_LIMIT). Excess orders are silently dropped; validate
 */
export async function placeBatchOrders(
  signer: Signer,
  userAddr: string,
  orders: PlaceOrderParams[]
): Promise<AsterOrderResponse[]> {
  const responses: AsterOrderResponse[] = [];

  // Aster API limits to BATCH_ORDER_LIMIT (5) per request
  for (let i = 0; i < orders.length; i += BATCH_ORDER_LIMIT) {
    const chunk = orders.slice(i, i + BATCH_ORDER_LIMIT);
    const chunkResponses = await signedRequest(
      signer,
      userAddr,
      'POST',
      ASTER_ENDPOINTS.BATCH_ORDERS,
      {
        batchOrders: JSON.stringify(chunk),
      }
    );

    if (Array.isArray(chunkResponses)) {
      responses.push(...chunkResponses);
    }
  }

  return responses;
}

// Cancel a single order by orderId or origClientOrderId.
export async function cancelOrder(
  signer: Signer,
  userAddr: string,
  params: CancelOrderParams
): Promise<AsterOrderResponse> {
  const p: Record<string, string> = { symbol: params.symbol };
  if (params.orderId !== undefined) p.orderId = String(params.orderId);
  if (params.origClientOrderId !== undefined) p.origClientOrderId = params.origClientOrderId;
  return signedRequest(signer, userAddr, 'DELETE', ASTER_ENDPOINTS.ORDER, p);
}

// Cancel all open orders for a symbol.
export async function cancelAllOpenOrders(
  signer: Signer,
  userAddr: string,
  symbol: string
): Promise<{ code: number; msg: string }> {
  return signedRequest(signer, userAddr, 'DELETE', ASTER_ENDPOINTS.ALL_OPEN_ORDERS, { symbol });
}

//Cancel a batch of orders by ID lists.
export async function cancelBatchOrders(
  signer: Signer,
  userAddr: string,
  params: CancelBatchParams
): Promise<AsterOrderResponse[]> {
  const p: Record<string, string> = { symbol: params.symbol };
  if (params.orderIdList) p.orderIdList = JSON.stringify(params.orderIdList);
  if (params.origClientOrderIdList)
    p.origClientOrderIdList = JSON.stringify(params.origClientOrderIdList);
  return signedRequest(signer, userAddr, 'DELETE', ASTER_ENDPOINTS.BATCH_ORDERS, p);
}

// Query a single order's current status.
export async function queryOrder(
  signer: Signer,
  userAddr: string,
  params: QueryOrderParams
): Promise<AsterOrderResponse> {
  const p: Record<string, string> = { symbol: params.symbol };
  if (params.orderId !== undefined) p.orderId = String(params.orderId);
  if (params.origClientOrderId !== undefined) p.origClientOrderId = params.origClientOrderId;
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.ORDER, p);
}

// Get all currently open orders, optionally filtered by symbol.
export async function getOpenOrders(
  signer: Signer,
  userAddr: string,
  symbol?: string
): Promise<AsterOrderResponse[]> {
  const p: Record<string, string> = {};
  if (symbol) p.symbol = symbol;
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.OPEN_ORDERS, p);
}

// Get order history with optional time-range and pagination.
export async function getAllOrders(
  signer: Signer,
  userAddr: string,
  params: Omit<GetAllOrdersParams, 'symbol'> & { symbol?: string }
): Promise<AsterOrderResponse[]> {
  const p: Record<string, string> = {};
  if (params.symbol) p.symbol = params.symbol;
  if (params.orderId !== undefined) p.orderId = String(params.orderId);
  if (params.startTime !== undefined) p.startTime = String(params.startTime);
  if (params.endTime !== undefined) p.endTime = String(params.endTime);
  if (params.limit !== undefined) p.limit = String(params.limit);
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.ALL_ORDERS, p);
}
