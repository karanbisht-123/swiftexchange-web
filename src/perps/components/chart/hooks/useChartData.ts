import { useCallback, useRef } from 'react';

import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { LineStyle } from 'lightweight-charts';

import type { CandleBar, ChartType, ThemeColors } from '../types';
import { buildDatasetId, candlesMatchMarket, normalizeCandles } from '../utils/candles';

export interface UseChartDataResult {
  lastCandleDataRef: React.MutableRefObject<CandleBar[]>;
  lastBarTimeRef: React.MutableRefObject<number>;
  lastDatasetIdRef: React.MutableRefObject<string>;
  prevMarketRef: React.MutableRefObject<string>;
  prevTimeframeRef: React.MutableRefObject<string | null>;
  /** Reset the price-line ref when the series is recreated externally. */
  resetPriceLine: () => void;
  applyDataset: (
    chart: IChartApi,
    series: ISeriesApi<any>,
    volumeSeries: ISeriesApi<any> | null,
    candles: any[],
    params: {
      market: string;
      timeframe: string;
      chartType: ChartType;
      showVolume: boolean;
      colors: ThemeColors;
      isMobile: boolean;
    }
  ) => boolean;
  applyTick: (
    series: ISeriesApi<any>,
    volumeSeries: ISeriesApi<any> | null,
    latestCandle: any,
    params: {
      market: string;
      chartType: ChartType;
      showVolume: boolean;
      colors: ThemeColors;
    }
  ) => CandleBar | null;
}

/** Attempt to remove a price line from a series, ignoring errors if already removed. */
function safeRemovePriceLine(series: ISeriesApi<any>, line: any) {
  try {
    series.removePriceLine(line);
  } catch {
    /* series may have been recreated */
  }
}

/** Create or update the dotted current-price horizontal line on the right scale. */
function upsertPriceLine(
  series: ISeriesApi<any>,
  existingLine: any,
  price: number,
  color: string
): any {
  if (existingLine) {
    try {
      existingLine.applyOptions({ price, color });
      return existingLine;
    } catch {
      // Line is orphaned (series was recreated) — fall through to create
    }
  }
  try {
    return series.createPriceLine({
      price,
      color,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: '',
    });
  } catch {
    return null;
  }
}

export function useChartData(): UseChartDataResult {
  const lastCandleDataRef = useRef<CandleBar[]>([]);
  const lastBarTimeRef = useRef<number>(0);
  const lastDatasetIdRef = useRef<string>('');
  const prevMarketRef = useRef<string>('');
  const prevTimeframeRef = useRef<string | null>(null);

  // Tracks the live price-line primitive on the current series
  const priceLineRef = useRef<any>(null);

  const resetPriceLine = useCallback(() => {
    priceLineRef.current = null;
  }, []);

  const setVisibleRange = useCallback((chart: IChartApi, dataLength: number, isMobile: boolean) => {
    if (dataLength === 0) return;
    const visibleBars = isMobile ? 45 : 80;
    if (dataLength > visibleBars) {
      chart
        .timeScale()
        .setVisibleLogicalRange({ from: dataLength - visibleBars, to: dataLength + 3 });
    } else {
      chart.timeScale().fitContent();
    }
  }, []);

  const applyDataset = useCallback(
    (
      chart: IChartApi,
      series: ISeriesApi<any>,
      volumeSeries: ISeriesApi<any> | null,
      candles: any[],
      params: {
        market: string;
        timeframe: string;
        chartType: ChartType;
        showVolume: boolean;
        colors: ThemeColors;
        isMobile: boolean;
      }
    ): boolean => {
      const { market, timeframe, chartType, showVolume, colors, isMobile } = params;

      const datasetId = buildDatasetId(market, timeframe, candles);
      if (lastDatasetIdRef.current === datasetId) return false;
      if (!candlesMatchMarket(candles, market)) return false;

      const candleData = normalizeCandles(candles);

      try {
        if (candleData.length === 0) {
          series.setData([]);
          if (volumeSeries) volumeSeries.setData([]);
          lastCandleDataRef.current = [];
          // Remove stale price line
          if (priceLineRef.current) {
            safeRemovePriceLine(series, priceLineRef.current);
            priceLineRef.current = null;
          }
          return true;
        }

        if (chartType === 'candlestick') {
          series.setData(candleData);
        } else {
          series.setData(candleData.map(c => ({ time: c.time, value: c.close })));
        }

        if (candleData.length > 0) {
          lastBarTimeRef.current = candleData[candleData.length - 1].time;
        }

        if (showVolume && volumeSeries) {
          volumeSeries.setData(
            candleData.map(c => ({
              time: c.time,
              value: c.volume,
              color: c.close >= c.open ? colors.upColor + '40' : colors.downColor + '40',
            }))
          );
        }

        lastCandleDataRef.current = candleData;

        // ----- Current-price dotted line -----
        const last = candleData[candleData.length - 1];
        const priceColor = last.close >= last.open ? colors.upColor : colors.downColor;

        // Always recreate on a full dataset replace (series.setData resets price lines)
        if (priceLineRef.current) {
          safeRemovePriceLine(series, priceLineRef.current);
          priceLineRef.current = null;
        }
        priceLineRef.current = upsertPriceLine(series, null, last.close, priceColor);

        const marketOrTimeframeChanged =
          prevMarketRef.current !== market || prevTimeframeRef.current !== timeframe;
        if (marketOrTimeframeChanged) {
          setVisibleRange(chart, candleData.length, isMobile);
          prevMarketRef.current = market;
          prevTimeframeRef.current = timeframe;
        }

        lastDatasetIdRef.current = datasetId;
        return true;
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[Chart] Error setting data:', err);
        }
        return false;
      }
    },
    [setVisibleRange]
  );

  const applyTick = useCallback(
    (
      series: ISeriesApi<any>,
      volumeSeries: ISeriesApi<any> | null,
      latestCandle: any,
      params: {
        market: string;
        chartType: ChartType;
        showVolume: boolean;
        colors: ThemeColors;
      }
    ): CandleBar | null => {
      const { market, chartType, showVolume, colors } = params;

      if (latestCandle.ticker && latestCandle.ticker !== market) return null;

      const open = parseFloat(latestCandle.open);
      const high = parseFloat(latestCandle.high);
      const low = parseFloat(latestCandle.low);
      const close = parseFloat(latestCandle.close);
      if (
        !open ||
        !high ||
        !low ||
        !close ||
        !isFinite(open) ||
        !isFinite(high) ||
        !isFinite(low) ||
        !isFinite(close)
      ) {
        return null;
      }

      const candleTime = latestCandle.startedAtTime
        ? Math.floor(latestCandle.startedAtTime / 1000)
        : Math.floor(new Date(latestCandle.startedAt).getTime() / 1000);
      if (candleTime < lastBarTimeRef.current) return null;

      const candlePoint = { time: candleTime as any, open, high, low, close };

      try {
        if (chartType === 'candlestick') series.update(candlePoint);
        else series.update({ time: candlePoint.time, value: close });

        lastBarTimeRef.current = candleTime;
        const volume = parseFloat(latestCandle.usdVolume);

        if (showVolume && volumeSeries) {
          volumeSeries.update({
            time: candlePoint.time,
            value: volume,
            color: close >= open ? colors.upColor + '40' : colors.downColor + '40',
          });
        }

        // ----- Update current-price dotted line (O(1)) -----
        const priceColor = close >= open ? colors.upColor : colors.downColor;
        priceLineRef.current = upsertPriceLine(series, priceLineRef.current, close, priceColor);

        const updatedBar: CandleBar = { time: candleTime, open, high, low, close, volume };
        const candleData = lastCandleDataRef.current;
        if (candleData.length > 0 && candleData[candleData.length - 1].time === candleTime) {
          candleData[candleData.length - 1] = updatedBar;
        } else {
          candleData.push(updatedBar);
        }

        return updatedBar;
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[Chart] Update error:', err);
        }
        return null;
      }
    },
    []
  );

  return {
    lastCandleDataRef,
    lastBarTimeRef,
    lastDatasetIdRef,
    prevMarketRef,
    prevTimeframeRef,
    resetPriceLine,
    applyDataset,
    applyTick,
  };
}
