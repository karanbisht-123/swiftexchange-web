import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStellarOrderbookStore } from '../stellarOrderbookStore';

describe('stellarOrderbookStore', () => {
  beforeEach(() => {
    useStellarOrderbookStore.setState({
      orderbook: null,
      isStreaming: false,
      lastUpdate: null,
      error: null,
      streamCloseFunction: null,
    });
  });

  const mockOrderbook = {
    bids: [{ price: '1.0', amount: '100' }],
    asks: [{ price: '1.1', amount: '50' }],
  };

  describe('actions', () => {
    it('sets orderbook and updates lastUpdate', () => {
      const store = useStellarOrderbookStore.getState();
      store.setOrderbook(mockOrderbook);

      const state = useStellarOrderbookStore.getState();
      expect(state.orderbook).toEqual(mockOrderbook);
      expect(state.lastUpdate).toBeGreaterThan(0);
      expect(state.error).toBeNull();
    });

    it('sets streaming state correctly', () => {
      const store = useStellarOrderbookStore.getState();
      store.setStreaming(true);

      expect(useStellarOrderbookStore.getState().isStreaming).toBe(true);
    });

    it('sets error and resets streaming state', () => {
      const store = useStellarOrderbookStore.getState();
      store.setStreaming(true);
      store.setError('Failed stream');

      const state = useStellarOrderbookStore.getState();
      expect(state.error).toBe('Failed stream');
      expect(state.isStreaming).toBe(false);
    });

    it('sets streamCloseFunction correctly', () => {
      const closeFn = vi.fn();
      const store = useStellarOrderbookStore.getState();
      store.setStreamCloseFunction(closeFn);

      expect(useStellarOrderbookStore.getState().streamCloseFunction).toBe(closeFn);
    });

    it('resets state to initial values', () => {
      const closeFn = vi.fn();
      useStellarOrderbookStore.setState({
        orderbook: mockOrderbook,
        isStreaming: true,
        lastUpdate: 123456,
        error: 'err',
        streamCloseFunction: closeFn,
      });

      const store = useStellarOrderbookStore.getState();
      store.reset();

      const state = useStellarOrderbookStore.getState();
      expect(state.orderbook).toBeNull();
      expect(state.isStreaming).toBe(false);
      expect(state.lastUpdate).toBeNull();
      expect(state.error).toBeNull();
      expect(state.streamCloseFunction).toBeNull();
    });
  });
});
