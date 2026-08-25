export interface Market {
  symbol: string;         // e.g., 'BTC-USD'
  baseAsset: string;      // e.g., 'BTC'
  quoteAsset: string;     // e.g., 'USD'
  tickSize: number;       // e.g., 0.1
  stepSize: number;       // e.g., 0.0001
  minOrderSize: number;   // e.g., 0.001
  minNotional?: number;   // e.g., 5 (Minimum order value in quote asset)
  maxLeverage: number;    // e.g., 50
}

export interface Ticker {
  symbol: string;
  lastPrice: string;
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  volume24h: string;
  openInterest: string;
  high24h: string;
  low24h: string;
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  updateId?: number;     // Sequence number for missing event detection
}

export interface Trade {
  id: string;            // Unique identifier for the trade
  symbol: string;        // e.g., 'BTC-USD'
  price: string;         // Trade execution price
  size: string;          // Trade size
  side: 'buy' | 'sell';  // Direction of the trade
  timestamp: number;     // Unix timestamp of the trade
}

export type CandleResolution = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '8h' | '12h' | '1d' | '3d' | '1w' | '1M';

export interface Candle {
  startedAt: string;      // ISO string
  startedAtTime: number;  // Unix timestamp (ms)
  ticker: string;
  resolution: string;
  low: string;
  high: string;
  open: string;
  close: string;
  baseTokenVolume: string; // Base asset volume
  usdVolume: string;       // Quote asset volume
  trades: number;          // Number of trades in the period
  id: string;              // Unique ID (usually same as startedAt)
}

export interface Position {
  symbol: string;
  size: string;         // Positive for long, negative for short
  entryPrice: string;
  markPrice: string;
  liquidationPrice: string;
  unrealizedPnl: string;
  leverage: number;
  marginType: 'cross' | 'isolated';
  isolatedMargin: string;
}

export interface Order {
  id: string;
  symbol: string;
  type: 'limit' | 'market' | 'stop_limit' | 'take_profit';
  side: 'buy' | 'sell';
  price: string;
  size: string;
  filledSize: string;
  status: 'new' | 'partially_filled' | 'filled' | 'canceled' | 'rejected';
  reduceOnly: boolean;
  timestamp: number;
}

export interface UserTrade {
  id: string;
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: string;
  size: string;
  fee: string;
  feeAsset: string;
  realizedPnl: string;
  timestamp: number;
}

export interface AccountBalance {
  asset: string;        // e.g. USDT
  total: string;        // Total wallet balance
  available: string;    // Available to trade
  locked: string;       // Locked in orders
  marginBalance?: string; // Margin balance for futures
  unrealizedPnl?: string; // Unrealized Pnl for futures
}
