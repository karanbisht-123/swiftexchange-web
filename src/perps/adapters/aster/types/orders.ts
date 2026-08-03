export type OrderType =
  | 'LIMIT'
  | 'MARKET'
  | 'STOP'
  | 'STOP_MARKET'
  | 'TAKE_PROFIT'
  | 'TAKE_PROFIT_MARKET'
  | 'TRAILING_STOP_MARKET';

export type OrderSide = 'BUY' | 'SELL';

// TimeInForce values
export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'GTX';

// Order status values 
export type OrderStatus =
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'EXPIRED';

// Position side.
export type PositionSide = 'BOTH' | 'LONG' | 'SHORT';

// Working type.
export type WorkingType = 'MARK_PRICE' | 'CONTRACT_PRICE';

// newOrderRespType.
export type OrderRespType = 'ACK' | 'RESULT';

// Place order request params
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
  activationPrice?: string;       // TRAILING_STOP_MARKET only
  callbackRate?: string;          // TRAILING_STOP_MARKET only, min 0.1 max 5
  workingType?: WorkingType;
  priceProtect?: boolean;
  newOrderRespType?: OrderRespType;
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
  activatePrice?: string;   // only for TRAILING_STOP_MARKET
  priceRate?: string;       // callback rate, only for TRAILING_STOP_MARKET
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
