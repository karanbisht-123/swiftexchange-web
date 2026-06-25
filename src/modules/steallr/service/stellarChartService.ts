import { Asset, Horizon } from '@stellar/stellar-sdk';

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

// Horizon API max limit is 200
const MAX_DATA_POINTS = 200;
const DEFAULT_RESOLUTION = 900000; // 15m

export class StellarChartService {
  private server: Horizon.Server;
  private networkPassphrase: string;
  private networkKey: string;

  constructor(horizonUrl: string, networkPassphrase: string, networkKey: string) {
    const serverOptions: any = {};
    if (horizonUrl.startsWith('http://')) {
      serverOptions.allowHttp = true;
    }

    this.server = new Horizon.Server(horizonUrl, serverOptions);
    this.networkPassphrase = networkPassphrase;
    this.networkKey = networkKey;
  }

  private getAssetObjects(pair: ChartAssetPair): {
    base: Asset;
    counter: Asset;
  } {
    if (!pair.base || !pair.counter) {
      throw new Error('Base and counter assets must be specified');
    }

    let base: Asset;
    if (pair.base === 'XLM' || pair.base === 'native') {
      base = Asset.native();
    } else {
      if (!pair.baseIssuer) {
        throw new Error(`Issuer required for non-native base asset: ${pair.base}`);
      }
      base = new Asset(pair.base, pair.baseIssuer);
    }

    let counter: Asset;
    if (pair.counter === 'XLM' || pair.counter === 'native') {
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
          `Unsupported resolution: ${options.resolution}. Supported: ${SUPPORTED_RESOLUTIONS.join(', ')}`
        );
      }

      const { base, counter } = this.getAssetObjects(assetPair);

      // Validate time range
      const timeSpan = timeRange.endTime - timeRange.startTime;
      if (timeSpan <= 0) {
        throw new Error('Invalid time range: end time must be after start time');
      }

      // Calculate expected data points
      const expectedPoints = Math.floor(timeSpan / options.resolution);
      const requestLimit = Math.min(options.limit || MAX_DATA_POINTS, MAX_DATA_POINTS);

      // If we need more than 200 points, use pagination (up to 1000 max)
      if (expectedPoints > MAX_DATA_POINTS && !options.limit) {
        const maxPoints = Math.min(expectedPoints, 1000);
        return await this.fetchPaginatedAggregations(assetPair, timeRange, options, maxPoints);
      }

      const aggregationBuilder = this.server
        .tradeAggregation(
          base,
          counter,
          timeRange.startTime,
          timeRange.endTime,
          options.resolution,
          options.offset || 0
        )
        .limit(requestLimit)
        .order(options.order || 'asc');

      const response = await aggregationBuilder.call();
      const records = response.records;

      return records.map((agg: any) => this.transformAggregation(agg));
    } catch (error) {
      console.error('Failed to fetch trade aggregations:', error);

      // Better error messages
      if (error instanceof Error) {
        if (error.message.includes('limit')) {
          throw new Error(
            'Too much data requested. Try a shorter time range or larger resolution.'
          );
        }
        if (error.message.includes('invalid')) {
          throw new Error(`Invalid request: ${error.message}`);
        }
      }

      throw new Error(
        `Failed to fetch chart data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async fetchPaginatedAggregations(
    assetPair: ChartAssetPair,
    timeRange: ChartTimeRange,
    options: ChartOptions,
    maxPoints: number = 1000
  ): Promise<ChartDataPoint[]> {
    const { base, counter } = this.getAssetObjects(assetPair);
    const allData: ChartDataPoint[] = [];
    let currentStartTime = Math.floor(timeRange.startTime / options.resolution) * options.resolution;
    const maxIterations = Math.ceil(maxPoints / MAX_DATA_POINTS);
    const timeStep = Math.floor((timeRange.endTime - timeRange.startTime) / maxIterations);

    for (let i = 0; i < maxIterations && allData.length < maxPoints; i++) {
      const currentEndTime = Math.min(currentStartTime + timeStep, timeRange.endTime);

      try {
        const aggregationBuilder = this.server
          .tradeAggregation(
            base,
            counter,
            currentStartTime,
            currentEndTime,
            options.resolution,
            options.offset || 0
          )
          .limit(MAX_DATA_POINTS)
          .order('asc');

        const response = await aggregationBuilder.call();
        const records = response.records;

        if (records.length === 0) break;

        const transformed = records.map((agg: any) => this.transformAggregation(agg));
        allData.push(...transformed);

        currentStartTime = currentEndTime;

        // If we got less than max, we've reached the end
        if (records.length < MAX_DATA_POINTS) break;
      } catch (error) {
        console.error('Error in pagination:', error);
        break;
      }
    }

    return allData;
  }

  async pollTradeAggregations(
    assetPair: ChartAssetPair,
    options: ChartOptions,
    onData: (dataPoint: ChartDataPoint) => void,
    onError?: (error: Error) => void
  ): Promise<() => void> {
    let stopped = false;
    let lastTimestamp = 0;

    const poll = async () => {
      if (stopped) return;
      try {
        const endTime = Date.now();
        const startTime = endTime - Math.max(options.resolution * 4, 3600000);
        const data = await this.fetchTradeAggregations(
          assetPair,
          { startTime, endTime },
          { resolution: options.resolution, limit: 10, order: 'desc' }
        );
        for (const point of data) {
          if (point.timestamp > lastTimestamp) {
            lastTimestamp = point.timestamp;
            onData(point);
          }
        }
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error('Poll error'));
      }
      if (!stopped) setTimeout(poll, 30000); // 30s interval
    };

    poll();
    return () => {
      stopped = true;
    };
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

  getNetworkKey(): string {
    return this.networkKey;
  }

  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }
}
