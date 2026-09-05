import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchApiResponseFromServer } from '../../../../service/apiService';
import type { AlchemyBuyOrderRequest, AlchemySellOrderRequest } from '../../types/alchemyTypes';
import { createAlchemyBuyOrder, validateBuyOrderRequest } from '../alchemyBuyService';
import { createAlchemySellOrder, validateSellOrderRequest } from '../alchemySellService';

vi.mock('../../../../service/apiService', () => ({
  fetchApiResponseFromServer: vi.fn(),
}));

describe('alchemyOrderService (Buy & Sell)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Buy Orders', () => {
    const validBuyOrder: AlchemyBuyOrderRequest = {
      side: 'BUY',
      amount: '150.00',
      fiatCurrency: 'USD',
      cryptoCurrency: 'ETH',
      address: '0x1234567890abcdef1234567890abcdef12345678',
      network: 'ETH',
      alpha2: 'US',
      payWayCode: '1001',
      orderType: 'C',
      depositType: 1,
    };

    it('validates a complete and correct buy order request', () => {
      const result = validateBuyOrderRequest(validBuyOrder);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects order if side is not BUY', () => {
      const result = validateBuyOrderRequest({ ...validBuyOrder, side: 'SELL' as any });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Side must be BUY for buy orders');
    });

    it('rejects order if amount is missing, zero, or negative', () => {
      expect(validateBuyOrderRequest({ ...validBuyOrder, amount: '' }).errors).toContain(
        'Amount is required'
      );
      expect(validateBuyOrderRequest({ ...validBuyOrder, amount: '0' }).errors).toContain(
        'Amount must be a positive number'
      );
      expect(validateBuyOrderRequest({ ...validBuyOrder, amount: '-50' }).errors).toContain(
        'Amount must be a positive number'
      );
    });

    it('validates required string fields (fiat, crypto, address, network, alpha2, payWayCode, orderType)', () => {
      const invalidOrder: AlchemyBuyOrderRequest = {
        side: 'BUY',
        amount: '100',
        fiatCurrency: '',
        cryptoCurrency: '',
        address: '',
        network: '',
        alpha2: '',
        payWayCode: '',
        orderType: '',
        depositType: 1,
      };

      const result = validateBuyOrderRequest(invalidOrder);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Fiat currency is required');
      expect(result.errors).toContain('Crypto currency is required');
      expect(result.errors).toContain('Wallet address is required');
      expect(result.errors).toContain('Network is required');
      expect(result.errors).toContain('Country code (alpha2) is required');
      expect(result.errors).toContain('Payment method code is required');
      expect(result.errors).toContain('Order type is required');
    });

    it('validates depositType must be a number', () => {
      const result = validateBuyOrderRequest({
        ...validBuyOrder,
        depositType: '1' as any,
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Deposit type must be a number');
    });

    it('creates buy order successfully when server responds with data', async () => {
      const mockResponse = {
        data: {
          orderNo: 'BUY_12345',
          payUrl: 'https://ramp.alchemypay.org?order=12345',
        },
      };

      vi.mocked(fetchApiResponseFromServer).mockResolvedValue(mockResponse as any);

      const result = await createAlchemyBuyOrder(validBuyOrder);

      expect(fetchApiResponseFromServer).toHaveBeenCalledWith(
        '/alchemy/create-buy-order',
        'POST',
        validBuyOrder
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('throws error when createAlchemyBuyOrder receives empty response data', async () => {
      vi.mocked(fetchApiResponseFromServer).mockResolvedValue({ data: null } as any);

      await expect(createAlchemyBuyOrder(validBuyOrder)).rejects.toThrow(
        'No order data received from Alchemy Pay'
      );
    });
  });

  describe('Sell Orders', () => {
    const validSellOrder: AlchemySellOrderRequest = {
      cryptoAmount: '0.5',
      fiat: 'EUR',
      crypto: 'BTC',
      network: 'BTC',
      country: 'DE',
    };

    it('validates a complete and correct sell order request', () => {
      const result = validateSellOrderRequest(validSellOrder);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects order if cryptoAmount is missing, non-numeric, zero, or negative', () => {
      expect(validateSellOrderRequest({ ...validSellOrder, cryptoAmount: '' }).errors).toContain(
        'Crypto amount is required'
      );
      expect(
        validateSellOrderRequest({ ...validSellOrder, cryptoAmount: 'not_number' }).errors
      ).toContain('Crypto amount must be a positive number');
      expect(validateSellOrderRequest({ ...validSellOrder, cryptoAmount: '0' }).errors).toContain(
        'Crypto amount must be a positive number'
      );
      expect(
        validateSellOrderRequest({ ...validSellOrder, cryptoAmount: '-0.1' }).errors
      ).toContain('Crypto amount must be a positive number');
    });

    it('validates required fields for sell order', () => {
      const invalidOrder: AlchemySellOrderRequest = {
        cryptoAmount: '1.0',
        fiat: '',
        crypto: '',
        network: '',
        country: '',
      };

      const result = validateSellOrderRequest(invalidOrder);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Fiat currency is required');
      expect(result.errors).toContain('Crypto currency is required');
      expect(result.errors).toContain('Network is required');
      expect(result.errors).toContain('Country is required');
    });

    it('creates sell order successfully when server responds with data', async () => {
      const mockResponse = {
        data: {
          orderNo: 'SELL_98765',
          depositAddress: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
        },
      };

      vi.mocked(fetchApiResponseFromServer).mockResolvedValue(mockResponse as any);

      const result = await createAlchemySellOrder(validSellOrder);

      expect(fetchApiResponseFromServer).toHaveBeenCalledWith(
        '/alchemy/create-sell-order',
        'POST',
        validSellOrder
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('throws error when createAlchemySellOrder receives empty response data', async () => {
      vi.mocked(fetchApiResponseFromServer).mockResolvedValue({ data: null } as any);

      await expect(createAlchemySellOrder(validSellOrder)).rejects.toThrow(
        'No order data received from Alchemy Pay'
      );
    });
  });
});
