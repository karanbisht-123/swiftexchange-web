import { OrderExecution, OrderSide, OrderTimeInForce, OrderType } from '@dydxprotocol/v4-client-js';

export const OrderTypeEnum = {
  MARKET: 'MARKET',
  LIMIT: 'LIMIT',
  STOP_MARKET: 'STOP_MARKET',
  STOP_LIMIT: 'STOP_LIMIT',
  TAKE_PROFIT_MARKET: 'TAKE_PROFIT_MARKET',
  TAKE_PROFIT_LIMIT: 'TAKE_PROFIT_LIMIT',
} as const;

export type OrderTypeEnum = (typeof OrderTypeEnum)[keyof typeof OrderTypeEnum];

export const OrderSideEnum = {
  BUY: 'BUY',
  SELL: 'SELL',
} as const;

export type OrderSideEnum = (typeof OrderSideEnum)[keyof typeof OrderSideEnum];

export const TimeInForceEnum = {
  GTT: 'GTT', // Good Till Time
  IOC: 'IOC', // Immediate Or Cancel
  FOK: 'FOK',
} as const;

export type TimeInForceEnum = (typeof TimeInForceEnum)[keyof typeof TimeInForceEnum];

export interface PlaceOrderParams {
  market: string;
  side: OrderSideEnum;
  type: OrderTypeEnum;
  size: any;
  price?: number;
  triggerPrice?: number;
  timeInForce?: TimeInForceEnum;
  reduceOnly?: boolean;
  postOnly?: boolean;
  clientId?: number;
  slippageTolerance?: number;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  clientId?: number;
  transactionHash?: string;
  confirmationUrl?: string;
  timestamp?: string;
  userMessage?: string;
  orderStatus?: string;
  error?: string;
  errorCode?: string;
  errorType?: string;
  retryable?: boolean;
}

export interface MarketInfo {
  clobPairId: number;
  ticker: string;
  stepSize: string; // Minimum size increment
  tickSize: string; // Minimum price increment
  minOrderSize: string; // Minimum order size
  atomicResolution: number;
  status: string;
  baseAsset: string;
  quoteAsset: string;
}

export interface Position {
  market: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
  leverage: string;
  liquidationPrice: string;
  createdAt?: string;
}

export interface OpenOrder {
  id: string;
  clientId: number;
  market: string;
  side: OrderSideEnum;
  type: OrderTypeEnum;
  size: string;
  price: string;
  filledSize: string;
  remainingSize: string;
  status: string;
  createdAt: string;
  triggerPrice?: string;
  reduceOnly: boolean;
  postOnly: boolean;
  timeInForce: string;
  goodTilBlock?: number;
  goodTilBlockTime?: string;
  orderFlags: number;
}

export interface OrderConfig {
  type: OrderType;
  side: OrderSide;
  timeInForce: OrderTimeInForce;
  execution: OrderExecution;
  price: number;
  size: number;
  clientId: number;
  postOnly: boolean;
  reduceOnly: boolean;
  triggerPrice?: number;
  goodTilTimeInSeconds: number;
}

export const mapOrderType = (type: OrderTypeEnum): OrderType => {
  const map: Record<OrderTypeEnum, OrderType> = {
    MARKET: OrderType.MARKET,
    LIMIT: OrderType.LIMIT,
    STOP_MARKET: OrderType.STOP_MARKET,
    STOP_LIMIT: OrderType.STOP_LIMIT,
    TAKE_PROFIT_MARKET: OrderType.TAKE_PROFIT_MARKET,
    TAKE_PROFIT_LIMIT: OrderType.TAKE_PROFIT_LIMIT,
  };
  return map[type];
};

export const mapOrderSide = (side: OrderSideEnum): OrderSide => {
  return side === 'BUY' ? OrderSide.BUY : OrderSide.SELL;
};

export const mapTimeInForce = (tif?: TimeInForceEnum): OrderTimeInForce => {
  if (!tif) return OrderTimeInForce.GTT;

  const map: Record<TimeInForceEnum, OrderTimeInForce> = {
    GTT: OrderTimeInForce.GTT,
    IOC: OrderTimeInForce.IOC,
    FOK: OrderTimeInForce.FOK,
  };
  return map[tif];
};
