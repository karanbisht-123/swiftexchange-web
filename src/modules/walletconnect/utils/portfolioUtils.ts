import { formatMarketPrice, formatNumericWithCommas } from '../../dydx/utils/BigNumberUtils';
import { type Asset } from '../store/portfolioStore';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

export const portfolioUtils = {
  calculateTotalUSD(assets: Asset[]): number {
    return assets.reduce((total, asset) => {
      const value = (asset.balance || 0) * (asset.current_price || 0);
      return total + value;
    }, 0);
  },

  formatBalance(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return '0';
    return formatMarketPrice(value, '');
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
