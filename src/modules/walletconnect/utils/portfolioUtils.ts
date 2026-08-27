import BigNumber from 'bignumber.js';

import { formatMarketPrice, formatNumericWithCommas } from '../../../utils/BigNumberUtils';
import { type Asset } from '../store/portfolioStore';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

export const portfolioUtils = {
  calculateTotalUSD(assets: Asset[]): number {
    return assets.reduce((total, asset) => {
      const value = (asset.balance || 0) * (asset.current_price || 0);
      return total + value;
    }, 0);
  },

  calculatePortfolioChange(assets: Asset[]): number {
    let totalValue = 0;
    let weightedChange = 0;
    for (const asset of assets) {
      if (asset.balance && (asset.current_price || 0) > 0) {
        const assetValue = asset.balance * asset.current_price;
        totalValue += assetValue;
        weightedChange += assetValue * (asset.price_change_percentage_24h || 0);
      }
    }
    if (totalValue === 0) return 0;
    return weightedChange / totalValue;
  },

  formatBalance(value: number | string | null | undefined, maxDecimals: number = 6): string {
    if (value === null || value === undefined || value === '') return '0';
    try {
      const bn = new BigNumber(value);
      if (bn.isNaN() || bn.isZero()) return '0';

      const num = Math.abs(bn.toNumber());
      let decimals = maxDecimals;
      if (num >= 1000) {
        decimals = 2;
      } else if (num < 0.000001) {
        decimals = 8;
      }
      let formatted = bn.toFormat(decimals, BigNumber.ROUND_HALF_UP);
      if (formatted.includes('.')) {
        formatted = formatted.replace(/0+$/, '').replace(/\.$/, '');
      }

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

  async fetchBatchPrices(
    symbols: string[]
  ): Promise<Record<string, { usd: number; usd_24h_change: number; sparkline?: number[] }>> {
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
      DYDX: 'dydx',
    };

    const idsToFetch = Array.from(new Set(symbols.map(s => COMMON_TOKENS[s.toUpperCase()]))).filter(
      Boolean
    );

    if (idsToFetch.length === 0) return {};

    try {
      const response = await fetch(
        `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${idsToFetch.join(',')}&sparkline=true`
      );
      if (!response.ok) return {};
      const data = await response.json();

      const result: Record<string, { usd: number; usd_24h_change: number; sparkline?: number[] }> =
        {};

      const dataMap = data.reduce((acc: any, item: any) => {
        acc[item.id] = item;
        return acc;
      }, {});

      symbols.forEach(symbol => {
        const id = COMMON_TOKENS[symbol.toUpperCase()];
        if (id && dataMap[id]) {
          result[symbol.toUpperCase()] = {
            usd: dataMap[id].current_price,
            usd_24h_change: dataMap[id].price_change_percentage_24h || 0,
            sparkline: dataMap[id].sparkline_in_7d?.price,
          };
        }
      });
      return result;
    } catch {
      return {};
    }
  },
};
