import { orderBookStore } from '../../core/stores/orderbookStore';
import { ASTER_REST_URL, ASTER_ENDPOINTS } from './constants';

interface DiffEvent {
  U: number; // First update ID in event
  u: number; // Final update ID in event
  pu: number; // Final update ID in last event (pu continuity chain)
  b: [string, string][]; // Bids: [price, size]
  a: [string, string][]; // Asks: [price, size]
}

type EngineState = 'idle' | 'buffering' | 'synced' | 'error';

export class OrderbookEngine {
  private symbol: string;   // Aster REST symbol, e.g. "BTCUSDT"
  private uiSymbol: string; // UI symbol, e.g. "BTC-USDT"

  private state: EngineState = 'idle';
  private buffer: DiffEvent[] = [];
  private lastAppliedU = -1;

  private rafHandle: number | null = null;
  private hasPendingFlush = false;

  constructor(asterSymbol: string) {
    this.symbol = asterSymbol.toUpperCase();
    this.uiSymbol = this.symbol.replace('USDT', '-USDT');
  }

  /**
   * Called by the WS client when a `@depth` diff event arrives.
   * Must be called regardless of sync state — buffering happens here.
   */
  public onDiffEvent(raw: DiffEvent): void {
    if (this.state === 'idle') {
      this.state = 'buffering';
      this.fetchSnapshot();
    }

    if (this.state === 'buffering') {
      this.buffer.push(raw);
      return;
    }

    if (this.state === 'synced') {
      this.applyDiff(raw);
    }
  }

  private async fetchSnapshot(): Promise<void> {
    try {
      const res = await fetch(
        `${ASTER_REST_URL}${ASTER_ENDPOINTS.DEPTH}?symbol=${this.symbol}&limit=1000`
      );
      const snap = await res.json();
      this.applySnapshot(snap);
    } catch {
      // If snapshot fetch fails or snapshot is invalid (e.g. rate limit error)
      // Enter 'error' state so we don't instantly fetch again on the next WS event.
      this.state = 'error';
      this.buffer = [];
      // Wait 2 seconds before allowing another snapshot attempt
      setTimeout(() => {
        if (this.state === 'error') this.state = 'idle';
      }, 2000);
    }
  }

  private applySnapshot(snap: { lastUpdateId: number; bids: [string, string][]; asks: [string, string][]; _retryCount?: number }): void {
    const { lastUpdateId } = snap;

    if (!snap.bids || !snap.asks) {
      throw new Error('Invalid snapshot data received');
    }

    // Discard stale buffered events
    const validBuffer = this.buffer.filter((e) => e.u >= lastUpdateId);

    // Find first valid event: U <= lastUpdateId AND u >= lastUpdateId
    // (Aster sometimes has gaps between pu and U, so we also check pu <= lastUpdateId)
    const firstIdx = validBuffer.findIndex(
      (e) => (e.U <= lastUpdateId || e.pu <= lastUpdateId) && e.u >= lastUpdateId
    );

    if (firstIdx === -1) {
      if (this.buffer.length > 0 && lastUpdateId < this.buffer[0].U) {
        // The snapshot from the REST API is older than the oldest event in our WebSocket buffer.
        // This happens when the exchange caches the REST API.
        // Do NOT clear the buffer. Just fetch the snapshot again in 1s.
        setTimeout(() => this.fetchSnapshot(), 1000);
        return;
      }

      // Snapshot might be NEWER than the buffer (WebSocket is lagging behind REST API).
      // Wait 100ms for more WebSocket events to arrive, then try applying this same snapshot again.
      if (this.buffer.length === 0 || lastUpdateId > this.buffer[this.buffer.length - 1].u) {
        if (!snap._retryCount) snap._retryCount = 0;
        if (snap._retryCount < 20) { // Max 2 seconds of waiting for WS to catch up
          snap._retryCount++;
          setTimeout(() => this.applySnapshot(snap), 100);
          return;
        }
      }

      // No valid starting event in buffer for other reasons (e.g. dropped packets)
      // Restart after a delay to avoid spamming
      this.state = 'error';
      this.buffer = [];
      setTimeout(() => {
        if (this.state === 'error') this.state = 'idle';
      }, 2000);
      return;
    }

    orderBookStore.applySnapshot(
      this.uiSymbol,
      snap.bids.map(([price, size]) => ({ price, size })),
      snap.asks.map(([price, size]) => ({ price, size })),
      lastUpdateId
    );

    this.state = 'synced';

    // Drain buffered diffs in order
    // Note: this.lastAppliedU is -1 here, so the first applyDiff skips the pu check.
    // This is correct per Aster/Binance specs: the first diff's pu might not equal lastUpdateId.
    for (let i = firstIdx; i < validBuffer.length; i++) {
      this.applyDiff(validBuffer[i]);
    }

    this.buffer = [];
    this.scheduleFlush();
  }

  private applyDiff(event: DiffEvent): void {
    // pu chain integrity check — break means we are desynced, must fully restart
    if (this.lastAppliedU !== -1 && event.pu !== this.lastAppliedU) {
      this.restart();
      return;
    }

    orderBookStore.applyDiff(
      this.uiSymbol,
      event.b.map(([price, size]) => ({ price, size })),
      event.a.map(([price, size]) => ({ price, size })),
      event.u
    );

    this.lastAppliedU = event.u;
    this.scheduleFlush();
  }

  /** Coalesce renders: only flush Map→sorted array once per animation frame */
  private scheduleFlush(): void {
    if (this.hasPendingFlush) return;
    this.hasPendingFlush = true;
    this.rafHandle = requestAnimationFrame(() => {
      orderBookStore.flushToState(this.uiSymbol);
      this.hasPendingFlush = false;
      this.rafHandle = null;
    });
  }

  /** Full restart: discard all state, re-buffer on next incoming diff */
  private restart(): void {
    this.state = 'idle';
    this.buffer = [];
    this.lastAppliedU = -1;
    orderBookStore.resetBook(this.uiSymbol);
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
      this.hasPendingFlush = false;
    }
  }

  public dispose(): void {
    this.restart();
  }
}
