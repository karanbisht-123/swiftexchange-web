import * as StellarSDK from '@stellar/stellar-sdk';
import { StellarBaseService } from './StellarBaseService';

export interface RecentTrade {
  id: string;
  time: string;
  price: string;
  amount: string;
  isBuy: boolean;
}

export class RecentTradesService extends StellarBaseService {
  async getRecentTrades(
    base: StellarSDK.Asset,
    counter: StellarSDK.Asset,
    limit: number = 20
  ): Promise<RecentTrade[]> {
    try {
      const response = await this.server
        .trades()
        .forAssetPair(base, counter)
        .order('desc')
        .limit(limit)
        .call();

      return response.records.map((record: any) => ({
        id: record.id,
        time: record.ledger_close_time,
        price: (parseFloat(record.price.n) / parseFloat(record.price.d)).toFixed(7),
        amount: record.base_amount,
        isBuy: !record.base_is_seller,
      }));
    } catch (error) {
      console.error('[RecentTradesService] Failed to fetch trades:', error);
      throw error;
    }
  }

  streamRecentTrades(
    base: StellarSDK.Asset,
    counter: StellarSDK.Asset,
    onUpdate: (trade: RecentTrade) => void,
    onError?: (error: any) => void
  ): () => void {
    let closeStream: (() => void) | null = null;

    try {
      closeStream = this.server
        .trades()
        .forAssetPair(base, counter)
        .cursor('now')
        .stream({
          onmessage: (record: any) => {
            const trade: RecentTrade = {
              id: record.id,
              time: record.ledger_close_time,
              price: (parseFloat(record.price.n) / parseFloat(record.price.d)).toFixed(7),
              amount: record.base_amount,
              isBuy: !record.base_is_seller,
            };
            onUpdate(trade);
          },
          onerror: (error: any) => {
            console.error('[RecentTradesService] Stream error:', error);
            if (closeStream) closeStream();
            if (onError) onError(error);
          },
        }) as unknown as () => void;
    } catch (error) {
      console.error('[RecentTradesService] Failed to start stream:', error);
      if (onError) onError(error);
    }

    return () => {
      if (closeStream) closeStream();
    };
  }
}
