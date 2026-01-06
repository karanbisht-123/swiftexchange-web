import { type Asset } from '../hooks/useWalletAssets';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

export const portfolioUtils = {
  /**
   * Calculates total USD value: Sum of (Balance * Price)
   */
  calculateTotalUSD(assets: Asset[]): number {
    return assets.reduce((total, asset) => {
      const value = (asset.balance || 0) * (asset.current_price || 0);
      return total + value;
    }, 0);
  },

  /**
   * Fetches prices for a batch of assets to avoid rate limits
   */
  async fetchPrices(
    ids: string[]
  ): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
    if (!ids.length) return {};
    try {
      const uniqueIds = Array.from(new Set(ids)).join(',');
      const response = await fetch(
        `${COINGECKO_BASE}/simple/price?ids=${uniqueIds}&vs_currencies=usd&include_24hr_change=true`
      );
      return response.ok ? await response.json() : {};
    } catch (error) {
      console.error('Price fetch error:', error);
      return {};
    }
  },

  /**
   * Dynamically finds a CoinGecko ID and Icon for any symbol
   */
  async getAssetMetadata(symbol: string): Promise<{ id: string; name: string; image: string }> {
    try {
      const response = await fetch(`${COINGECKO_BASE}/search?query=${symbol}`);
      const data = await response.json();
      // Find exact symbol match or take the first result
      const match =
        data.coins?.find((c: any) => c.symbol.toLowerCase() === symbol.toLowerCase()) ||
        data.coins?.[0];

      return {
        id: match?.id || symbol.toLowerCase(),
        name: match?.name || symbol,
        image: match?.large || `https://ui-avatars.com/api/?name=${symbol}&background=random`,
      };
    } catch {
      return { id: symbol.toLowerCase(), name: symbol, image: '' };
    }
  },
};
