import { getIndexerClient } from '../client/clients';

export function formatFundingRate(raw: string | number): string {
    const n = parseFloat(String(raw));
    if (isNaN(n)) return '0.00000%';
    const pct = n * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(5)}%`;
}

export function formatAnnualizedFundingRate(raw: string | number): string {
    const n = parseFloat(String(raw));
    if (isNaN(n)) return '0.00%';
    const annualized = n * 100 * 24 * 365;
    const sign = annualized >= 0 ? '+' : '';
    return `${sign}${annualized.toFixed(2)}%`;
}

export async function fetchDydxServerTime(): Promise<number> {
    try {
        const indexerClient = getIndexerClient();
        const response = await indexerClient.utility.getTime();

        console.log("resooisne fo time ", response)

        if (response && response.iso) {
            return new Date(response.iso).getTime();
        }

        // Fallback to fetch if SDK fails for some reason
        const res = await fetch('https://indexer.dydx.trade/v4/time');
        const data = await res.json();
        return new Date(data.iso).getTime();
    } catch (error) {
        console.error('[FundingUtils] Error fetching server time:', error);
        return Date.now();
    }
}

export function getNextFundingTimestamp(serverTimeMs: number): number {
    const msPerHour = 3_600_000;
    const phaseShift = 1_800_000;
    return Math.ceil((serverTimeMs - phaseShift) / msPerHour) * msPerHour + phaseShift;
}

export function formatFundingCountdown(targetTimestamp: number, serverTimeMs: number): string {
    const diff = targetTimestamp - serverTimeMs;
    if (diff <= 0) return '00:00';
    const totalSeconds = Math.floor(diff / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Fetches the exact next funding time for a market by looking at historical data.
 * Anchors the 1-hour interval to the last actual funding payment.
 */
export async function fetchNextFundingTimeForMarket(market: string): Promise<number | null> {
    try {
        const indexerClient = getIndexerClient();
        const serverTimeMs = await fetchDydxServerTime();

        const response = await indexerClient.markets.getPerpetualMarketHistoricalFunding(
            market,
            undefined,
            undefined,
            1,
        );

        const historicalFunding = (response as any).historicalFunding;
        const lastFunding = historicalFunding?.[0];

        if (lastFunding && lastFunding.effectiveAt) {
            const lastMs = new Date(lastFunding.effectiveAt).getTime();
            const phaseShift = 1_800_000;


            let nextTs = Math.round((lastMs - phaseShift) / 1_800_000) * 1_800_000 + phaseShift;

            while (nextTs <= serverTimeMs) {
                nextTs += 3_600_000;
            }

            return nextTs;
        }
        return null;
    } catch (error) {
        console.error(`[FundingUtils] Error fetching historical funding for ${market}:`, error);
        return null;
    }
}