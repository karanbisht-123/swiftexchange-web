import { HttpTransport } from '../../core/transport/http';
import type { Market } from '../../core/models';
import { marketStore } from '../../core/stores/marketStore';
import { HyperliquidMapper } from './mapper';
import type { HlMetaResponse } from './mapper';
import { useTickerStore, type AssetCtx } from '../../core/stores/tickerStore';

export class HyperliquidMarkets extends HttpTransport {
  constructor() {
    super({
      baseUrl: 'https://api.hyperliquid.xyz',
      timeoutMs: 15000,
      maxRetries: 3,
    });
  }

  /**
   * Fetches the market metadata, updates the normalized store, and returns the models.
   */
  public async getMarkets(): Promise<Market[]> {
    // If we already have them, we could return early:
    // if (marketStore.isHydrated()) return marketStore.getAllMarkets();

    const response = await this.post<any[]>('/info', {
      type: 'metaAndAssetCtxs',
    });

    const meta: HlMetaResponse = response[0];
    const assetCtxs: any[] = response[1];

    const mapped = HyperliquidMapper.mapMarkets(meta);
    marketStore.setMarkets(mapped);

    if (Array.isArray(assetCtxs) && meta?.universe) {
      const contexts: Record<string, AssetCtx> = {};
      assetCtxs.forEach((ctx, index) => {
        const coin = meta.universe[index]?.name;
        if (coin) {
          const uiSymbol = `${coin}-USDC`;
          ctx.nextFundingTime = HyperliquidMapper.getNextFundingTime();
          contexts[uiSymbol] = ctx;
        }
      });
      useTickerStore.getState().setMultipleAssetCtxs(contexts);
    }
    
    return mapped;
  }

  /**
   * Fetches historical candles (k-lines) for a specific coin.
   */
  public async getCandles(coin: string, interval: string, startTime: number, endTime: number): Promise<import('../../core/models').Candle[]> {
    const response = await this.post<any[]>('/info', {
      type: 'candleSnapshot',
      req: {
        coin,
        interval,
        startTime,
        endTime,
      }
    });

    return HyperliquidMapper.mapCandle(response);
  }
}
