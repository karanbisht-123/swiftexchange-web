import { create } from 'zustand';

export interface AssetCtx {
  funding: string;
  nextFundingTime?: number;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string;
  impactPxs?: string[];
}

interface TickerStoreState {
  assetCtxByMarket: Record<string, AssetCtx>;
  setAssetCtx: (market: string, ctx: AssetCtx) => void;
  setMultipleAssetCtxs: (contexts: Record<string, AssetCtx>) => void;
  getAssetCtx: (market: string) => AssetCtx | undefined;
}

export const useTickerStore = create<TickerStoreState>((set, get) => ({
  assetCtxByMarket: {},
  setAssetCtx: (market, ctx) =>
    set(state => ({
      assetCtxByMarket: {
        ...state.assetCtxByMarket,
        [market]: ctx,
      },
    })),
  setMultipleAssetCtxs: contexts =>
    set(state => ({
      assetCtxByMarket: {
        ...state.assetCtxByMarket,
        ...contexts,
      },
    })),
  getAssetCtx: market => get().assetCtxByMarket[market],
}));
