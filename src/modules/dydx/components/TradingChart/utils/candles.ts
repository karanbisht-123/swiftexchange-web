import type { CandleBar } from '../types';

export function isValidCandle(c: {
  open: number;
  high: number;
  low: number;
  close: number;
}): boolean {
  return (
    c.open > 0 &&
    c.high > 0 &&
    c.low > 0 &&
    c.close > 0 &&
    isFinite(c.open) &&
    isFinite(c.high) &&
    isFinite(c.low) &&
    isFinite(c.close)
  );
}

export function normalizeCandles(raw: any[]): CandleBar[] {
  return raw
    .map(c => ({
      time: c.startedAtTime
        ? Math.floor(c.startedAtTime / 1000)
        : Math.floor(new Date(c.startedAt).getTime() / 1000),
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.usdVolume),
    }))
    .filter(isValidCandle)
    .sort((a, b) => a.time - b.time);
}

export function getPlot(result: any, ...keys: string[]): { time: number; value: number }[] {
  if (!result) return [];
  const plots = result.plots || result;
  for (const key of keys) {
    if (Array.isArray(plots?.[key]) && plots[key].length > 0) {
      return plots[key].filter((d: any) => d && typeof d.value === 'number' && isFinite(d.value));
    }
  }
  return [];
}

export function findAt(
  arr: { time: number; value: number }[] | undefined,
  time: number
): { time: number; value: number } | undefined {
  if (!arr || arr.length === 0) return undefined;
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].time === time) return arr[mid];
    if (arr[mid].time < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

export function formatNum(value: number | undefined, digits = 2): string {
  if (value === undefined || value === null || !isFinite(value)) return '-';
  return value.toFixed(digits);
}

export function buildDatasetId(market: string, timeframe: string, candles: any[]): string {
  const first = candles[0]?.startedAt || 'none';
  const last = candles[candles.length - 1]?.startedAt || 'none';
  return `${market}-${timeframe}-${candles.length}-${first}-${last}`;
}

export function candlesMatchMarket(candles: any[], selectedMarket: string): boolean {
  const ticker = candles[0]?.ticker || '';
  return !ticker || ticker === selectedMarket || selectedMarket.startsWith(ticker);
}
