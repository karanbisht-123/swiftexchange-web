import type { PerpExchange } from '../../core/interfaces/exchange';
import type { Market, OrderBook, Ticker } from '../../core/models';
import { HyperliquidMarkets } from './markets';
import { HyperliquidOrderBook } from './orderbook';
import { HyperliquidWebSocket } from './websocket';
import { HyperliquidSigner } from './signer';

export class HyperliquidClient implements PerpExchange {
  private readonly marketsApi: HyperliquidMarkets;
  private readonly orderBookApi: HyperliquidOrderBook;
  private readonly wsClient: HyperliquidWebSocket;
  public readonly signer: HyperliquidSigner;

  constructor() {
    this.marketsApi = new HyperliquidMarkets();
    this.orderBookApi = new HyperliquidOrderBook();
    this.wsClient = new HyperliquidWebSocket();
    this.signer = new HyperliquidSigner();
  }

  public async connect(): Promise<void> {
    await this.wsClient.connect();
  }

  public async disconnect(): Promise<void> {
    this.wsClient.disconnect();
  }

  public async getMarkets(): Promise<Market[]> {
    return this.marketsApi.getMarkets();
  }

  public async getOrderBook(symbol: string): Promise<OrderBook> {
    const coin = this.extractCoinFromSymbol(symbol);
    return this.orderBookApi.getOrderBook(coin);
  }

  /**
   * Note: The UI doesn't necessarily need the callback anymore if it listens
   * to perpEventBus.emit(PerpEvent.ORDER_UPDATED), but we keep the callback
   * parameter for backwards compatibility with the interface.
   */
  public async subscribeOrderBook(
    symbol: string,
    _callback?: (ob: OrderBook) => void
  ): Promise<void> {
    const coin = this.extractCoinFromSymbol(symbol);
    // Since WebSocketManager manages its own callbacks through the event bus
    // the UI should ideally subscribe to `perpEventBus` directly.
    this.wsClient.subscribeL2Book(coin);
  }

  public async subscribeTicker(
    symbol: string,
    _callback?: (ticker: Ticker) => void
  ): Promise<void> {
    const coin = this.extractCoinFromSymbol(symbol);
    this.wsClient.subscribeTrades(coin);
  }

  public subscribeCandles(coin: string, interval: string): void {
    this.wsClient.subscribeCandles(coin, interval);
  }

  public unsubscribeCandles(coin: string, interval: string): void {
    this.wsClient.unsubscribeCandles(coin, interval);
  }

  public async getCandles(
    coin: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Promise<import('../../core/models').Candle[]> {
    return this.marketsApi.getCandles(coin, interval, startTime, endTime);
  }

  private extractCoinFromSymbol(symbol: string): string {
    if (!symbol) return '';
    const normalized = symbol.replace('_', '-').toUpperCase();
    return normalized.split('-')[0] || normalized;
  }
}
