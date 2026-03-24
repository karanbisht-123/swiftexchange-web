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
    const res = await fetch('https://indexer.dydx.trade/v4/time');
    const data = await res.json();
    return new Date(data.iso).getTime();
}

export function getNextFundingTimestamp(serverTimeMs: number): number {
    const msPerHour = 3_600_000;
    return Math.ceil(serverTimeMs / msPerHour) * msPerHour;
}

export function formatFundingCountdown(targetTimestamp: number, serverTimeMs: number): string {
    const diff = targetTimestamp - serverTimeMs;
    if (diff <= 0) return '00:00';
    const totalSeconds = Math.floor(diff / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}