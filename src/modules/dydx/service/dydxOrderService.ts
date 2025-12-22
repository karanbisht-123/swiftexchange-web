import { dydxWalletService } from './dydxWalletService';

export interface Fill {
  id: string;
  market: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  fee: string;
  createdAt: string;
  liquidity: 'TAKER' | 'MAKER';
  type: string;
}

export interface HistoricalOrder {
  id: string;
  clientId: number;
  market: string;
  side: 'BUY' | 'SELL';
  type: string;
  size: string;
  price: string;
  filledSize: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  triggerPrice?: string;
  timeInForce: string;
}

export interface PaginationParams {
  limit?: number;
  createdBeforeOrAt?: string;
}

class DydxDataService {
  private fillsCache: { data: Fill[]; timestamp: number } | null = null;
  private fillsFetchPromise: Promise<Fill[]> | null = null;
  private readonly CACHE_TTL = 5000; // 5 seconds

  async fetchFills(limit: number = 100, createdBeforeOrAt?: string): Promise<Fill[]> {
    const address = dydxWalletService.getAddress();
    const subNo = dydxWalletService.getSubaccountNumber();
    const indexer = dydxWalletService.getIndexerClient();

    if (!address || !indexer) return [];

    // Return cache if valid and no pagination
    if (
      !createdBeforeOrAt &&
      this.fillsCache &&
      Date.now() - this.fillsCache.timestamp < this.CACHE_TTL
    ) {
      return this.fillsCache.data;
    }

    // Prevent duplicate requests
    if (this.fillsFetchPromise && !createdBeforeOrAt) {
      return this.fillsFetchPromise;
    }

    const fetchPromise = (async () => {
      try {
        const response = await indexer.account.getSubaccountFills(
          address,
          subNo,
          undefined,
          undefined,
          limit,
          undefined,
          createdBeforeOrAt
        );

        const fills = (response?.fills || []).map(this.mapToFill);

        // Cache only initial load
        if (!createdBeforeOrAt) {
          this.fillsCache = { data: fills, timestamp: Date.now() };
        }

        return fills;
      } catch (err) {
        console.error('Failed to fetch fills:', err);
        return [];
      }
    })();

    if (!createdBeforeOrAt) {
      this.fillsFetchPromise = fetchPromise;
      fetchPromise.finally(() => {
        this.fillsFetchPromise = null;
      });
    }

    return fetchPromise;
  }

  async fetchHistoricalOrders(
    limit: number = 50,
    createdBeforeOrAt?: string
  ): Promise<HistoricalOrder[]> {
    const address = dydxWalletService.getAddress();
    const subNo = dydxWalletService.getSubaccountNumber();
    const indexer = dydxWalletService.getIndexerClient();

    if (!address || !indexer) return [];

    try {
      const response = await indexer.account.getSubaccountOrders(
        address,
        subNo,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        limit,
        undefined,
        createdBeforeOrAt,
        false
      );

      return (response || []).map(this.mapToHistoricalOrder);
    } catch (err) {
      console.error('Failed to fetch historical orders:', err);
      return [];
    }
  }

  clearCache(): void {
    this.fillsCache = null;
    this.fillsFetchPromise = null;
  }

  private mapToFill(raw: any): Fill {
    return {
      id: raw.id,
      market: raw.market,
      side: raw.side.toUpperCase() as 'BUY' | 'SELL',
      size: raw.size,
      price: raw.price,
      fee: raw.fee,
      createdAt: raw.createdAt,
      liquidity: raw.liquidity,
      type: raw.type || 'LIMIT',
    };
  }

  private mapToHistoricalOrder(raw: any): HistoricalOrder {
    return {
      id: raw.id,
      clientId: Number(raw.clientId || 0),
      market: raw.ticker,
      side: raw.side.toUpperCase() as 'BUY' | 'SELL',
      type: raw.type,
      size: raw.size,
      price: raw.price,
      filledSize: raw.totalFilled || '0',
      status: raw.status,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      triggerPrice: raw.triggerPrice,
      timeInForce: raw.timeInForce || 'GTT',
    };
  }
}

export const dydxDataService = new DydxDataService();
