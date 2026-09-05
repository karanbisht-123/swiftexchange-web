import type { PerpExchange } from '../../core/interfaces/exchange';
import type { Candle, Market, OrderBook, Ticker } from '../../core/models';
import { type AssetCtx, useTickerStore } from '../../core/stores/tickerStore';
import { ASTER_ENDPOINTS, ASTER_REST_URL } from './constants';
import { AsterMapper } from './mapper';
import { AsterWebSocket } from './websocket';

export class AsterClient implements PerpExchange {
  private wsClient: AsterWebSocket;

  constructor() {
    this.wsClient = AsterWebSocket.getInstance();
  }

  public async connect(): Promise<void> {
    await this.wsClient.connect();
  }

  public async disconnect(): Promise<void> {
    this.wsClient.disconnect();
  }

  public async getMarkets(): Promise<Market[]> {
    const [infoResponse, tickerResponse] = await Promise.all([
      fetch(`${ASTER_REST_URL}${ASTER_ENDPOINTS.EXCHANGE_INFO}`),
      fetch(`${ASTER_REST_URL}${ASTER_ENDPOINTS.TICKER_24HR}`),
    ]);

    const [infoData, tickerData] = await Promise.all([infoResponse.json(), tickerResponse.json()]);

    if (!infoData || !infoData.symbols) return [];

    // Populate initial ticker data to avoid blanks in the UI
    if (Array.isArray(tickerData)) {
      const contexts: Record<string, AssetCtx> = {};
      for (const t of tickerData) {
        const symbol = t.symbol.replace('USDT', '-USDT');
        contexts[symbol] = AsterMapper.mapTicker(t);
      }
      useTickerStore.getState().setMultipleAssetCtxs(contexts);
    }

    return infoData.symbols
      .filter((s: any) => s.contractType === 'PERPETUAL' || s.status === 'TRADING')
      .map(AsterMapper.mapMarket);
  }

  public async getOrderBook(symbol: string): Promise<OrderBook> {
    const coin = this.extractCoinFromSymbol(symbol);
    const asterSymbol = `${coin}USDT`;
    const response = await fetch(
      `${ASTER_REST_URL}${ASTER_ENDPOINTS.DEPTH}?symbol=${asterSymbol}&limit=100`
    );
    const data = await response.json();

    return AsterMapper.mapOrderBook(symbol, data);
  }

  public async subscribeOrderBook(
    symbol: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _callback?: (ob: OrderBook) => void
  ): Promise<void> {
    const coin = this.extractCoinFromSymbol(symbol);
    this.wsClient.subscribeOrderBook(coin);
  }

  public async subscribeTicker(
    symbol: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  ): Promise<Candle[]> {
    const asterSymbol = `${coin}USDT`;
    const url = `${ASTER_REST_URL}${ASTER_ENDPOINTS.KLINES}?symbol=${asterSymbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=500`;
    const response = await fetch(url);
    const data = await response.json();

    if (!Array.isArray(data)) {
      return [];
    }

    const uiSymbol = `${coin}-USDT`;
    return data.map((k: any) => AsterMapper.mapCandle(uiSymbol, interval, k));
  }

  private async signedFetch(
    endpoint: string,
    params: Record<string, string> = {},
    method = 'GET'
  ): Promise<any> {
    const query = new URLSearchParams(params);
    query.append('timestamp', Date.now().toString());
    query.append('signature', 'DUMMY_SIGNATURE');

    const url = `${ASTER_REST_URL}${endpoint}?${query.toString()}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // 'X-MBX-APIKEY': '...', // Will be added with user's listenKey or public key
      },
    });
    return response.json();
  }

  public async getPositions(): Promise<import('../../core/models').Position[]> {
    try {
      const data = await this.signedFetch(ASTER_ENDPOINTS.POSITION_RISK);
      if (Array.isArray(data)) {
        return data.filter(p => parseFloat(p.positionAmt) !== 0).map(AsterMapper.mapPosition);
      }
      return [];
    } catch (e) {
      console.error('Failed to fetch positions', e);
      return [];
    }
  }

  public async getOpenOrders(): Promise<import('../../core/models').Order[]> {
    try {
      const data = await this.signedFetch(ASTER_ENDPOINTS.OPEN_ORDERS);
      if (Array.isArray(data)) {
        return data.map(AsterMapper.mapOrder);
      }
      return [];
    } catch (e) {
      console.error('Failed to fetch open orders', e);
      return [];
    }
  }

  public async getTradeHistory(): Promise<import('../../core/models').UserTrade[]> {
    try {
      const data = await this.signedFetch(ASTER_ENDPOINTS.USER_TRADES);
      if (Array.isArray(data)) {
        return data.map(AsterMapper.mapUserTrade);
      }
      return [];
    } catch (e) {
      console.error('Failed to fetch trade history', e);
      return [];
    }
  }

  public async getBalances(): Promise<import('../../core/models').AccountBalance[]> {
    try {
      const data = await this.signedFetch(ASTER_ENDPOINTS.BALANCE);
      if (Array.isArray(data)) {
        return data.map(AsterMapper.mapAccountBalance);
      }
      return [];
    } catch (e) {
      console.error('Failed to fetch balances', e);
      return [];
    }
  }

  //Trade Execution

  public async placeOrder(order: any): Promise<any> {
    console.log('placeOrder requested', order);
    return null;
  }

  public async cancelOrder(orderId: string, symbol: string): Promise<any> {
    console.log('cancelOrder requested', { orderId, symbol });
    return null;
  }

  private extractCoinFromSymbol(symbol: string): string {
    // "BTC-USDC" -> "BTC"
    return symbol.split('-')[0] || symbol;
  }
}
