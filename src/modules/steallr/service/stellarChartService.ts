import { Asset, Horizon } from '@stellar/stellar-sdk';

import {
  DEFAULT_RESOLUTION,
  HORIZON_MAINNET,
  HORIZON_TESTNET,
  MAX_DATA_POINTS,
  NATIVE_ASSET,
} from '../constants/steallrChartConstant';
import type {
  ChartAssetPair,
  ChartDataPoint,
  ChartOptions,
  ChartTimeRange,
  StellarTradeAggregation,
} from '../types/stellarChart.types';

const SUPPORTED_RESOLUTIONS = [
  60000, // 1m
  300000, // 5m
  900000, // 15m
  3600000, // 1h
  86400000, // 1d
  604800000, // 1w
];

export class StellarChartService {
  private server: Horizon.Server;

  constructor(networkKey: string = 'mainnet') {
    const horizonUrl = networkKey === 'mainnet' ? HORIZON_MAINNET : HORIZON_TESTNET;
    this.server = new Horizon.Server(horizonUrl);
  }

  private getAssetObjects(pair: ChartAssetPair): {
    base: Asset;
    counter: Asset;
  } {
    if (!pair.base || !pair.counter) {
      throw new Error('Base and counter assets must be specified');
    }

    let base: Asset;
    if (pair.base === 'XLM' || pair.base === NATIVE_ASSET) {
      base = Asset.native();
    } else {
      if (!pair.baseIssuer) {
        throw new Error(`Issuer required for non-native base asset: ${pair.base}`);
      }
      base = new Asset(pair.base, pair.baseIssuer);
    }

    let counter: Asset;
    if (pair.counter === 'XLM' || pair.counter === NATIVE_ASSET) {
      counter = Asset.native();
    } else {
      if (!pair.counterIssuer) {
        throw new Error(`Issuer required for non-native counter asset: ${pair.counter}`);
      }
      counter = new Asset(pair.counter, pair.counterIssuer);
    }

    return { base, counter };
  }

  private transformAggregation(agg: StellarTradeAggregation): ChartDataPoint {
    const open = parseFloat(agg.open);
    const high = parseFloat(agg.high);
    const low = parseFloat(agg.low);
    const close = parseFloat(agg.close);
    const baseVolume = parseFloat(agg.base_volume);
    const counterVolume = parseFloat(agg.counter_volume);

    if (
      isNaN(open) ||
      isNaN(high) ||
      isNaN(low) ||
      isNaN(close) ||
      isNaN(baseVolume) ||
      isNaN(counterVolume)
    ) {
      console.warn('Invalid trade aggregation data:', agg);
      return {
        timestamp: parseInt(agg.timestamp) || 0,
        open: '0',
        high: '0',
        low: '0',
        close: '0',
        volume: '0',
        baseVolume: '0',
        counterVolume: '0',
        tradeCount: parseInt(agg.trade_count) || 0,
      };
    }

    return {
      timestamp: parseInt(agg.timestamp),
      open: agg.open,
      high: agg.high,
      low: agg.low,
      close: agg.close,
      volume: (baseVolume + counterVolume).toString(),
      baseVolume: agg.base_volume,
      counterVolume: agg.counter_volume,
      tradeCount: parseInt(agg.trade_count),
    };
  }

  async fetchTradeAggregations(
    assetPair: ChartAssetPair,
    timeRange: ChartTimeRange,
    options: ChartOptions = { resolution: DEFAULT_RESOLUTION }
  ): Promise<ChartDataPoint[]> {
    try {
      if (!SUPPORTED_RESOLUTIONS.includes(options.resolution)) {
        throw new Error(
          `Unsupported resolution: ${
            options.resolution
          }. Supported: ${SUPPORTED_RESOLUTIONS.join(', ')}`
        );
      }

      const { base, counter } = this.getAssetObjects(assetPair);

      const aggregationBuilder = this.server
        .tradeAggregation(
          base,
          counter,
          timeRange.startTime,
          timeRange.endTime,
          options.resolution,
          options.offset || 0
        )
        .limit(options.limit || MAX_DATA_POINTS)
        .order(options.order || 'asc');

      const response = await aggregationBuilder.call();
      const records = response.records;

      return records.map((agg: any) => this.transformAggregation(agg));
    } catch (error) {
      console.error('Failed to fetch trade aggregations:', error, {
        assetPair,
        timeRange,
        options,
      });
      throw new Error(
        `Failed to fetch chart data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async streamTradeAggregations(
    assetPair: ChartAssetPair,
    options: ChartOptions,
    onData: (dataPoint: ChartDataPoint) => void,
    onError?: (error: Error) => void
  ): Promise<() => void> {
    try {
      if (!SUPPORTED_RESOLUTIONS.includes(options.resolution)) {
        throw new Error(
          `Unsupported resolution: ${
            options.resolution
          }. Supported: ${SUPPORTED_RESOLUTIONS.join(', ')}`
        );
      }

      const { base, counter } = this.getAssetObjects(assetPair);

      const startTime = Date.now() - 3600000;
      const endTime = Date.now();

      const aggregationBuilder = this.server
        .tradeAggregation(
          base,
          counter,
          startTime,
          endTime,
          options.resolution,
          options.offset || 0
        )
        .cursor('now');

      let errorReported = false;

      const closer = aggregationBuilder.stream({
        onmessage: (record: any) => {
          try {
            const dataPoint = this.transformAggregation(record);
            onData(dataPoint);
          } catch (err) {
            console.error('Error processing stream message:', err, { record });
            if (onError && !errorReported) {
              errorReported = true;
              onError(err instanceof Error ? err : new Error('Error processing stream message'));
            }
          }
        },
        onerror: (error: any) => {
          if (errorReported) {
            console.warn('Stream error already reported, ignoring duplicate');
            return;
          }

          errorReported = true;

          console.error('Stream error:', {
            error,
            url: error?.target?.url,
            readyState: error?.target?.readyState,
            status: error?.target?.status,
            assetPair,
            resolution: options.resolution,
          });

          if (onError) {
            // Check if it's a 406 error
            const is406 =
              error?.target?.readyState === 2 ||
              error?.message?.includes('406') ||
              error?.message?.includes('Not Acceptable');

            const errMessage = is406
              ? 'Stream connection error (HTTP 406 Not Acceptable)'
              : error instanceof Error
                ? error.message
                : 'Stream connection error';

            onError(new Error(errMessage));
          }
        },
      });

      console.log('Stream started for:', {
        assetPair: `${assetPair.base}/${assetPair.counter}`,
        resolution: options.resolution,
      });

      return () => {
        if (closer && typeof closer === 'function') {
          closer();
          console.log('Stream closed for:', `${assetPair.base}/${assetPair.counter}`);
        }
      };
    } catch (error) {
      console.error('Failed to start streaming:', error, {
        assetPair,
        options,
      });
      if (onError) {
        onError(error instanceof Error ? error : new Error('Failed to start streaming'));
      }
      return () => {};
    }
  }

  async getLatestPrice(assetPair: ChartAssetPair): Promise<string | null> {
    try {
      const endTime = Date.now();
      const startTime = endTime - 3600000;

      const data = await this.fetchTradeAggregations(
        assetPair,
        { startTime, endTime },
        { resolution: DEFAULT_RESOLUTION, limit: 1, order: 'desc' }
      );

      return data.length > 0 ? data[0].close : null;
    } catch (error) {
      console.error('Failed to fetch latest price:', error);
      return null;
    }
  }

  async getOrderBook(base: Asset, counter: Asset, limit: number = 20): Promise<any> {
    try {
      const orderbook = await this.server.orderbook(base, counter).limit(limit).call();

      return orderbook;
    } catch (error) {
      console.error('Failed to fetch order book:', error);
      throw error;
    }
  }
}
