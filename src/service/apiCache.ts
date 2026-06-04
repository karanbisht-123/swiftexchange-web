const GAS_PREFIX = 'sx_gas_cache_';
export const GAS_TTL = 30_000;

export const getGasKey = (prefix: string, address: string) =>
    `${GAS_PREFIX}${prefix}_${address}`;

export function readLocalCache<T>(key: string, ttl: number): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { timestamp, data } = JSON.parse(raw);
        if (Date.now() - timestamp < ttl) return data as T;
    } catch (err) { console.log(err) }
    return null;
}

export function writeLocalCache<T>(key: string, data: T): void {
    try {
        localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
    } catch (err) {
        console.log(err)
    }
}

export function readStaleCache<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw).data as T) : null;
    } catch { return null; }
}

// In-memory cache (Stellar PnL) 
const PNL_TTL = 20_000;
const pnlCache = new Map<string, { ts: number; data: unknown }>();
const pnlInFlight = new Map<string, Promise<unknown>>();

export function getPnlCache(key: string): unknown | null {
    const entry = pnlCache.get(key);
    return entry && Date.now() - entry.ts < PNL_TTL ? entry.data : null;
}

export function setPnlCache(key: string, data: unknown) {
    pnlCache.set(key, { ts: Date.now(), data });
}

export const getPnlInflight = (k: string) => pnlInFlight.get(k) ?? null;
export const setPnlInflight = (k: string, p: Promise<unknown>) => pnlInFlight.set(k, p);
export const dropPnlInflight = (k: string) => pnlInFlight.delete(k);