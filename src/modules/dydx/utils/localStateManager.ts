import { dydxWalletService } from '../service/dydxWalletService';
import { webSocketManager } from '../utils/WebSocketManager';

export interface Position {
  market: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
  liquidationPrice?: string;
  leverage?: string;
}

export interface OpenOrder {
  id: string;
  clientId: number;
  orderFlags: number;
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
  goodTilBlock?: number;
  goodTilBlockTime?: string;
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
  isOptimistic?: boolean;
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

export interface SubaccountData {
  positions: Position[];
  openOrders: OpenOrder[];
  fills: Fill[];
  orderHistory: HistoricalOrder[];
}

type StateChangeListener = (data: SubaccountData) => void;

class LocalStateManager {
  private static instance: LocalStateManager;

  private positions: Map<string, Position> = new Map();
  private openOrders: Map<string, OpenOrder> = new Map();
  private fills: Fill[] = [];
  private orderHistory: Map<string, HistoricalOrder> = new Map();

  private unsubscribe: (() => void) | null = null;
  private listeners: Set<StateChangeListener> = new Set();
  private isInitialized = false;
  private isLoading = false;
  private currentAddress: string | null = null;
  private currentSubaccount: number = 0;

  private notifyTimeout: NodeJS.Timeout | null = null;
  private pendingNotification = false;

  private constructor() {}

  static getInstance(): LocalStateManager {
    if (!LocalStateManager.instance) {
      LocalStateManager.instance = new LocalStateManager();
    }
    return LocalStateManager.instance;
  }

  async initialize(address: string, subaccountNumber: number): Promise<void> {
    if (
      this.isInitialized &&
      this.currentAddress === address &&
      this.currentSubaccount === subaccountNumber
    ) {
      return;
    }

    if (this.currentAddress !== address || this.currentSubaccount !== subaccountNumber) {
      this.reset();
    }

    this.currentAddress = address;
    this.currentSubaccount = subaccountNumber;
    this.isLoading = true;
    this.subscribeToSubaccount(address, subaccountNumber);

    try {
      await this.fetchInitialData(address, subaccountNumber);
      this.isInitialized = true;
    } catch (err) {
      console.error('[LocalStateManager] Initialization failed:', err);
    } finally {
      this.isLoading = false;
      this.notifyListeners();
    }
  }

  private async fetchInitialData(address: string, subaccountNumber: number): Promise<void> {
    const indexer = dydxWalletService.getIndexerClient();
    if (!indexer) {
      throw new Error('Indexer not available');
    }

    try {
      const [subaccountData, ordersData, fillsData] = await Promise.all([
        indexer.account.getSubaccount(address, subaccountNumber),
        indexer.account.getSubaccountOrders(
          address,
          subaccountNumber,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          50,
          undefined,
          undefined,
          undefined
        ),
        indexer.account.getSubaccountFills(address, subaccountNumber, undefined, undefined, 50),
      ]);

      const openPositions = subaccountData?.subaccount?.openPerpetualPositions;
      if (openPositions && typeof openPositions === 'object') {
        Object.entries(openPositions).forEach(([market, position]: [string, any]) => {
          this.positions.set(market, position as Position);
        });
      }

      if (ordersData && Array.isArray(ordersData)) {
        ordersData.forEach((order: any) => {
          const isOpen = ['OPEN', 'PARTIALLY_FILLED', 'BEST_EFFORT_OPEN'].includes(order.status);

          if (isOpen) {
            const mappedOrder = this.mapToOpenOrder(order);
            this.openOrders.set(mappedOrder.id, mappedOrder);
          }

          const histOrder = this.mapToHistoricalOrder(order);
          this.orderHistory.set(order.id, histOrder);
        });
      }

      if (fillsData?.fills && Array.isArray(fillsData.fills)) {
        this.fills = fillsData.fills.map(this.mapToFill).slice(0, 50);
      }
    } catch (error) {
      console.error('[LocalStateManager] Error fetching initial data:', error);
      throw error;
    }
  }

  private subscribeToSubaccount(address: string, subaccountNumber: number): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    this.unsubscribe = webSocketManager.subscribe(
      'v4_subaccounts',
      message => this.handleSubaccountUpdate(message),
      `${address}/${subaccountNumber}`,
      false
    );
  }

  private handleSubaccountUpdate(message: any): void {
    try {
      const contents = message.contents;
      if (!contents) return;

      let stateChanged = false;
      if (contents.perpetualPositions) {
        contents.perpetualPositions.forEach((position: any) => {
          const market = position.market;
          const size = parseFloat(position.size || '0');

          if (size === 0) {
            if (this.positions.has(market)) {
              this.positions.delete(market);
              stateChanged = true;
            }
          } else {
            this.positions.set(market, {
              market,
              side: position.side,
              size: position.size,
              entryPrice: position.entryPrice,
              unrealizedPnl: position.unrealizedPnl,
              realizedPnl: position.realizedPnl,
              liquidationPrice: position.liquidationPrice,
              leverage: position.leverage,
            });
            stateChanged = true;
          }
        });
      }

      if (contents.orders) {
        contents.orders.forEach((order: any) => {
          const mappedOrder = this.mapToOpenOrder(order);
          const clientId = mappedOrder.clientId;
          for (const [key, val] of this.openOrders) {
            if (val.clientId === clientId && key.startsWith('temp_')) {
              this.openOrders.delete(key);
              this.orderHistory.delete(key);
              break;
            }
          }

          if (['OPEN', 'PARTIALLY_FILLED', 'BEST_EFFORT_OPEN'].includes(mappedOrder.status)) {
            this.openOrders.set(mappedOrder.id, mappedOrder);
          } else {
            this.openOrders.delete(mappedOrder.id);
          }

          const histOrder = this.mapToHistoricalOrder(order);
          this.orderHistory.set(histOrder.id, histOrder);
          stateChanged = true;
        });
      }

      if (contents.fills) {
        contents.fills.forEach((fill: any) => {
          const mappedFill = this.mapToFill(fill);
          if (!this.fills.find(f => f.id === mappedFill.id)) {
            this.fills.unshift(mappedFill);
          }
        });
        this.fills = this.fills.slice(0, 50);
        stateChanged = true;
      }

      if (stateChanged) {
        this.debouncedNotify();
      }
    } catch (error) {
      console.error('[LocalStateManager] Error handling subaccount update:', error);
    }
  }

  private debouncedNotify(): void {
    this.pendingNotification = true;

    if (this.notifyTimeout) {
      return;
    }

    this.notifyTimeout = setTimeout(() => {
      if (this.pendingNotification) {
        this.notifyListeners();
        this.pendingNotification = false;
      }
      this.notifyTimeout = null;
    }, 100);
  }

  handleOrderPlaced(orderParams: {
    market: string;
    side: 'BUY' | 'SELL';
    type: string;
    size: string;
    price: string;
    clientId: number;
    triggerPrice?: string;
  }): void {
    const tempId = `temp_${orderParams.clientId}`;

    const tempOrder: OpenOrder = {
      id: tempId,
      clientId: orderParams.clientId,
      orderFlags: 0,
      market: orderParams.market,
      side: orderParams.side,
      type: orderParams.type,
      size: orderParams.size,
      price: orderParams.price,
      filledSize: '0',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      triggerPrice: orderParams.triggerPrice,
    };

    this.openOrders.set(tempId, tempOrder);
    const historicalOrder = this.mapOpenOrderToHistorical(tempOrder);
    this.orderHistory.set(tempId, historicalOrder);

    this.notifyListeners();
  }

  handleOrderCancelling(orderId: string, clientId?: number): void {
    let found = false;

    if (this.openOrders.has(orderId)) {
      const order = this.openOrders.get(orderId)!;
      order.status = 'CANCELLING';
      this.openOrders.set(orderId, order);
      found = true;
    } else if (clientId) {
      for (const [key, val] of this.openOrders) {
        if (val.clientId === clientId) {
          val.status = 'CANCELLING';
          this.openOrders.set(key, val);
          found = true;
          break;
        }
      }
    }

    if (found) {
      this.notifyListeners();
    }
  }

  handleOrderCancelFailed(orderId: string, clientId?: number): void {
    if (this.openOrders.has(orderId)) {
      const order = this.openOrders.get(orderId)!;
      order.status = 'OPEN';
      this.openOrders.set(orderId, order);
    } else if (clientId) {
      for (const [key, val] of this.openOrders) {
        if (val.clientId === clientId) {
          val.status = 'OPEN';
          this.openOrders.set(key, val);
          break;
        }
      }
    }
    this.notifyListeners();
  }

  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());

    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): SubaccountData {
    return {
      positions: Array.from(this.positions.values()),
      openOrders: Array.from(this.openOrders.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      fills: [...this.fills],
      orderHistory: Array.from(this.orderHistory.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    };
  }

  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  getIsLoading(): boolean {
    return this.isLoading;
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[LocalStateManager] Error in listener:', error);
      }
    });
  }

  reset(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.notifyTimeout) {
      clearTimeout(this.notifyTimeout);
      this.notifyTimeout = null;
    }
    this.positions.clear();
    this.openOrders.clear();
    this.fills = [];
    this.orderHistory.clear();
    this.listeners.clear();
    this.isInitialized = false;
    this.isLoading = false;
    this.currentAddress = null;
    this.currentSubaccount = 0;
    this.pendingNotification = false;
  }

  private mapToOpenOrder(raw: any): OpenOrder {
    return {
      id: raw.id,
      clientId: Number(raw.clientId),
      orderFlags: Number(raw.orderFlags || 0),
      market: raw.ticker,
      side: raw.side.toUpperCase() as 'BUY' | 'SELL',
      type: raw.type,
      size: raw.size,
      price: raw.price,
      filledSize: raw.totalFilled || '0',
      status: raw.status,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt || raw.createdAt,
      triggerPrice: raw.triggerPrice,
      goodTilBlock: raw.goodTilBlock ? Number(raw.goodTilBlock) : undefined,
      goodTilBlockTime: raw.goodTilBlockTime,
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
      isOptimistic: false,
    };
  }

  private mapOpenOrderToHistorical(order: OpenOrder): HistoricalOrder {
    return {
      id: order.id,
      clientId: order.clientId,
      market: order.market,
      side: order.side,
      type: order.type,
      size: order.size,
      price: order.price,
      filledSize: order.filledSize,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      triggerPrice: order.triggerPrice,
      timeInForce: 'GTT',
    };
  }
}

export const localStateManager = LocalStateManager.getInstance();
