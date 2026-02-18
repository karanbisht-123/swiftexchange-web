export type OrderSideEnum = 'BUY' | 'SELL';

export type OrderTypeEnum =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP_MARKET'
  | 'STOP_LIMIT'
  | 'TAKE_PROFIT_MARKET'
  | 'TAKE_PROFIT_LIMIT';

export type TimeInForceEnum = 'GTT' | 'IOC' | 'FOK';
export interface PlaceOrderParams {
  market: string;
  side: OrderSideEnum;
  type: OrderTypeEnum;
  size: number | string;
  price?: number;
  triggerPrice?: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
  clientId?: number;
  subaccountNumber?: number;
  reduceOnly?: boolean;
  postOnly?: boolean;
  timeInForce?: TimeInForceEnum;
  goodTilTimeInSeconds?: number;
  slippageTolerance?: number;
  leverage?: number;
}

export interface Position {
  market: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  unrealizedPnl: string;
  liquidationPrice?: string;
  netFunding?: string;
  leverage?: string;
  subaccountNumber?: number;
}

export interface OpenOrder {
  id: string;
  clientId: number;
  market: string;
  side: OrderSideEnum;
  type: OrderTypeEnum;
  size: string;
  price: string;
  triggerPrice?: string;
  status: 'OPEN' | 'FILLED' | 'CANCELED' | 'UNTRIGGERED';
  timeInForce: string;
  reduceOnly: boolean;
  postOnly: boolean;
  goodTilBlock?: string | number;
  goodTilBlockTime?: string;
  orderFlags: string;
  clobPairId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderResult {
  success: boolean;
  clientId?: string | number;
  transactionHash?: string;
  error?: string;
  userMessage?: string;
  retryable?: boolean;
  optimisticOrder?: any;
}

export interface TriggerParams {
  takeProfit?: {
    enabled: boolean;
    type: 'MARKET' | 'LIMIT';
    price: number;
  };
  stopLoss?: {
    enabled: boolean;
    type: 'MARKET' | 'LIMIT';
    price: number;
  };
}

export interface MarketData {
  ticker: string;
  oraclePrice: string;
  priceChange24H: string;
  priceChange24HPercent: string;
  volume24H: string;
  trades24H: number;
  nextFundingRate: string;
  nextFundingAt: string;
  openInterest: string;
  marketCaps?: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  marketId?: number;
  coinIcon: string;
  coinName?: string;
  initialMarginFraction?: string;
  maintenanceMarginFraction?: string;
  tickSize?: string;
  stepSize?: string;
  clobPairId?: string;
  atomicResolution?: number;
  quantumConversionExponent?: number;
  stepBaseQuantums?: number;
  subticksPerTick?: number;
  marketType?: string;
  openInterestLowerCap?: string;
  openInterestUpperCap?: string;
  baseOpenInterest?: string;
  defaultFundingRate1H?: string;
  spotVolume?: string;
  marketCap?: string;
  zeroFees?: boolean;
}

export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

export interface TradingStats {
  totalVolume: string;
  totalTrades: number;
  realizedPnl: string;
  unrealizedPnl: string;
  totalFunding: string;
}

export interface SubaccountInfo {
  address: string;
  subaccountNumber: number;
  equity: string;
  freeCollateral: string;
  marginUsage: string;
  buyingPower: string;
  leverage: string;
}

export interface Fill {
  id: string;
  side: OrderSideEnum;
  liquidity: 'TAKER' | 'MAKER';
  type: OrderTypeEnum;
  market: string;
  marketType: 'PERPETUAL';
  price: string;
  size: string;
  fee: string;
  createdAt: string;
  createdAtHeight: string;
  orderId?: string;
  clientMetadata?: string;
}

export interface Transfer {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  asset: string;
  amount: string;
  createdAt: string;
  createdAtHeight: string;
  transactionHash?: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
}
export type MarginMode = 'CROSS' | 'ISOLATED';


export interface TransferResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  fromSubaccount: number;
  toSubaccount: number;
  amount: string;
}


export interface SubaccountBalance {
  subaccountNumber: number;
  marginMode: MarginMode;
  equity: string;
  freeCollateral: string;
  market?: string;
  hasOpenPosition: boolean;
}

export const SUBACCOUNT_CONSTANTS = {
  ISOLATED_START: 128,
  ISOLATED_END: 128000,
  MIN_ISOLATED_EQUITY: 20,
  DEFAULT_CROSS_SUBACCOUNT: 0,
} as const;

