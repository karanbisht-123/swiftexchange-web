import { describe, expect, it } from 'vitest';

import { formatAssetName, formatTxAmount, getDisplayAmountWithSign } from '../formatAmount';

describe('formatAmount utils', () => {
  describe('formatTxAmount', () => {
    it('returns "—" for erc721 and erc1155 NFT categories', () => {
      expect(formatTxAmount({ category: 'erc721' } as any)).toBe('—');
      expect(formatTxAmount({ category: 'erc1155' } as any)).toBe('—');
    });

    it('formats formattedAmount < 0.000001 as "< 0.000001"', () => {
      const result = formatTxAmount({ formattedAmount: '0.0000004' } as any);
      expect(result).toBe('< 0.000001');
    });

    it('formats small formattedAmount < 0.0001 with trailing zeros stripped up to 6 decimals', () => {
      const result = formatTxAmount({ formattedAmount: '0.000050' } as any);
      expect(result).toBe('0.00005');
    });

    it('formats standard formattedAmount with 6 decimals', () => {
      const result = formatTxAmount({ formattedAmount: '1.25' } as any);
      expect(result).toBe('1.250000');
    });

    it('falls back to rawContract value and decimal parsing when formattedAmount is not provided', () => {
      const tx = {
        category: 'erc20',
        rawContract: {
          value: '1000000', // 1 USDC (6 decimals)
          decimal: '6',
        },
      } as any;

      const result = formatTxAmount(tx);
      expect(result).toBe('1');
    });

    it('returns "< 0.000001" for sub-micro rawContract values', () => {
      const tx = {
        category: 'erc20',
        rawContract: {
          value: '1', // 1 wei with 18 decimals
          decimal: '18',
        },
      } as any;

      const result = formatTxAmount(tx);
      expect(result).toBe('< 0.000001');
    });

    it('falls back to tx.value when formattedAmount and rawContract are absent', () => {
      expect(formatTxAmount({ value: '2.5' } as any)).toBe('2.5');
      expect(formatTxAmount({ value: '0.0000001' } as any)).toBe('< 0.000001');
    });

    it('returns "—" when no valid numeric amounts exist', () => {
      expect(formatTxAmount({} as any)).toBe('—');
      expect(formatTxAmount({ formattedAmount: null, value: null } as any)).toBe('—');
    });
  });

  describe('formatAssetName', () => {
    it('returns the asset symbol when present', () => {
      expect(formatAssetName({ asset: 'USDC' } as any)).toBe('USDC');
      expect(formatAssetName({ asset: 'ETH' } as any)).toBe('ETH');
    });

    it('returns "Asset" for NFT categories without symbol', () => {
      expect(formatAssetName({ category: 'erc721' } as any)).toBe('Asset');
      expect(formatAssetName({ category: 'erc1155' } as any)).toBe('Asset');
    });

    it('returns "—" when no asset and standard category', () => {
      expect(formatAssetName({ category: 'erc20' } as any)).toBe('—');
    });
  });

  describe('getDisplayAmountWithSign', () => {
    it('returns "—" when formatted amount is "—"', () => {
      expect(getDisplayAmountWithSign('—', true, false)).toBe('—');
      expect(getDisplayAmountWithSign('—', false, false)).toBe('—');
    });

    it('returns unsigned amount for self transactions', () => {
      expect(getDisplayAmountWithSign('1.5', true, true)).toBe('1.5');
      expect(getDisplayAmountWithSign('1.5', false, true)).toBe('1.5');
    });

    it('prepends "+" for incoming transactions', () => {
      expect(getDisplayAmountWithSign('5.0', true, false)).toBe('+5.0');
    });

    it('prepends "-" for outgoing transactions', () => {
      expect(getDisplayAmountWithSign('5.0', false, false)).toBe('-5.0');
    });

    it('correctly handles "< 0.000001" amounts with signs', () => {
      expect(getDisplayAmountWithSign('< 0.000001', true, false)).toBe('+ < 0.000001');
      expect(getDisplayAmountWithSign('< 0.000001', false, false)).toBe('- < 0.000001');
    });
  });
});
