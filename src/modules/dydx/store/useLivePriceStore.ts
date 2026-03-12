import { create } from 'zustand';
interface LivePriceState {
    prices: Record<string, { price: number; side: 'BUY' | 'SELL' | null }>;
    setLivePrice: (market: string, price: number, side: 'BUY' | 'SELL' | null) => void;
    clearMarketPrice: (market: string) => void;
}

export const useLivePriceStore = create<LivePriceState>((set) => ({
    prices: {},
    setLivePrice: (market, price, side) => set(state => ({
        prices: { ...state.prices, [market]: { price, side } }
    })),
    clearMarketPrice: (market) => set(state => {
        const next = { ...state.prices };
        delete next[market];
        return { prices: next };
    }),
}));