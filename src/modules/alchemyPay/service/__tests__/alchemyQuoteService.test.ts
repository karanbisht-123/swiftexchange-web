import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchApiResponseFromServer } from '../../../../service/apiService';
import type { AlchemyQuoteRequest } from '../../types/alchemyTypes';
import { fetchAlchemyQuote, validateQuoteRequest } from '../alchemyQuoteService';

vi.mock('../../../../service/apiService', () => ({
  fetchApiResponseFromServer: vi.fn(),
}));

describe('alchemyQuoteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateQuoteRequest', () => {
    const validRequest: AlchemyQuoteRequest = {
      crypto: 'USDT',
      network: 'ETH',
      fiat: 'USD',
      amount: '100',
      side: 'BUY',
    };

    it('validates a correct BUY quote request', () => {
      const result = validateQuoteRequest(validRequest);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('validates a correct SELL quote request', () => {
      const result = validateQuoteRequest({ ...validRequest, side: 'SELL' });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails validation when cryptocurrency is missing or whitespace', () => {
      const result = validateQuoteRequest({ ...validRequest, crypto: '   ' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Cryptocurrency is required');
    });

    it('fails validation when network is missing', () => {
      const result = validateQuoteRequest({ ...validRequest, network: '' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Network is required');
    });

    it('fails validation when fiat currency is missing', () => {
      const result = validateQuoteRequest({ ...validRequest, fiat: '' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Fiat currency is required');
    });

    it('fails validation when amount is missing or whitespace', () => {
      const result = validateQuoteRequest({ ...validRequest, amount: '   ' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Amount is required');
    });

    it('fails validation when amount is non-numeric', () => {
      const result = validateQuoteRequest({ ...validRequest, amount: 'abc' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Amount must be a positive number');
    });

    it('fails validation when amount is zero or negative', () => {
      const zeroResult = validateQuoteRequest({ ...validRequest, amount: '0' });
      expect(zeroResult.isValid).toBe(false);
      expect(zeroResult.errors).toContain('Amount must be a positive number');

      const negResult = validateQuoteRequest({ ...validRequest, amount: '-25.5' });
      expect(negResult.isValid).toBe(false);
      expect(negResult.errors).toContain('Amount must be a positive number');
    });

    it('fails validation when side is neither BUY nor SELL', () => {
      const result = validateQuoteRequest({ ...validRequest, side: 'SWAP' as any });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Side must be either BUY or SELL');
    });

    it('collects multiple validation errors simultaneously', () => {
      const result = validateQuoteRequest({
        crypto: '',
        network: '',
        fiat: '',
        amount: '-10',
        side: 'INVALID' as any,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(5);
    });
  });

  describe('fetchAlchemyQuote', () => {
    const sampleQuoteRequest: AlchemyQuoteRequest = {
      crypto: 'USDT',
      network: 'ETH',
      fiat: 'USD',
      amount: '200',
      side: 'BUY',
    };

    it('fetches and returns quote data on successful API response', async () => {
      const mockApiResponse = {
        data: {
          success: true,
          data: {
            cryptoAmount: '198.5',
            fiatAmount: '200',
            rampFee: '1.5',
          },
        },
      };

      vi.mocked(fetchApiResponseFromServer).mockResolvedValue(mockApiResponse as any);

      const result = await fetchAlchemyQuote(sampleQuoteRequest);

      expect(fetchApiResponseFromServer).toHaveBeenCalledWith(
        '/alchemy/fetch-quotes',
        'POST',
        sampleQuoteRequest
      );
      expect(result).toEqual(mockApiResponse.data);
    });

    it('throws error when no response data is received from server', async () => {
      vi.mocked(fetchApiResponseFromServer).mockResolvedValue({ data: null } as any);

      await expect(fetchAlchemyQuote(sampleQuoteRequest)).rejects.toThrow(
        'No quote data received from Alchemy Pay'
      );
    });

    it('extracts and throws returnMsg when API response success is false with string payload', async () => {
      vi.mocked(fetchApiResponseFromServer).mockResolvedValue({
        data: {
          success: false,
          data: JSON.stringify({ returnMsg: 'Daily limit exceeded' }),
        },
      } as any);

      await expect(fetchAlchemyQuote(sampleQuoteRequest)).rejects.toThrow('Daily limit exceeded');
    });

    it('extracts and throws returnMsg when API response success is false with object payload', async () => {
      vi.mocked(fetchApiResponseFromServer).mockResolvedValue({
        data: {
          success: false,
          data: { returnMsg: 'Unsupported currency pair' },
        },
      } as any);

      await expect(fetchAlchemyQuote(sampleQuoteRequest)).rejects.toThrow(
        'Unsupported currency pair'
      );
    });

    it('throws generic Quote request failed when success is false without specific returnMsg', async () => {
      vi.mocked(fetchApiResponseFromServer).mockResolvedValue({
        data: {
          success: false,
          data: null,
        },
      } as any);

      await expect(fetchAlchemyQuote(sampleQuoteRequest)).rejects.toThrow('Quote request failed');
    });

    it('propagates network or unexpected server errors', async () => {
      vi.mocked(fetchApiResponseFromServer).mockRejectedValue(
        new Error('Network connection error')
      );

      await expect(fetchAlchemyQuote(sampleQuoteRequest)).rejects.toThrow(
        'Network connection error'
      );
    });
  });
});
