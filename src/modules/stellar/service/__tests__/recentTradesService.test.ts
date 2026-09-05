import { Asset } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecentTradesService } from '../recentTradesService';

const mockCall = vi.fn();
const mockStream = vi.fn();

const mockTradesChain = {
  forAssetPair: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  cursor: vi.fn().mockReturnThis(),
  call: mockCall,
  stream: mockStream,
};

vi.mock('@stellar/stellar-sdk', () => {
  class MockAsset {
    code: string;
    issuer: string;
    constructor(code: string, issuer: string) {
      this.code = code;
      this.issuer = issuer;
    }
    static native() {
      return new MockAsset('XLM', '');
    }
  }

  class MockServer {
    trades = vi.fn(() => mockTradesChain);
  }

  return {
    Asset: MockAsset,
    Horizon: {
      Server: MockServer,
    },
  };
});

describe('RecentTradesService', () => {
  let service: RecentTradesService;
  const baseAsset = Asset.native();
  const counterAsset = new Asset('USDC', 'GIssuer123');

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RecentTradesService(
      'https://horizon-testnet.stellar.org',
      'Test SDF Network ; September 2015',
      'testnet'
    );
  });

  describe('getRecentTrades', () => {
    it('fetches and maps trade records with calculated prices and buy flags', async () => {
      mockCall.mockResolvedValue({
        records: [
          {
            id: 'trade_1',
            ledger_close_time: '2026-09-05T12:00:00Z',
            price: { n: '12', d: '100' }, // 0.12
            base_amount: '100.5',
            base_is_seller: false, // buyer is base -> isBuy = true
          },
          {
            id: 'trade_2',
            ledger_close_time: '2026-09-05T12:01:00Z',
            price: { n: '25', d: '100' }, // 0.25
            base_amount: '50.0',
            base_is_seller: true, // seller is base -> isBuy = false
          },
        ],
      });

      const trades = await service.getRecentTrades(baseAsset, counterAsset, 10);

      expect(mockTradesChain.forAssetPair).toHaveBeenCalledWith(baseAsset, counterAsset);
      expect(mockTradesChain.order).toHaveBeenCalledWith('desc');
      expect(mockTradesChain.limit).toHaveBeenCalledWith(10);
      expect(trades).toHaveLength(2);

      expect(trades[0]).toEqual({
        id: 'trade_1',
        time: '2026-09-05T12:00:00Z',
        price: '0.1200000',
        amount: '100.5',
        isBuy: true,
      });

      expect(trades[1]).toEqual({
        id: 'trade_2',
        time: '2026-09-05T12:01:00Z',
        price: '0.2500000',
        amount: '50.0',
        isBuy: false,
      });
    });

    it('safely handles zero denominator or NaN in trade price fraction', async () => {
      mockCall.mockResolvedValue({
        records: [
          {
            id: 'trade_invalid_denom',
            ledger_close_time: '2026-09-05T12:00:00Z',
            price: { n: '10', d: '0' },
            base_amount: '10.0',
            base_is_seller: false,
          },
          {
            id: 'trade_nan',
            ledger_close_time: '2026-09-05T12:00:00Z',
            price: { n: 'invalid', d: '10' },
            base_amount: '10.0',
            base_is_seller: false,
          },
        ],
      });

      const trades = await service.getRecentTrades(baseAsset, counterAsset);

      expect(trades[0].price).toBe('0.0000000');
      expect(trades[1].price).toBe('0.0000000');
    });

    it('re-throws error when Horizon call fails', async () => {
      mockCall.mockRejectedValue(new Error('Horizon connection timed out'));

      await expect(service.getRecentTrades(baseAsset, counterAsset)).rejects.toThrow(
        'Horizon connection timed out'
      );
    });
  });

  describe('streamRecentTrades', () => {
    it('subscribes to stream and triggers onUpdate on incoming records', () => {
      let streamCallbacks: any;
      const mockClose = vi.fn();

      mockStream.mockImplementation((handlers: any) => {
        streamCallbacks = handlers;
        return mockClose;
      });

      const onUpdate = vi.fn();
      const onError = vi.fn();

      const unsubscribe = service.streamRecentTrades(baseAsset, counterAsset, onUpdate, onError);

      expect(mockTradesChain.cursor).toHaveBeenCalledWith('now');
      expect(streamCallbacks).toBeDefined();

      // Simulate incoming message
      streamCallbacks.onmessage({
        id: 'stream_1',
        ledger_close_time: '2026-09-05T12:10:00Z',
        price: { n: '1', d: '2' },
        base_amount: '75.0',
        base_is_seller: false,
      });

      expect(onUpdate).toHaveBeenCalledWith({
        id: 'stream_1',
        time: '2026-09-05T12:10:00Z',
        price: '0.5000000',
        amount: '75.0',
        isBuy: true,
      });

      // Teardown
      unsubscribe();
      expect(mockClose).toHaveBeenCalled();
    });

    it('handles stream error and triggers onError after max retries', () => {
      vi.useFakeTimers();
      let streamCallbacks: any;

      mockStream.mockImplementation((handlers: any) => {
        streamCallbacks = handlers;
        return vi.fn();
      });

      const onUpdate = vi.fn();
      const onError = vi.fn();

      service.streamRecentTrades(baseAsset, counterAsset, onUpdate, onError);

      const err = new Error('Stream disconnect');

      // Trigger 1st retry
      streamCallbacks.onerror(err);
      vi.advanceTimersByTime(5000);

      // Trigger 2nd retry
      streamCallbacks.onerror(err);
      vi.advanceTimersByTime(5000);

      // Trigger 3rd retry
      streamCallbacks.onerror(err);
      vi.advanceTimersByTime(5000);

      // Trigger 4th (exceeds max retries = 3)
      streamCallbacks.onerror(err);

      expect(onError).toHaveBeenCalledWith(err);

      vi.useRealTimers();
    });
  });
});
