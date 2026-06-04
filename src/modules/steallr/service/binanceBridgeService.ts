import type { ChartDataPoint } from '../types/stellarChart.types';
import type { RecentTrade } from './recentTradesService';

const SUPPORTED_BINANCE_SYMBOLS = new Set([
  'XLMUSDC', 'XLMUSDT', 'XLMBTC', 'XLMETH',
  'USDCUSDT',
  'BTCUSDT', 'BTCUSDC',
  'ETHUSDT', 'ETHUSDC', 'ETHBTC'
]);

let binanceFailed = false;
let connectionAttempts = 0;
const MAX_ATTEMPTS = 2;

export function getBinanceSymbol(base: string, counter: string): string | null {
  if (binanceFailed) return null;
  
  const b = base.toUpperCase() === 'NATIVE' ? 'XLM' : base.toUpperCase();
  const c = counter.toUpperCase() === 'NATIVE' ? 'XLM' : counter.toUpperCase();

  const pair1 = `${b}${c}`;
  const pair2 = `${c}${b}`;

  if (SUPPORTED_BINANCE_SYMBOLS.has(pair1)) return pair1;
  if (SUPPORTED_BINANCE_SYMBOLS.has(pair2)) return pair2;

  return null;
}

export function isBinanceSupported(base: string, counter: string): boolean {
  if (binanceFailed) return false;
  return getBinanceSymbol(base, counter) !== null;
}

export function isFlippedPair(base: string, counter: string): boolean {
  const symbol = getBinanceSymbol(base, counter);
  if (!symbol) return false;
  
  const b = base.toUpperCase() === 'NATIVE' ? 'XLM' : base.toUpperCase();
  return !symbol.startsWith(b);
}

export function getBinanceInterval(resolutionMs: number): string {
  switch (resolutionMs) {
    case 60000: return '1m';
    case 300000: return '5m';
    case 900000: return '15m';
    case 3600000: return '1h';
    case 86400000: return '1d';
    case 604800000: return '1w';
    default: return '1m';
  }
}

class BinanceSocketManager {
  private static instance: BinanceSocketManager;
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<(data: any) => void>>();
  private activeStreams = new Set<string>();

  private constructor() {}

  static getInstance(): BinanceSocketManager {
    if (!BinanceSocketManager.instance) {
      BinanceSocketManager.instance = new BinanceSocketManager();
    }
    return BinanceSocketManager.instance;
  }

  subscribe(stream: string, callback: (data: any) => void): () => void {
    const s = stream.toLowerCase();
    
    if (!this.listeners.has(s)) {
      this.listeners.set(s, new Set());
    }
    this.listeners.get(s)!.add(callback);

    if (!this.activeStreams.has(s) && !binanceFailed) {
      this.activeStreams.add(s);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          method: 'SUBSCRIBE',
          params: [s],
          id: Date.now()
        }));
      } else {
        this.reconnect();
      }
    }

    return () => {
      const streamListeners = this.listeners.get(s);
      if (streamListeners) {
        streamListeners.delete(callback);
        if (streamListeners.size === 0) {
          this.listeners.delete(s);
          this.activeStreams.delete(s);

          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              method: 'UNSUBSCRIBE',
              params: [s],
              id: Date.now()
            }));
          }
        }
      }
      
      if (this.activeStreams.size === 0 && this.ws) {
        this.ws.close();
        this.ws = null;
      }
    };
  }

  private reconnect() {
    if (binanceFailed) return;
    if (this.ws) {
      this.ws.close();
    }
    if (this.activeStreams.size === 0) return;

    const streamsParam = Array.from(this.activeStreams).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streamsParam}`;
    
    let hasOpened = false;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      hasOpened = true;
      connectionAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const { stream, data } = JSON.parse(event.data);
        if (stream) {
          const s = stream.toLowerCase();
          const callbacks = this.listeners.get(s);
          if (callbacks) {
            callbacks.forEach(cb => cb(data));
          }
        }
      } catch (err) {
        console.error('Binance socket error processing message:', err);
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;

        if (!hasOpened) {
          connectionAttempts++;
          if (connectionAttempts >= MAX_ATTEMPTS) {
            console.warn('[BinanceSocketManager] Failed to connect to Binance WebSocket. Falling back to Stellar Horizon.');
            binanceFailed = true;
            window.dispatchEvent(new CustomEvent('binance:connection-failed'));
            return;
          }
        }

        if (this.activeStreams.size > 0 && !binanceFailed) {
          setTimeout(() => this.reconnect(), 5000);
        }
      }
    };

    ws.onerror = () => {
      // Handled by onclose
    };
  }
}

export class BinanceBridgeService {
  private static handleFetchFailure(err: any) {
    if (!binanceFailed) {
      console.warn('[BinanceBridgeService] REST API call failed. Falling back to Stellar Horizon.', err);
      binanceFailed = true;
      window.dispatchEvent(new CustomEvent('binance:connection-failed'));
    }
  }

  static async fetchOrderBook(symbol: string, isFlipped: boolean, limit: number = 20): Promise<any> {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol.toUpperCase()}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Binance HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return this.transformOrderBook(data, isFlipped);
    } catch (err) {
      this.handleFetchFailure(err);
      throw err;
    }
  }

  static streamOrderBook(
    symbol: string,
    isFlipped: boolean,
    onUpdate: (book: any) => void,
    onError?: (err: any) => void
  ): () => void {
    const streamName = `${symbol.toLowerCase()}@depth20@100ms`;
    
    return BinanceSocketManager.getInstance().subscribe(streamName, (data) => {
      try {
        const transformed = this.transformOrderBook(data, isFlipped);
        onUpdate(transformed);
      } catch (err) {
        if (onError) onError(err);
      }
    });
  }

  private static transformOrderBook(data: any, isFlipped: boolean): any {
    const rawBids = data.bids || [];
    const rawAsks = data.asks || [];

    if (!isFlipped) {
      return {
        bids: rawBids.map(([price, amount]: [string, string]) => ({ price, amount })),
        asks: rawAsks.map(([price, amount]: [string, string]) => ({ price, amount })),
      };
    } else {
      const bids = rawAsks.map(([price, amount]: [string, string]) => {
        const p = parseFloat(price);
        const a = parseFloat(amount);
        return {
          price: (1 / p).toFixed(7),
          amount: (a * p).toFixed(7),
        };
      });

      const asks = rawBids.map(([price, amount]: [string, string]) => {
        const p = parseFloat(price);
        const a = parseFloat(amount);
        return {
          price: (1 / p).toFixed(7),
          amount: (a * p).toFixed(7),
        };
      });

      return { bids, asks };
    }
  }

  static async fetchRecentTrades(symbol: string, isFlipped: boolean, limit: number = 50): Promise<RecentTrade[]> {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/trades?symbol=${symbol.toUpperCase()}&limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Binance HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.map((trade: any) => this.transformRecentTrade(trade, isFlipped));
    } catch (err) {
      this.handleFetchFailure(err);
      throw err;
    }
  }

  static streamRecentTrades(
    symbol: string,
    isFlipped: boolean,
    onTrade: (trade: RecentTrade) => void,
    onError?: (err: any) => void
  ): () => void {
    const streamName = `${symbol.toLowerCase()}@trade`;
    
    return BinanceSocketManager.getInstance().subscribe(streamName, (data) => {
      try {
        const trade = this.transformRecentTradeStream(data, isFlipped);
        onTrade(trade);
      } catch (err) {
        if (onError) onError(err);
      }
    });
  }

  private static transformRecentTrade(trade: any, isFlipped: boolean): RecentTrade {
    const priceNum = parseFloat(trade.price);
    const qtyNum = parseFloat(trade.qty);
    const isBuy = !trade.isBuyerMaker;

    if (!isFlipped) {
      return {
        id: trade.id.toString(),
        time: new Date(trade.time).toISOString(),
        price: priceNum.toFixed(7),
        amount: trade.qty,
        isBuy,
      };
    } else {
      return {
        id: trade.id.toString(),
        time: new Date(trade.time).toISOString(),
        price: (1 / priceNum).toFixed(7),
        amount: (qtyNum * priceNum).toFixed(7),
        isBuy: !isBuy,
      };
    }
  }

  private static transformRecentTradeStream(trade: any, isFlipped: boolean): RecentTrade {
    const priceNum = parseFloat(trade.p);
    const qtyNum = parseFloat(trade.q);
    const isBuy = !trade.m;

    if (!isFlipped) {
      return {
        id: trade.t.toString(),
        time: new Date(trade.T).toISOString(),
        price: priceNum.toFixed(7),
        amount: trade.q,
        isBuy,
      };
    } else {
      return {
        id: trade.t.toString(),
        time: new Date(trade.T).toISOString(),
        price: (1 / priceNum).toFixed(7),
        amount: (qtyNum * priceNum).toFixed(7),
        isBuy: !isBuy,
      };
    }
  }

  static async fetchTradeAggregations(
    symbol: string,
    isFlipped: boolean,
    interval: string,
    limit: number = 200
  ): Promise<ChartDataPoint[]> {
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`
      );
      if (!response.ok) {
        throw new Error(`Binance HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.map((kline: any[]) => this.transformKline(kline, isFlipped));
    } catch (err) {
      this.handleFetchFailure(err);
      throw err;
    }
  }

  static streamTradeAggregations(
    symbol: string,
    isFlipped: boolean,
    interval: string,
    onData: (point: ChartDataPoint) => void,
    onError?: (err: any) => void
  ): () => void {
    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    
    return BinanceSocketManager.getInstance().subscribe(streamName, (data) => {
      try {
        if (data.k) {
          const point = this.transformKlineStream(data.k, isFlipped);
          onData(point);
        }
      } catch (err) {
        if (onError) onError(err);
      }
    });
  }

  private static transformKline(kline: any[], isFlipped: boolean): ChartDataPoint {
    const openTime = kline[0];
    const openNum = parseFloat(kline[1]);
    const highNum = parseFloat(kline[2]);
    const lowNum = parseFloat(kline[3]);
    const closeNum = parseFloat(kline[4]);
    const baseVol = parseFloat(kline[5]);
    const quoteVol = parseFloat(kline[7]);
    const tradeCount = kline[8];

    if (!isFlipped) {
      return {
        timestamp: openTime,
        open: kline[1],
        high: kline[2],
        low: kline[3],
        close: kline[4],
        volume: (baseVol + quoteVol).toString(),
        baseVolume: kline[5],
        counterVolume: kline[7],
        tradeCount,
      };
    } else {
      return {
        timestamp: openTime,
        open: (1 / openNum).toString(),
        high: (1 / lowNum).toString(),
        low: (1 / highNum).toString(),
        close: (1 / closeNum).toString(),
        volume: (baseVol + quoteVol).toString(),
        baseVolume: kline[7],
        counterVolume: kline[5],
        tradeCount,
      };
    }
  }

  private static transformKlineStream(k: any, isFlipped: boolean): ChartDataPoint {
    const openTime = k.t;
    const openNum = parseFloat(k.o);
    const highNum = parseFloat(k.h);
    const lowNum = parseFloat(k.l);
    const closeNum = parseFloat(k.c);
    const baseVol = parseFloat(k.v);
    const quoteVol = parseFloat(k.q);
    const tradeCount = k.n;

    if (!isFlipped) {
      return {
        timestamp: openTime,
        open: k.o,
        high: k.h,
        low: k.l,
        close: k.c,
        volume: (baseVol + quoteVol).toString(),
        baseVolume: k.v,
        counterVolume: k.q,
        tradeCount,
      };
    } else {
      return {
        timestamp: openTime,
        open: (1 / openNum).toString(),
        high: (1 / lowNum).toString(),
        low: (1 / highNum).toString(),
        close: (1 / closeNum).toString(),
        volume: (baseVol + quoteVol).toString(),
        baseVolume: k.q,
        counterVolume: k.v,
        tradeCount,
      };
    }
  }
}
