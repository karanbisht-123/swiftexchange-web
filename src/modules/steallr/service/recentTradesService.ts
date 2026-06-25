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

      return response.records.map((record: any) => {
        const n = parseFloat(record.price.n);
        const d = parseFloat(record.price.d);
        return {
          id: record.id,
          time: record.ledger_close_time,
          price: (!isNaN(n) && !isNaN(d) && d !== 0) ? (n / d).toFixed(7) : '0.0000000',
          amount: record.base_amount,
          isBuy: !record.base_is_seller,
        };
      });
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
    const reconnectTimeoutRef = { current: null as any };
    const stoppedRef = { current: false };
    let retryCount = 0;

    const startStream = () => {
      if (stoppedRef.current) return;

      try {
        closeStream = this.server
          .trades()
          .forAssetPair(base, counter)
          .cursor('now')
          .stream({
            onmessage: (record: any) => {
              const n = parseFloat(record.price.n);
              const d = parseFloat(record.price.d);
              const trade: RecentTrade = {
                id: record.id,
                time: record.ledger_close_time,
                price: (!isNaN(n) && !isNaN(d) && d !== 0) ? (n / d).toFixed(7) : '0.0000000',
                amount: record.base_amount,
                isBuy: !record.base_is_seller,
              };
              onUpdate(trade);
            },
            onerror: (error: any) => {
              console.error('[RecentTradesService] Stream error:', error);
              if (closeStream) {
                closeStream();
                closeStream = null;
              }
              if (stoppedRef.current) return;

              if (retryCount < 3) {
                retryCount++;
                console.log(`[RecentTradesService] Retrying stream connection (${retryCount}/3) in 5000ms...`);
                reconnectTimeoutRef.current = setTimeout(() => {
                  startStream();
                }, 5000);
              } else {
                console.error('[RecentTradesService] Stream connection failed after 3 retries.');
                if (onError) onError(error);
              }
            },
          }) as unknown as () => void;
      } catch (error) {
        console.error('[RecentTradesService] Failed to start stream:', error);
        if (stoppedRef.current) return;
        if (retryCount < 3) {
          retryCount++;
          reconnectTimeoutRef.current = setTimeout(() => {
            startStream();
          }, 5000);
        } else if (onError) {
          onError(error);
        }
      }
    };

    startStream();

    return () => {
      stoppedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (closeStream) {
        closeStream();
      }
    };
  }
}
