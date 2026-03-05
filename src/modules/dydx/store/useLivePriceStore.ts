import { create } from 'zustand';

interface LivePriceState {
    prices: Record<string, { price: number; side: 'BUY' | 'SELL' | null }>;
    setLivePrice: (market: string, price: number, side: 'BUY' | 'SELL' | null) => void;
}

export const useLivePriceStore = create<LivePriceState>((set) => ({
    prices: {},
    setLivePrice: (market, price, side) => set((state) => ({
        prices: {
            ...state.prices,
            [market]: { price, side }
        }
    }))
}));
