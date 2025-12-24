import { IndexerClient } from '@dydxprotocol/v4-client-js';

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
  orderId?: string;
  clientMetadata?: string;
}

export interface OpenOrder {
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
  triggerPrice?: string;
  goodTilBlockTime?: string;
  goodTilBlock?: number;
  orderFlags: number;
  timeInForce?: string;
  postOnly?: boolean;
  reduceOnly?: boolean;
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
  updatedAt: string;
  triggerPrice?: string;
  timeInForce?: string;
  goodTilBlockTime?: string;
}

export interface Position {
  market: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
  netFunding?: string;
  sumOpen?: string;
  sumClose?: string;
  exitPrice?: string;
}

export interface AssetPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: string;
  assetId: string;
}

export interface SubaccountData {
  positions?: Position[];
  assetPositions?: AssetPosition[];
  orders?: OpenOrder[];
  fills?: Fill[];
}

class DydxDataService {
  private getIndexer(): IndexerClient {
    const indexer = dydxWalletService.getIndexerClient();
    if (!indexer) {
      throw new Error('Indexer client not initialized');
    }
    return indexer;
  }

  private getAddressAndSubaccount() {
    const address = dydxWalletService.getAddress();
    const subaccountNumber = dydxWalletService.getSubaccountNumber() ?? 0;
    if (!address) {
      throw new Error('Wallet not connected');
    }
    return { address, subaccountNumber };
  }

  async fetchOpenOrders(limit?: number, returnLatestOrders: boolean = true): Promise<OpenOrder[]> {
    const indexer = this.getIndexer();
    const { address, subaccountNumber } = this.getAddressAndSubaccount();

    const response = await indexer.account.getSubaccountOrders(
      address,
      subaccountNumber,
      undefined, // ticker
      undefined, // tickerType (default: PERPETUAL)
      undefined, // side
      undefined, // status - we'll filter client-side for better control
      undefined, // type
      limit,
      undefined, // goodTilBlockBeforeOrAt
      undefined, // goodTilBlockTimeBeforeOrAt
      returnLatestOrders
    );

    const openStatuses = ['OPEN', 'PARTIALLY_FILLED', 'BEST_EFFORT_OPEN', 'UNTRIGGERED'];
    const openOrders = response.filter((o: any) => openStatuses.includes(o.status));

    return openOrders.map((o: any) => ({
      id: o.id,
      clientId: Number(o.clientId),
      market: o.ticker,
      side: o.side.toUpperCase() as 'BUY' | 'SELL',
      type: o.type,
      size: o.size,
      price: o.price,
      filledSize: o.totalFilled || '0',
      status: o.status,
      createdAt: o.createdAt,
      triggerPrice: o.triggerPrice,
      goodTilBlockTime: o.goodTilBlockTime,
      goodTilBlock: o.goodTilBlock,
      orderFlags: o.orderFlags || 0,
      timeInForce: o.timeInForce,
      postOnly: o.postOnly,
      reduceOnly: o.reduceOnly,
    }));
  }

  async cancelOrder(orderId: string): Promise<void> {
    const compositeClient = dydxWalletService.getCompositeClient();
    const subaccountInfo = dydxWalletService.getSubaccountInfo();

    if (!compositeClient || !subaccountInfo) {
      throw new Error('Client not ready for trading');
    }

    const orders = await this.fetchOpenOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      throw new Error('Order not found or already closed');
    }

    let goodTilBlock: number | undefined;
    let goodTilBlockTime: number | undefined;

    if (order.goodTilBlock) {
      const currentHeight = await compositeClient.validatorClient.get.latestBlockHeight();
      goodTilBlock = currentHeight + 20;
    } else if (order.goodTilBlockTime) {
      const datetime = new Date(order.goodTilBlockTime);
      goodTilBlockTime = Math.round(datetime.getTime() / 1000);
    }

    const market = order.market.includes('-') ? order.market.split('-')[0] : order.market;

    await compositeClient.cancelOrder(
      subaccountInfo,
      order.clientId,
      order.orderFlags,
      market,
      goodTilBlock ?? 0,
      goodTilBlockTime ?? 0
    );
  }

  async fetchFills(limit: number = 50, createdBeforeOrAt?: string): Promise<Fill[]> {
    const indexer = this.getIndexer();
    const { address, subaccountNumber } = this.getAddressAndSubaccount();

    const response = await indexer.account.getSubaccountFills(
      address,
      subaccountNumber,
      undefined, // ticker
      undefined, // tickerType (default: PERPETUAL)
      limit,
      undefined, // createdBeforeOrAtHeight
      createdBeforeOrAt
    );

    return response.fills.map((f: any) => ({
      id: f.id,
      market: f.market,
      side: f.side.toUpperCase() as 'BUY' | 'SELL',
      size: f.size,
      price: f.price,
      fee: f.fee,
      createdAt: f.createdAt,
      liquidity: f.liquidity as 'TAKER' | 'MAKER',
      type: f.type || 'LIMIT',
      orderId: f.orderId,
      clientMetadata: f.clientMetadata,
    }));
  }

  async fetchHistoricalOrders(
    limit: number = 50,
    goodTilBlockTimeBeforeOrAt?: string
  ): Promise<HistoricalOrder[]> {
    const indexer = this.getIndexer();
    const { address, subaccountNumber } = this.getAddressAndSubaccount();

    const response = await indexer.account.getSubaccountOrders(
      address,
      subaccountNumber,
      undefined, // ticker
      undefined, // tickerType
      undefined, // side
      undefined, // status (fetch all for history)
      undefined, // type
      limit,
      undefined, // goodTilBlockBeforeOrAt
      goodTilBlockTimeBeforeOrAt,
      true // returnLatestOrders
    );

    return response.map((o: any) => ({
      id: o.id,
      clientId: Number(o.clientId),
      market: o.ticker,
      side: o.side.toUpperCase() as 'BUY' | 'SELL',
      type: o.type,
      size: o.size,
      price: o.price,
      filledSize: o.totalFilled || '0',
      status: o.status,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt || o.createdAt,
      triggerPrice: o.triggerPrice,
      timeInForce: o.timeInForce,
      goodTilBlockTime: o.goodTilBlockTime,
    }));
  }

  async fetchPositions(
    status: 'OPEN' | 'CLOSED' | null = 'OPEN',
    limit?: number
  ): Promise<Position[]> {
    const indexer = this.getIndexer();
    const { address, subaccountNumber } = this.getAddressAndSubaccount();

    const response = await indexer.account.getSubaccountPerpetualPositions(
      address,
      subaccountNumber,
      status as any,
      limit,
      undefined, // createdBeforeOrAtHeight
      undefined // createdBeforeOrAt
    );

    return response.positions.map((p: any) => ({
      market: p.market,
      side: p.side as 'LONG' | 'SHORT',
      size: p.size,
      entryPrice: p.entryPrice,
      unrealizedPnl: p.unrealizedPnl || '0',
      realizedPnl: p.realizedPnl || '0',
      netFunding: p.netFunding,
      sumOpen: p.sumOpen,
      sumClose: p.sumClose,
      exitPrice: p.exitPrice,
    }));
  }

  async fetchAssetPositions(
    status: 'OPEN' | 'CLOSED' | null = 'OPEN',
    limit?: number
  ): Promise<AssetPosition[]> {
    const indexer = this.getIndexer();
    const { address, subaccountNumber } = this.getAddressAndSubaccount();

    const response = await indexer.account.getSubaccountAssetPositions(
      address,
      subaccountNumber,
      status as any,
      limit,
      undefined,
      undefined
    );

    return response.positions.map((p: any) => ({
      symbol: p.symbol,
      side: p.side as 'LONG' | 'SHORT',
      size: p.size,
      assetId: p.assetId,
    }));
  }

  async fetchSubaccountData(): Promise<SubaccountData> {
    const indexer = this.getIndexer();
    const { address, subaccountNumber } = this.getAddressAndSubaccount();
    const subaccount = await indexer.account.getSubaccount(address, subaccountNumber);

    return {
      positions:
        subaccount.openPerpetualPositions?.map((p: any) => ({
          market: p.market,
          side: p.side as 'LONG' | 'SHORT',
          size: p.size,
          entryPrice: p.entryPrice,
          unrealizedPnl: p.unrealizedPnl || '0',
          realizedPnl: p.realizedPnl || '0',
        })) || [],
      assetPositions:
        subaccount.assetPositions?.map((p: any) => ({
          symbol: p.symbol,
          side: p.side as 'LONG' | 'SHORT',
          size: p.size,
          assetId: p.assetId,
        })) || [],
    };
  }

  async fetchHistoricalPnl(
    createdBeforeOrAt?: string,
    createdOnOrAfter?: string,
    limit: number = 100
  ): Promise<any[]> {
    const indexer = this.getIndexer();
    const { address, subaccountNumber } = this.getAddressAndSubaccount();

    const response = await indexer.account.getSubaccountHistoricalPNLs(
      address,
      subaccountNumber,
      undefined, // createdBeforeOrAtHeight
      createdBeforeOrAt,
      undefined, // createdOnOrAfterHeight
      createdOnOrAfter,
      limit
    );

    return response.historicalPnl || [];
  }
}

export const dydxDataService = new DydxDataService();
