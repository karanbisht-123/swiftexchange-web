import { create } from 'zustand';

import type { Candle } from '../models';

interface CandleStoreState {
  candlesByMarketAndInterval: Record<string, Candle[]>;
  setCandles: (market: string, interval: string, candles: Candle[]) => void;
  addLiveCandle: (market: string, interval: string, candle: Candle) => void;
}

export const useCandleStore = create<CandleStoreState>(set => ({
  candlesByMarketAndInterval: {},
  setCandles: (market, interval, candles) =>
    set(state => ({
      candlesByMarketAndInterval: {
        ...state.candlesByMarketAndInterval,
        [`${market}_${interval}`]: candles,
      },
    })),
  addLiveCandle: (market, interval, candle) =>
    set(state => {
      const key = `${market}_${interval}`;
      const existing = [...(state.candlesByMarketAndInterval[key] || [])];

      if (existing.length > 0) {
        const last = existing[existing.length - 1];
        if (last.startedAtTime === candle.startedAtTime) {
          existing[existing.length - 1] = candle;
        } else if (candle.startedAtTime > last.startedAtTime) {
          existing.push(candle);
          if (existing.length > 5000) {
            existing.shift();
          }
        }
      } else {
        existing.push(candle);
      }

      return {
        candlesByMarketAndInterval: {
          ...state.candlesByMarketAndInterval,
          [key]: existing,
        },
      };
    }),
}));
