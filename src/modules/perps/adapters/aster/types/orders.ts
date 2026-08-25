export type OrderType =
  | 'LIMIT'
  | 'MARKET'
  | 'STOP'
  | 'STOP_MARKET'
  | 'TAKE_PROFIT'
  | 'TAKE_PROFIT_MARKET'
  | 'TRAILING_STOP_MARKET';

export type OrderSide = 'BUY' | 'SELL';

export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'GTX';

export type OrderStatus =
  'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED';

export type PositionSide = 'BOTH' | 'LONG' | 'SHORT';

export type WorkingType = 'MARK_PRICE' | 'CONTRACT_PRICE';

export type OrderRespType = 'ACK' | 'RESULT';

export interface PlaceOrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  positionSide?: PositionSide;
  timeInForce?: TimeInForce;
  quantity?: string;
  reduceOnly?: boolean;
  price?: string;
  newClientOrderId?: string;
  stopPrice?: string;
  closePosition?: boolean;
  activationPrice?: string;
  callbackRate?: string;
  workingType?: WorkingType;
  priceProtect?: boolean;
  newOrderRespType?: OrderRespType;
  pegPriceType?: 'COUNTERPARTY_1' | 'QUEUE_1';
  pegOffset?: string;
  stpMode?: 'EXPIRE_TAKER' | 'EXPIRE_MAKER' | 'EXPIRE_BOTH';
}

export interface PlaceChaseParams {
  symbol: string;
  side: OrderSide;
  quantity: string;
  quantityUnit?: 'BASE' | 'QUOTE';
  positionSide?: PositionSide;
  reduceOnly?: boolean;
  chaseOffset?: string;
  chaseOffsetType?: 'ABSOLUTE' | 'PERCENTAGE';
  maxChaseOffset?: string;
  maxChaseOffsetType?: 'ABSOLUTE' | 'PERCENTAGE';
  timeInForce?: TimeInForce;
  clientStrategyId?: string;
}

export interface AsterOrderResponse {
  orderId: number;
  symbol: string;
  status: OrderStatus;
  clientOrderId: string;
  price: string;
  avgPrice: string;
  origQty: string;
  executedQty: string;
  cumQty: string;
  cumQuote: string;
  timeInForce: TimeInForce;
  type: OrderType;
  origType: OrderType;
  side: OrderSide;
  positionSide: PositionSide;
  stopPrice: string;
  closePosition: boolean;
  activatePrice?: string;
  priceRate?: string;
  updateTime: number;
  workingType: WorkingType;
  priceProtect: boolean;
  reduceOnly: boolean;
  time?: number;
}

export interface CancelOrderParams {
  symbol: string;
  orderId?: number;
  origClientOrderId?: string;
}

export interface CancelBatchParams {
  symbol: string;
  orderIdList?: number[];
  origClientOrderIdList?: string[];
}

export interface QueryOrderParams {
  symbol: string;
  orderId?: number;
  origClientOrderId?: string;
}

export interface GetAllOrdersParams {
  symbol: string;
  orderId?: number;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface AsterApiErrorShape {
  code: number;
  msg: string;
}
