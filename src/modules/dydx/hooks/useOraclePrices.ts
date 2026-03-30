import { useCallback, useEffect, useRef, useMemo } from 'react';

import { getIndexerClient } from '../client/clients';
import { useWebSocketStore } from '../store/websocketStore';


export function useOraclePrices(markets: string[]): Record<string, number> {
    const storeMarkets = useWebSocketStore((state) => state.markets);
    const marketsKey = markets.join(',');

    return useMemo(() => {
        const prices: Record<string, number> = {};
        for (const ticker of markets) {
            const raw = storeMarkets.get(ticker)?.oraclePrice;
            const parsed = raw ? parseFloat(raw) : 0;
            if (parsed > 0) prices[ticker] = parsed;
        }
        return prices;
    }, [storeMarkets, marketsKey]);
}


export function useOraclePrice(ticker: string): number {
    const oraclePrice = useWebSocketStore(
        useCallback(
            (state) => {
                const raw = state.markets.get(ticker)?.oraclePrice;
                return raw ? parseFloat(raw) : 0;
            },
            [ticker]
        )
    );
    return oraclePrice;
}

export function useRefreshMarket(ticker: string) {
    const abortRef = useRef<AbortController | null>(null);
    const isRefreshingRef = useRef(false);

    const refresh = useCallback(async () => {
        if (isRefreshingRef.current || !ticker) return;

        abortRef.current?.abort();
        abortRef.current = new AbortController();
        isRefreshingRef.current = true;

        try {
            const indexerClient = getIndexerClient();
            const response = await indexerClient.markets.getPerpetualMarkets(ticker);

            const raw = response?.markets?.[ticker];
            if (!raw) return;

            useWebSocketStore.getState().updateMarket(ticker, {
                ticker,
                oraclePrice: raw.oraclePrice ?? '0',
                priceChange24H: raw.priceChange24H ?? '0',
                volume24H: raw.volume24H ?? '0',
                openInterest: raw.openInterest ?? '0',
                nextFundingRate: raw.nextFundingRate ?? '0',
                lastUpdate: Date.now(),
            });
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            console.error('[useRefreshMarket] Failed to refresh market:', ticker, err);
        } finally {
            isRefreshingRef.current = false;
        }
    }, [ticker]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    return refresh;
}