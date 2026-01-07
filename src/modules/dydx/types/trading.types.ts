
export type OrderSideEnum = 'BUY' | 'SELL';


export type OrderTypeEnum =
  | 'MARKET' // Immediate execution at best price
  | 'LIMIT' // Execute at specified price or better
  | 'STOP_MARKET' // Market order triggered when price crosses trigger
  | 'STOP_LIMIT' // Limit order triggered when price crosses trigger
  | 'TAKE_PROFIT_MARKET' // Market order for profit taking
  | 'TAKE_PROFIT_LIMIT'; // Limit order for profit taking


export type TimeInForceEnum = 'GTT' | 'IOC' | 'FOK';

/**
 * Parameters for placing an order
 */
export interface PlaceOrderParams {
  market: string;
  side: OrderSideEnum;
  type: OrderTypeEnum;
  size: number | string;

  // Optional parameters
  price?: number;
  triggerPrice?: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
  clientId?: number;

  // Execution options
  reduceOnly?: boolean;
  postOnly?: boolean;
  timeInForce?: TimeInForceEnum;

  // Good til time in seconds (for GTT orders)
  // If not provided, defaults will be used (28 days for limit, 90 days for conditional)
  goodTilTimeInSeconds?: number;

  // Slippage for market orders
  slippageTolerance?: number;
}

/**
 * Position information
 */
export interface Position {
  market: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  unrealizedPnl: string;
  liquidationPrice?: string;
  netFunding?: string;
  leverage?: string;
}

/**
 * Open order information
 */
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

/**
 * Result from order placement
 */
/**
 * Result from order placement
 */
export interface OrderResult {
  success: boolean;
  clientId?: string | number;
  transactionHash?: string;
  error?: string;
  userMessage?: string;
  retryable?: boolean;
  optimisticOrder?: any;
}

/**
 * Trigger configuration for stop-loss and take-profit
 */
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

/**
 * Market information
 */
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
}

/**
 * Orderbook data
 */
export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

/**
 * Trading statistics
 */
export interface TradingStats {
  totalVolume: string;
  totalTrades: number;
  realizedPnl: string;
  unrealizedPnl: string;
  totalFunding: string;
}

/**
 * Account information
 */
export interface SubaccountInfo {
  address: string;
  subaccountNumber: number;
  equity: string;
  freeCollateral: string;
  marginUsage: string;
  buyingPower: string;
  leverage: string;
}

/**
 * Fill information
 */
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

/**
 * Transfer information
 */
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
