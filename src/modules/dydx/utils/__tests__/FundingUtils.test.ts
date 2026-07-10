import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchDydxServerTime,
  fetchNextFundingTimeForMarket,
  formatAnnualizedFundingRate,
  formatFundingCountdown,
  formatFundingRate,
  getNextFundingTimestamp,
} from '../FundingUtils';

vi.mock('@dydxprotocol/v4-client-js', () => {
  class MockCompositeClient {
    static connect = vi.fn().mockResolvedValue({ validatorClient: {} });
  }
  class MockIndexerClient {}
  class MockValidatorClient {}
  class MockValidatorConfig {}

  return {
    CompositeClient: MockCompositeClient,
    IndexerClient: MockIndexerClient,
    ValidatorClient: MockValidatorClient,
    ValidatorConfig: MockValidatorConfig,
    Network: {
      mainnet: vi.fn(() => ({ indexerConfig: { websocketEndpoint: '' }, validatorConfig: {} })),
      testnet: vi.fn(() => ({ indexerConfig: { websocketEndpoint: '' }, validatorConfig: {} })),
    },
    tradingKeyUtils: {
      createNewRandomDydxWallet: vi.fn(),
      getAuthorizeNewTradingKeyArguments: vi.fn(),
    },
  };
});

const mockGetTime = vi.fn();
const mockGetHistoricalFunding = vi.fn();

vi.mock('../../client/clients', () => ({
  getIndexerClient: () => ({
    utility: {
      getTime: mockGetTime,
    },
    markets: {
      getPerpetualMarketHistoricalFunding: mockGetHistoricalFunding,
    },
  }),
}));

describe('FundingUtils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatFundingRate & formatAnnualizedFundingRate', () => {
    it('formats rates correctly', () => {
      expect(formatFundingRate(0.000123)).toBe('+0.01230%');
      expect(formatFundingRate(-0.000123)).toBe('-0.01230%');
      expect(formatFundingRate('invalid')).toBe('0.00000%');

      expect(formatAnnualizedFundingRate(0.00001)).toBe('+8.76%'); // 0.00001 * 100 * 24 * 365 = 8.76
      expect(formatAnnualizedFundingRate('invalid')).toBe('0.00%');
    });
  });

  describe('fetchDydxServerTime', () => {
    it('fetches server time successfully from indexerClient', async () => {
      mockGetTime.mockResolvedValue({ iso: '2026-07-09T12:00:00Z' });
      const time = await fetchDydxServerTime();
      expect(time).toBe(new Date('2026-07-09T12:00:00Z').getTime());
    });

    it('falls back to fetch if indexerClient fails', async () => {
      mockGetTime.mockResolvedValue(null);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          json: async () => ({ iso: '2026-07-09T12:30:00Z' }),
        })
      );

      const time = await fetchDydxServerTime();
      expect(time).toBe(new Date('2026-07-09T12:30:00Z').getTime());
    });
  });

  describe('getNextFundingTimestamp', () => {
    it('calculates the next funding timestamp correctly', () => {
      // 12:15 -> next funding is 12:30
      const serverTimeMs = new Date('2026-07-09T12:15:00Z').getTime();
      const expected = new Date('2026-07-09T12:30:00Z').getTime();
      expect(getNextFundingTimestamp(serverTimeMs)).toBe(expected);
    });
  });

  describe('formatFundingCountdown', () => {
    it('returns 00:00 if countdown has expired', () => {
      expect(formatFundingCountdown(1000, 2000)).toBe('00:00');
    });

    it('returns formatted countdown mm:ss', () => {
      const target = 10000;
      const server = 2000; // 8 seconds diff
      expect(formatFundingCountdown(target, server)).toBe('00:08');
    });
  });

  describe('fetchNextFundingTimeForMarket', () => {
    it('returns next funding time based on last historical funding and server time', async () => {
      mockGetTime.mockResolvedValue({ iso: '2026-07-09T12:15:00Z' });
      mockGetHistoricalFunding.mockResolvedValue({
        historicalFunding: [{ effectiveAt: '2026-07-09T11:30:00Z' }],
      });

      const nextTime = await fetchNextFundingTimeForMarket('BTC-USD');
      expect(nextTime).toBe(new Date('2026-07-09T12:30:00Z').getTime());
    });
  });
});
