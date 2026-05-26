import { formatMarketPrice, formatNumericWithCommas } from '../../dydx/utils/BigNumberUtils';
import { type Asset } from '../store/portfolioStore';
import BigNumber from 'bignumber.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

export const portfolioUtils = {
  calculateTotalUSD(assets: Asset[]): number {
    return assets.reduce((total, asset) => {
      const value = (asset.balance || 0) * (asset.current_price || 0);
      return total + value;
    }, 0);
  },

  formatBalance(value: number | string | null | undefined, maxDecimals: number = 6): string {
    if (value === null || value === undefined || value === '') return '0';
    try {
      const bn = new BigNumber(value);
      if (bn.isNaN() || bn.isZero()) return '0';

      const num = Math.abs(bn.toNumber());
      
      // Determine appropriate decimal places based on size
      let decimals = maxDecimals;
      if (num >= 1000) {
        decimals = 2;
      } else if (num < 0.000001) {
        decimals = 8; // Show more precision for small balances
      }

      // Format with commas and rounding
      let formatted = bn.toFormat(decimals, BigNumber.ROUND_HALF_UP);
      
      // Remove trailing zeros in decimal part if any
      if (formatted.includes('.')) {
        formatted = formatted.replace(/0+$/, '').replace(/\.$/, '');
      }
      
      // If it rounded to 0 but the original value is not zero, find the first significant digit and format
      if (formatted === '0' && !bn.isZero()) {
        const str = bn.toFixed(20);
        const match = str.match(/\.0*([1-9])/);
        if (match) {
          const firstSigDigitIndex = match[0].length - 1;
          formatted = bn.toFormat(Math.min(20, firstSigDigitIndex + 2), BigNumber.ROUND_HALF_UP);
          if (formatted.includes('.')) {
            formatted = formatted.replace(/0+$/, '').replace(/\.$/, '');
          }
        }
      }

      return formatted;
    } catch (error) {
      console.error('[portfolioUtils] formatBalance error:', error);
      return '0';
    }
  },

  formatUSD(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return '$0.00';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num < 0.01 && num > 0) {
      return formatMarketPrice(value, '$');
    }
    return formatNumericWithCommas(value, 2, '$');
  },

  async fetchBatchPrices(symbols: string[]): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
    const COMMON_TOKENS: Record<string, string> = {
      XLM: 'stellar',
      USDC: 'usd-coin',
      USDT: 'tether',
      BTC: 'bitcoin',
      ETH: 'ethereum',
      AQUA: 'aquarius',
      YXLM: 'yxlm',
      EURC: 'euro-coin',
      DAI: 'dai',
      WBTC: 'wrapped-bitcoin',
      BSC: 'binancecoin',
      MATIC: 'matic-network',
      AVAX: 'avalanche-2',
      TRX: 'tron',
      DYDX: 'dydx'
    };

    const idsToFetch = Array.from(new Set(symbols.map(s => COMMON_TOKENS[s.toUpperCase()]))).filter(Boolean);

    if (idsToFetch.length === 0) return {};

    try {
      const response = await fetch(
        `${COINGECKO_BASE}/simple/price?ids=${idsToFetch.join(',')}&vs_currencies=usd&include_24hr_change=true`
      );
      if (!response.ok) return {};
      const data = await response.json();

      const result: Record<string, { usd: number; usd_24h_change: number }> = {};
      symbols.forEach(symbol => {
        const id = COMMON_TOKENS[symbol.toUpperCase()];
        if (id && data[id]) {
          result[symbol.toUpperCase()] = data[id];
        }
      });
      return result;
    } catch {
      return {};
    }
  }
};
