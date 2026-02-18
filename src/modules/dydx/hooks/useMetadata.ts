import coinsList from '../data/coins.json';

export interface CoinMetadata {
    id: string;
    symbol: string;
    name: string;
    image: string;
    current_price?: number;
    market_cap?: number;
}

const CACHE_KEY = 'dydx_metadata_cache_v1';
const CACHE_DURATION = 60 * 60 * 1000;

class MetadataService {
    private cache: Record<string, CoinMetadata> = {};
    private initializationPromise: Promise<void> | null = null;
    private staticMap: Map<string, CoinMetadata> = new Map();

    constructor() {
        this.initializeStaticMap();
    }

    private initializeStaticMap() {
        try {
            (coinsList as any[]).forEach((coin: any) => {
                if (coin.symbol) {
                    this.staticMap.set(coin.symbol.toUpperCase(), {
                        id: coin.id,
                        symbol: coin.symbol,
                        name: coin.name,
                        image: coin.image
                    });
                }
            });
        } catch (error) {
            console.error(error);
        }
    }

    async initialize(): Promise<void> {
        if (Object.keys(this.cache).length > 0) return;
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = this.loadMetadata();
        return this.initializationPromise;
    }

    private async loadMetadata() {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION && Object.keys(data).length > 0) {
                    this.cache = data;
                    return;
                }
            }

            await this.fetchFromCoinGecko();
        } catch (error) {
            console.error(error);
        }
    }

    private async fetchFromCoinGecko() {
        try {
            const ids = Array.from(this.staticMap.values()).map(c => c.id).filter(Boolean);
            const uniqueIds = Array.from(new Set(ids));

            const chunks = [];
            const chunkSize = 250;

            for (let i = 0; i < uniqueIds.length; i += chunkSize) {
                chunks.push(uniqueIds.slice(i, i + chunkSize));
            }

            const results: CoinMetadata[] = [];

            for (const chunk of chunks) {
                try {
                    const params = new URLSearchParams({
                        vs_currency: 'usd',
                        ids: chunk.join(','),
                        order: 'market_cap_desc',
                        per_page: '250',
                        page: '1',
                        sparkline: 'false',
                        locale: 'en'
                    });

                    const response = await fetch(`https://api.coingecko.com/api/v3/coins/markets?${params}`);

                    if (response.status === 429) {
                        throw new Error('Rate limit');
                    }

                    if (!response.ok) continue;

                    const data = await response.json();
                    if (Array.isArray(data)) {
                        results.push(...data);
                    }

                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (e) {
                    console.error(e);
                }
            }

            if (results.length > 0) {
                const newCache: Record<string, CoinMetadata> = {};

                results.forEach(coin => {
                    if (coin.symbol) {
                        newCache[coin.symbol.toUpperCase()] = {
                            id: coin.id,
                            symbol: coin.symbol,
                            name: coin.name,
                            image: coin.image,
                            current_price: coin.current_price,
                            market_cap: coin.market_cap
                        };
                    }
                });

                this.cache = newCache;
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    data: newCache
                }));
            }
        } catch (error) {
            console.error(error);
        }
    }

    async getMetadata(ticker: string): Promise<CoinMetadata | null> {
        await this.initialize();

        const symbol = ticker.split('-')[0].toUpperCase();
        return this.cache[symbol] || this.staticMap.get(symbol) || null;
    }

    getCoinIcon(ticker: string): string {
        const symbol = ticker.split('-')[0].toUpperCase();
        return this.cache[symbol]?.image || this.staticMap.get(symbol)?.image || '';
    }

    async getMarketCap(ticker: string): Promise<string> {
        await this.initialize();
        const symbol = ticker.split('-')[0].toUpperCase();
        return this.cache[symbol]?.market_cap?.toString() || '0';
    }

    getCacheStats() {
        return {
            total: Object.keys(this.cache).length,
            static: this.staticMap.size
        };
    }

    subscribe(_listener: () => void) {
        return () => { };
    }

    preloadBatch(_tickers: string[]) {
        this.initialize();
    }
}

export const metadataService = new MetadataService();
