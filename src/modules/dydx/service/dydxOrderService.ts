import { dydxWalletService } from './dydxWalletService';

export interface Order {
  id: string;
  clientId: string;
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
  timeInForce?: string;
}

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

class DydxOrderService {
  async fetchOpenOrders(): Promise<Order[]> {
    const address = dydxWalletService.getAddress();
    const subNo = dydxWalletService.getSubaccountNumber();
    const indexer = dydxWalletService.getIndexerClient();

    if (!address || !indexer) {
      throw new Error('Wallet not connected');
    }

    try {
      const response = await indexer.account.getSubaccountOrders(
        address,
        subNo,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        100
      );

      return (response || [])
        .map((o: any) => ({
          id: o.id,
          clientId: o.clientId,
          market: o.ticker,
          side: o.side.toUpperCase() as 'BUY' | 'SELL',
          type: o.type,
          size: o.size,
          price: o.price,
          filledSize: o.totalFilled || '0',
          status: o.status,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
          triggerPrice: o.triggerPrice,
          timeInForce: o.timeInForce,
        }))
        .sort(
          (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    } catch (error) {
      console.error('Error fetching open orders:', error);
      throw error;
    }
  }

  async fetchOrderHistory(statusFilter?: string): Promise<Order[]> {
    console.log('Fetching order history with status filter:', statusFilter);
    const address = dydxWalletService.getAddress();
    const subNo = dydxWalletService.getSubaccountNumber();
    const indexer = dydxWalletService.getIndexerClient();

    if (!address || !indexer) {
      throw new Error('Wallet not connected');
    }

    try {
      const response = await indexer.account.getSubaccountOrders(
        address,
        subNo,
        undefined, // ticker
        undefined, // type
        undefined, // side
        undefined, // status filter
        undefined, // goodTilBlockBeforeOrAt
        100 // limit
      );

      return (response || []).map((o: any) => ({
        id: o.id,
        clientId: o.clientId,
        market: o.ticker,
        side: o.side.toUpperCase() as 'BUY' | 'SELL',
        type: o.type,
        size: o.size,
        price: o.price,
        filledSize: o.totalFilled || '0',
        status: o.status,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        triggerPrice: o.triggerPrice,
        timeInForce: o.timeInForce,
      }));
    } catch (error) {
      console.error('Error fetching order history:', error);
      throw error;
    }
  }

  async fetchFills(): Promise<Fill[]> {
    const address = dydxWalletService.getAddress();
    const subNo = dydxWalletService.getSubaccountNumber();
    const indexer = dydxWalletService.getIndexerClient();

    if (!address || !indexer) {
      throw new Error('Wallet not connected');
    }

    try {
      const response = await indexer.account.getSubaccountFills(
        address,
        subNo,
        undefined, // market
        undefined, // limit
        100
      );

      return (response.fills || [])
        .map((f: any) => ({
          id: f.id,
          market: f.market,
          side: f.side.toUpperCase() as 'BUY' | 'SELL',
          size: f.size,
          price: f.price,
          fee: f.fee,
          createdAt: f.createdAt,
          liquidity: f.liquidity,
          type: f.type || 'LIMIT',
        }))
        .sort(
          (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    } catch (error) {
      console.error('Error fetching fills:', error);
      throw error;
    }
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return !!dydxWalletService.getAddress();
  }

  /**
   * Format time ago from timestamp
   */
  formatTimeAgo(timestamp: string): string {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(diff / 604800000);

    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return `${weeks}w`;
  }

  /**
   * Calculate order value
   */
  calculateOrderValue(size: string, price: string): string {
    return (parseFloat(size) * parseFloat(price)).toFixed(2);
  }

  /**
   * Calculate fill percentage
   */
  calculateFillPercentage(filledSize: string, totalSize: string): number {
    const filled = parseFloat(filledSize);
    const total = parseFloat(totalSize);
    return total > 0 ? (filled / total) * 100 : 0;
  }
}

export const dydxOrderService = new DydxOrderService();
