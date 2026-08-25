import { HttpTransport } from '../../core/transport/http';
import type { OrderBook } from '../../core/models';
import { orderBookStore } from '../../core/stores/orderbookStore';
import { HyperliquidMapper } from './mapper';
import type { HlL2BookResponse } from './mapper';

export class HyperliquidOrderBook extends HttpTransport {
  constructor() {
    super({
      baseUrl: 'https://api.hyperliquid.xyz',
      timeoutMs: 15000,
      maxRetries: 3,
    });
  }

  public async getOrderBook(coin: string): Promise<OrderBook> {
    const response = await this.post<HlL2BookResponse>('/info', {
      type: 'l2Book',
      coin: coin,
    });

    const mapped = HyperliquidMapper.mapOrderBook(response);
    
    // Seed our local store snapshot
    orderBookStore.applySnapshot(mapped.symbol, mapped.bids, mapped.asks, mapped.updateId ?? 0);

    return mapped;
  }
}
