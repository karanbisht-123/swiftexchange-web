import { create } from 'zustand';

interface OrderbookEntry {
    price: string;
    amount: string;
    price_r?: { n: number; d: number };
}

interface OrderbookData {
    bids: OrderbookEntry[];
    asks: OrderbookEntry[];
    base?: any;
    counter?: any;
}

interface StellarOrderbookState {
    orderbook: OrderbookData | null;
    isStreaming: boolean;
    lastUpdate: number | null;
    error: string | null;
    streamCloseFunction: (() => void) | null;

    setOrderbook: (data: OrderbookData) => void;
    setStreaming: (isStreaming: boolean) => void;
    setError: (error: string | null) => void;
    setStreamCloseFunction: (fn: (() => void) | null) => void;
    reset: () => void;
}

export const useStellarOrderbookStore = create<StellarOrderbookState>(set => ({
    orderbook: null,
    isStreaming: false,
    lastUpdate: null,
    error: null,
    streamCloseFunction: null,

    setOrderbook: data =>
        set({
            orderbook: data,
            lastUpdate: Date.now(),
            error: null,
        }),

    setStreaming: isStreaming => set({ isStreaming }),

    setError: error => set({ error, isStreaming: false }),

    setStreamCloseFunction: fn => set({ streamCloseFunction: fn }),

    reset: () =>
        set({
            orderbook: null,
            isStreaming: false,
            lastUpdate: null,
            error: null,
            streamCloseFunction: null,
        }),
}));
