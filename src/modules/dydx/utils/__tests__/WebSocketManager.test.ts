import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { webSocketManager } from '../WebSocketManager';

class MockWebSocket {
  url: string;
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.lastInstance = this;
  }

  static lastInstance: MockWebSocket | null = null;
}

(MockWebSocket as any).prototype.CONNECTING = MockWebSocket.CONNECTING;
(MockWebSocket as any).prototype.OPEN = MockWebSocket.OPEN;
(MockWebSocket as any).prototype.CLOSING = MockWebSocket.CLOSING;
(MockWebSocket as any).prototype.CLOSED = MockWebSocket.CLOSED;

describe('WebSocketManager', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
    // Reset singleton state via shutdown
    webSocketManager.shutdown();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('manages singleton instance correctly', () => {
    expect(webSocketManager).toBeDefined();
  });

  it('establishes connection and handles onopen/onclose callbacks', async () => {
    const connectPromise = webSocketManager.connect('wss://example.com');
    const wsInstance = MockWebSocket.lastInstance;
    expect(wsInstance).toBeDefined();
    expect(webSocketManager.getConnectionStatus()).toBe('connecting');

    // Simulate open
    wsInstance!.readyState = MockWebSocket.OPEN;
    wsInstance!.onopen?.();

    await connectPromise;
    expect(webSocketManager.getConnectionStatus()).toBe('connected');
    expect(webSocketManager.isConnected()).toBe(true);

    // Simulate close
    wsInstance!.readyState = MockWebSocket.CLOSED;
    wsInstance!.onclose?.({ code: 1000 } as any);
    expect(webSocketManager.getConnectionStatus()).toBe('disconnected');
  });

  it('queues subscriptions and flushes them when connected', async () => {
    const handler = vi.fn();
    const unsubscribe = webSocketManager.subscribe('v4_trades', handler, 'BTC-USD');

    // Subscription should be queued
    expect(webSocketManager.getDebugInfo().pendingSubscriptions).toContain('v4_trades_BTC-USD');

    // Connect
    const connectPromise = webSocketManager.connect('wss://example.com');
    const wsInstance = MockWebSocket.lastInstance!;
    wsInstance.readyState = MockWebSocket.OPEN;
    wsInstance.onopen?.();
    await connectPromise;

    // Flush timers to execute queue
    vi.advanceTimersByTime(200);

    expect(wsInstance.send).toHaveBeenCalled();
    const sentMsg = JSON.parse(wsInstance.send.mock.calls[0][0]);
    expect(sentMsg).toEqual({
      type: 'subscribe',
      channel: 'v4_trades',
      id: 'BTC-USD',
      batched: false,
    });

    // Simulate subscribe confirm from server
    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'subscribed',
        channel: 'v4_trades',
        id: 'BTC-USD',
      }),
    } as any);

    expect(webSocketManager.getDebugInfo().serverSubscriptions).toContain('v4_trades_BTC-USD');

    // Clean up
    unsubscribe();
  });

  it('processes incoming channel data messages and triggers handlers', async () => {
    const handler = vi.fn();
    webSocketManager.subscribe('v4_trades', handler, 'BTC-USD');

    const connectPromise = webSocketManager.connect('wss://example.com');
    const wsInstance = MockWebSocket.lastInstance!;
    wsInstance.readyState = MockWebSocket.OPEN;
    wsInstance.onopen?.();
    await connectPromise;

    // Confirm subscription
    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'subscribed',
        channel: 'v4_trades',
        id: 'BTC-USD',
      }),
    } as any);

    // Send data message
    const tradeMessage = {
      type: 'channel_data',
      channel: 'v4_trades',
      id: 'BTC-USD',
      contents: { price: '30000', size: '1' },
    };

    wsInstance.onmessage?.({
      data: JSON.stringify(tradeMessage),
    } as any);

    // Drainage executes in queueMicrotask (since v4_trades is high priority)
    await vi.runAllTicks();
    expect(handler).toHaveBeenCalledWith(tradeMessage);
  });
});
