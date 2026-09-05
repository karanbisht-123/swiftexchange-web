import type { Candle, Market, OrderBook, Ticker } from '../models';

export interface PerpExchange {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getMarkets(): Promise<Market[]>;
  getOrderBook(symbol: string): Promise<OrderBook>;
  subscribeOrderBook(symbol: string, callback?: (ob: OrderBook) => void): Promise<void>;
  subscribeTicker(symbol: string, callback?: (ticker: Ticker) => void): Promise<void>;

  // Optional — implemented per-adapter based on exchange capability
  subscribeCandles?(coin: string, interval: string): void;
  unsubscribeCandles?(coin: string, interval: string): void;
  getCandles?(
    coin: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Promise<Candle[]>;

  // User Data / Account (Optional for unauthenticated phase)
  getPositions?(): Promise<import('../models').Position[]>;
  getOpenOrders?(): Promise<import('../models').Order[]>;
  getTradeHistory?(): Promise<import('../models').UserTrade[]>;
  getBalances?(): Promise<import('../models').AccountBalance[]>;

  // Trading Execution (Optional for unauthenticated phase)
  placeOrder?(order: any): Promise<any>;
  cancelOrder?(orderId: string, symbol: string): Promise<any>;
}
