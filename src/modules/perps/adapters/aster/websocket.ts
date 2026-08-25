import { AsterMapper } from './mapper';
import { tradeStore } from '../../core/stores/tradeStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { perpEventBus, PerpEvent } from '../../core/events';
import { OrderbookEngine } from './OrderbookEngine';
import { ASTER_WS_URL, ASTER_WS_STREAMS } from './constants';
import { getAggTrades } from './api/trades';

type StreamHandler = (data: unknown) => void;

interface WsOptions {
  reconnectBaseMs?: number;
  maxReconnectMs?: number;
}

/**
 * Singleton WebSocket client for Aster Futures combined stream.
 * One connection, multiple stream subscriptions shared across all components.
 * Connects to /stream?streams=... and dispatches by stream name.
 */
export class AsterWebSocket {
  private static instance: AsterWebSocket | null = null;

  private ws: WebSocket | null = null;
  private msgId = 1;

  // stream name -> Set of handlers
  private handlers = new Map<string, Set<StreamHandler>>();

  // Active stream names for reconnect re-subscription
  private activeStreams = new Set<string>();

  // One OrderbookEngine per symbol (keyed by aster symbol e.g. "btcusdt")
  private engines = new Map<string, OrderbookEngine>();

  private reconnectBaseMs: number;
  private maxReconnectMs: number;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  // Stable no-op used as the subscription handler for streams where dispatchBuiltIn
  // handles all routing internally (depth, aggTrade, kline).
  private readonly _noop: StreamHandler = () => {};

  private constructor(opts: WsOptions = {}) {
    this.reconnectBaseMs = opts.reconnectBaseMs ?? 1000;
    this.maxReconnectMs = opts.maxReconnectMs ?? 30000;
  }

  public static getInstance(): AsterWebSocket {
    if (!AsterWebSocket.instance) {
      AsterWebSocket.instance = new AsterWebSocket();
    }
    return AsterWebSocket.instance;
  }

  private refCount = 0;

  public connect(): Promise<void> {
    this.refCount++;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      // Combined stream endpoint — payload always wrapped: { stream, data }
      const baseUrl = ASTER_WS_URL.replace('/ws', '/stream');
      const url = `${baseUrl}?streams=${ASTER_WS_STREAMS.TICKER}/${ASTER_WS_STREAMS.MARK_PRICE}`;
      const ws = new WebSocket(url);
      this.ws = ws;
      this.intentionalClose = false;
      let hasResolved = false;

      // Timeout to prevent hanging the entire UI if the WebSocket takes too long to connect
      // (e.g. silent drops by Cloudflare). We aggressively close the dead socket and reconnect.
      setTimeout(() => {
        if (!hasResolved) {
          console.warn('[AsterWebSocket] Connection timed out after 5s. Forcing reconnect...');
          hasResolved = true;
          resolve();
          if (this.ws === ws) {
            this.ws = null;
            ws.close();
            if (!this.intentionalClose) this.scheduleReconnect();
          }
        }
      }, 5000);

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.reconnectAttempt = 0;
        this.resubscribeAll();
        perpEventBus.emit(PerpEvent.CONNECTED);
        if (!hasResolved) {
          hasResolved = true;
          resolve();
        }
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        this.handleMessage(event);
      };

      ws.onclose = () => {
        if (!hasResolved) {
          hasResolved = true;
          resolve(); // Resolve anyway so we don't hang the UI initialization
        }
        if (this.ws === ws) {
          this.ws = null;
          if (!this.intentionalClose) this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        if (!hasResolved) {
          hasResolved = true;
          resolve(); // Resolve anyway so we don't hang the UI initialization
        }
      };
    });
  }

  public disconnect(): void {
    this.refCount--;
    if (this.refCount > 0) return; // Only close if no one is using it
    this.refCount = 0;

    this.intentionalClose = true;
    this.clearReconnect();
    this.ws?.close();
    this.ws = null;
    this.engines.forEach((engine) => engine.dispose());
    this.engines.clear();
    perpEventBus.emit(PerpEvent.DISCONNECTED);
  }

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Subscribe a handler to a specific stream name.
   * The WS SUBSCRIBE message is only sent on the first subscriber.
   */
  public subscribe(stream: string, handler: StreamHandler): void {
    if (!this.handlers.has(stream)) {
      this.handlers.set(stream, new Set());
    }
    const set = this.handlers.get(stream)!;
    const wasEmpty = set.size === 0;
    set.add(handler);

    if (wasEmpty) {
      this.activeStreams.add(stream);
      this.send({ method: 'SUBSCRIBE', params: [stream], id: this.msgId++ });
    }
  }

  /**
   * Unsubscribe a handler. WS UNSUBSCRIBE sent when last handler for that stream leaves.
   */
  public unsubscribe(stream: string, handler: StreamHandler): void {
    const set = this.handlers.get(stream);
    if (!set) return;

    set.delete(handler);

    if (set.size === 0) {
      this.handlers.delete(stream);
      this.activeStreams.delete(stream);
      this.send({ method: 'UNSUBSCRIBE', params: [stream], id: this.msgId++ });
    }
  }

  private resubscribeAll(): void {
    const streams = Array.from(this.activeStreams);
    if (streams.length > 0) {
      this.send({ method: 'SUBSCRIBE', params: streams, id: this.msgId++ });
    }
    // Re-run snapshot+sync for all active engines after reconnect
    this.engines.forEach((engine) => engine.dispose());
  }

  private handleMessage(event: MessageEvent): void {
    let raw: unknown;
    try {
      raw = JSON.parse(event.data as string);
    } catch {
      return;
    }

    if (!raw || typeof raw !== 'object') return;

    const msg = raw as Record<string, unknown>;

    // Subscription ACK
    if ('id' in msg && msg.result === null) return;

    const streamName = msg.stream as string | undefined;
    const data = msg.data;

    if (!streamName || data === undefined) return;

    // Dispatch to registered handlers first
    this.handlers.get(streamName)?.forEach((h) => h(data));

    this.dispatchBuiltIn(streamName, data);
  }

  private dispatchBuiltIn(stream: string, data: unknown): void {
    // Global ticker array
    if (stream === ASTER_WS_STREAMS.TICKER || stream === ASTER_WS_STREAMS.MARK_PRICE) {
      if (!Array.isArray(data)) return;
      this.handleGlobalArray(data as Record<string, unknown>[]);
      return;
    }

    const payload = data as Record<string, unknown>;
    const eventType = payload.e as string | undefined;

    if (!eventType) return;

    if (eventType === 'depthUpdate') {
      // Route to the correct OrderbookEngine by symbol
      const asterSymbol = (payload.s as string).toLowerCase();
      this.engines.get(asterSymbol)?.onDiffEvent(payload as any);
      return;
    }

    if (eventType === 'aggTrade') {
      const mapped = AsterMapper.mapTrade(payload);
      mapped.symbol = mapped.symbol.replace('USDT', '-USDT');
      tradeStore.addTrades(mapped.symbol, [mapped]);
      return;
    }

    if (eventType === 'kline') {
      const mapped = AsterMapper.mapLiveCandle(payload);
      perpEventBus.emit(PerpEvent.CANDLE_UPDATED, mapped);
      return;
    }

    if (eventType === 'markPriceUpdate') {
      const uiSymbol = (payload.s as string).replace('USDT', '-USDT');
      const markData = AsterMapper.mapMarkPrice(payload);
      const store = useTickerStore.getState();
      const existing = store.getAssetCtx(uiSymbol) || AsterMapper.mapTicker({});
      store.setAssetCtx(uiSymbol, { ...existing, ...markData });
      return;
    }

    if (eventType === '24hrTicker') {
      const mapped = AsterMapper.mapTicker(payload);
      const uiSymbol = (payload.s as string).replace('USDT', '-USDT');
      useTickerStore.getState().setAssetCtx(uiSymbol, mapped);
    }
  }

  private handleGlobalArray(items: Record<string, unknown>[]): void {
    const contexts: Record<string, Partial<import('../../core/stores/tickerStore').AssetCtx>> = {};

    for (const item of items) {
      const rawSymbol = item.s as string | undefined;
      if (!rawSymbol) continue;
      const uiSymbol = rawSymbol.replace('USDT', '-USDT');

      if (item.e === '24hrTicker') {
        contexts[uiSymbol] = { ...contexts[uiSymbol], ...AsterMapper.mapTicker(item) };
      } else if (item.e === 'markPriceUpdate') {
        contexts[uiSymbol] = { ...contexts[uiSymbol], ...AsterMapper.mapMarkPrice(item) };
      }
    }

    if (Object.keys(contexts).length === 0) return;

    const store = useTickerStore.getState();
    const merged: Record<string, import('../../core/stores/tickerStore').AssetCtx> = {};
    for (const [sym, partial] of Object.entries(contexts)) {
      const existing = store.getAssetCtx(sym) || AsterMapper.mapTicker({});
      merged[sym] = { ...existing, ...partial };
    }
    store.setMultipleAssetCtxs(merged);
  }

  // --- High-level subscription helpers called by AsterClient ---

  public subscribeOrderBook(coin: string): void {
    const asterSym = coin.toLowerCase() + 'usdt';

    if (!this.engines.has(asterSym)) {
      this.engines.set(asterSym, new OrderbookEngine(asterSym));
    }

    // Use a stable no-op — dispatchBuiltIn is the sole router to the engine.
    // Registering a second handler here would cause double onDiffEvent calls,
    // breaking the pu chain and triggering infinite restarts.
    const stream = `${asterSym}@depth`;
    this.subscribe(stream, this._noop);
  }

  public unsubscribeOrderBook(coin: string): void {
    const asterSym = coin.toLowerCase() + 'usdt';
    const stream = `${asterSym}@depth`;

    this.unsubscribe(stream, this._noop);
    this.engines.get(asterSym)?.dispose();
    this.engines.delete(asterSym);
  }

  public async subscribeTrades(coin: string): Promise<void> {
    this.subscribe(`${coin.toLowerCase()}usdt@aggTrade`, this._noop);
    
    // Fetch initial snapshot of trades
    try {
      const asterSymbol = `${coin.toUpperCase()}USDT`;
      const uiSymbol = `${coin.toUpperCase()}-USDT`;
      const trades = await getAggTrades(asterSymbol, 80);
      const mappedTrades = trades.map(AsterMapper.mapTrade).map(t => {
        t.symbol = uiSymbol;
        return t;
      });
      tradeStore.addTrades(uiSymbol, mappedTrades);
    } catch (e) {
      console.error('Failed to fetch initial aggTrades snapshot', e);
    }
  }

  public unsubscribeTrades(coin: string): void {
    this.unsubscribe(`${coin.toLowerCase()}usdt@aggTrade`, this._noop);
  }

  public subscribeCandles(coin: string, interval: string): void {
    this.subscribe(`${coin.toLowerCase()}usdt@kline_${interval}`, this._noop);
  }

  public unsubscribeCandles(coin: string, interval: string): void {
    this.unsubscribe(`${coin.toLowerCase()}usdt@kline_${interval}`, this._noop);
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    const delay = Math.min(
      this.reconnectBaseMs * Math.pow(2, this.reconnectAttempt),
      this.maxReconnectMs
    );
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
