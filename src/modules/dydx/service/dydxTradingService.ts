import {
  CompositeClient,
  LocalWallet,
  OrderExecution,
  OrderSide,
  OrderTimeInForce,
  OrderType,
  SubaccountInfo,
} from '@dydxprotocol/v4-client-js';
import { Order_TimeInForce } from '@dydxprotocol/v4-proto/src/codegen/dydxprotocol/clob/order';
import { Long } from '@dydxprotocol/v4-proto/src/codegen/helpers';

import { walletService } from '../../walletconnect/services/walletService';
import { useWebSocketStore } from '../store/websocketStore';
import {
  type MarketData,
  type OrderSideEnum,
  type PlaceOrderParams,
  type Position,
  SUBACCOUNT_CONSTANTS,
  type TriggerParams,
} from '../types/trading.types';
import { dydxSubaccountService } from './dydxSubaccountService';
import { dydxWalletService } from './dydxWalletService';

const TRADING_CONFIG = {
  DEFAULT_SLIPPAGE: 0.05,
  SHORT_BLOCK_FORWARD: 19,
  SHORT_BLOCK_WINDOW: 20,
  SHORT_TERM_BLOCKS: 19,
  DEFAULT_STATEFUL_EXPIRY_SECONDS: 95 * 24 * 3600,
  CLOSE_POSITION_SLIPPAGE: 0.03,
  MAX_STATEFUL_EXPIRY_SECONDS: 95 * 24 * 3600,
  ISOLATED_FEE_BUFFER: 0.02,
  TRANSFER_CONFIRM_POLL_MS: 400,
  TRANSFER_CONFIRM_MAX_ATTEMPTS: 37,
  TRANSFER_WS_GRACE_MS: 2500,
} as const;

const CONDITIONAL_ORDER_TYPES = new Set([
  'STOP_MARKET',
  'STOP_LIMIT',
  'TAKE_PROFIT_MARKET',
  'TAKE_PROFIT_LIMIT',
]);

const MARKET_CONDITIONAL_TYPES = new Set(['STOP_MARKET', 'TAKE_PROFIT_MARKET']);

const SHORT_TERM_FLAG = 0;

type OrderCategory = {
  isMarket: boolean;
  isConditional: boolean;
  isMarketConditional: boolean;
  isLimit: boolean;
};

interface IsolatedTransferContext {
  client: CompositeClient;
  address: string;
  subaccountNumber: number;
  size: number;
  marketInfo: MarketData;
  params: PlaceOrderParams;
  orderCategory: OrderCategory;
}

interface AtomicTransferOrderContext {
  client: CompositeClient;
  subaccount: SubaccountInfo;
  localWallet: LocalWallet;
  params: PlaceOrderParams;
  clientId: number;
  price: number;
  size: number;
  triggerPrice?: number;
  orderCategory: OrderCategory;
  transferAmount: number;
  address?: string;
  subaccountNumber: number;
  marketInfo: MarketData;
}

interface TriggerOrderResult {
  success: boolean;
  clientId?: string;
  transactionHash?: string;
  error?: string;
  userMessage?: string;
  retryable?: boolean;
}

export interface SetTriggersResult {
  success: boolean;
  results: {
    takeProfit?: TriggerOrderResult;
    stopLoss?: TriggerOrderResult;
  };
  error?: string;
}

class DydxTradingService {
  private clientIdCounter = Math.floor(Math.random() * 0x7fffffff);
  private sweepingSubaccounts = new Set<number>();

  private async getClientAndWallet() {
    const client = await dydxWalletService.getCompositeClient();
    const address = dydxWalletService.getAddress();
    if (!client || !address) throw new Error('Wallet not connected');
    const localWallet = this.getSigningWallet();
    return { client, address, localWallet };
  }

  async placeOrder(params: PlaceOrderParams, marketInfo?: MarketData) {
    try {
      const { client, address, localWallet } = await this.getClientAndWallet();

      if (!marketInfo) throw new Error('Market information is required');

      const subaccountNumber =
        params.subaccountNumber ?? dydxWalletService.getActiveSubaccountNumber();
      const subaccount = SubaccountInfo.forLocalWallet(localWallet, subaccountNumber);

      const clientId = params.clientId ?? this.generateClientId();
      const size = typeof params.size === 'string' ? parseFloat(params.size) : params.size;
      const orderCategory = this.categorizeOrder(params.type);

      this.validateReduceOnlyConstraints(params);
      this.validatePostOnlyConstraints(params);

      const needsTransferCheck = subaccountNumber >= 128 && !!params.leverage;

      const [price, transferAmount] = await Promise.all([
        this.resolveOrderPrice(params, marketInfo, orderCategory),
        needsTransferCheck
          ? this.getRequiredTransferAmount({
              client,
              address,
              subaccountNumber,
              size,
              marketInfo,
              params,
              orderCategory,
            })
          : Promise.resolve(null),
      ]);

      const triggerPrice = params.triggerPrice
        ? this.roundPrice(params.triggerPrice, marketInfo.tickSize!)
        : undefined;

      let result: any;

      if (transferAmount !== null) {
        result = await this.placeOrderWithAtomicTransfer({
          client,
          subaccount,
          localWallet,
          params,
          clientId,
          price,
          size,
          triggerPrice,
          orderCategory,
          transferAmount,
          address,
          subaccountNumber,
          marketInfo,
        });
      } else if (orderCategory.isMarket) {
        result = await this.placeMarketOrder(client, subaccount, params, clientId, price, size);
      } else if (orderCategory.isConditional) {
        result = await this.placeConditionalOrder(
          client,
          subaccount,
          params,
          clientId,
          price,
          size,
          triggerPrice
        );
      } else {
        result = await this.placeLimitOrder(client, subaccount, params, clientId, price, size);
      }

      return {
        success: true,
        clientId: clientId.toString(),
        transactionHash: this.extractHash(result.hash),
        optimisticOrder: {
          clientId: clientId.toString(),
          ticker: params.market,
          side: params.side,
          size: size.toString(),
          price: price.toString(),
          status: 'PENDING_BROADCAST',
          type: params.type,
          createdAt: new Date().toISOString(),
          id: `temp-${clientId}`,
        },
      };
    } catch (error: any) {
      console.error('Order placement error:', error);

      const subaccountNumber =
        params.subaccountNumber ?? dydxWalletService.getActiveSubaccountNumber();
      if (subaccountNumber >= 128) {
        this.sweepIsolatedSubaccountAsync(subaccountNumber);
      }

      const { userMessage, retryable } = this.classifyError(error);
      return {
        success: false,
        error: error.message || 'Unknown error',
        userMessage,
        retryable,
      };
    }
  }

  private async resolveOrderPrice(
    params: PlaceOrderParams,
    marketInfo: MarketData,
    orderCategory: OrderCategory
  ): Promise<number> {
    let price = params.price ?? 0;
    if (orderCategory.isMarket || !price) {
      price = await this.getSlippagePrice(params.market, params.side, params.slippageTolerance);
    }
    return this.roundPrice(price, marketInfo.tickSize!);
  }

  private async getRequiredTransferAmount({
    address,
    subaccountNumber,
    size,
    marketInfo,
    params,
    orderCategory,
  }: IsolatedTransferContext): Promise<number | null> {
    const oraclePrice = parseFloat(marketInfo.oraclePrice);
    const notionalValue = size * oraclePrice;
    const requiredMargin = notionalValue / params.leverage!;

    const isLongTermOrder = !orderCategory.isMarket;
    const targetEquity = isLongTermOrder ? Math.max(requiredMargin, 20.1) : requiredMargin;
    const targetEquityWithBuffer = targetEquity * (1 + TRADING_CONFIG.ISOLATED_FEE_BUFFER);

    const indexer = dydxWalletService.getIndexerClient();

    // Both calls are independent — run in parallel to save one RTT
    const [isoResult, crossResult] = await Promise.allSettled([
      indexer.account.getSubaccount(address, subaccountNumber),
      indexer.account.getSubaccount(address, SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT),
    ]);

    const currentEquity =
      isoResult.status === 'fulfilled' ? parseFloat(isoResult.value.subaccount?.equity || '0') : 0;

    if (currentEquity >= targetEquityWithBuffer) return null;

    const shortfall = targetEquityWithBuffer - currentEquity;

    if (crossResult.status === 'rejected') {
      throw new Error(
        `Failed to read cross margin balance: ${(crossResult.reason as Error).message}`
      );
    }
    const crossFreeCollateral = parseFloat(crossResult.value.subaccount?.freeCollateral || '0');

    if (crossFreeCollateral < shortfall) {
      throw new Error(
        `Insufficient free collateral in Cross Margin. Need $${shortfall.toFixed(2)}, available $${crossFreeCollateral.toFixed(2)}`
      );
    }

    return shortfall;
  }

  private async placeOrderWithAtomicTransfer({
    client,
    subaccount,
    localWallet,
    params,
    clientId,
    size,
    triggerPrice,
    orderCategory,
    transferAmount,
    address,
    subaccountNumber,
    marketInfo,
  }: AtomicTransferOrderContext) {
    if (orderCategory.isMarket) {
      console.log(
        `[atomic] Market+isolated: sending transfer tx first ($${transferAmount.toFixed(2)} → subaccount ${subaccountNumber})`
      );

      const sourceSubaccountNumber = SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT;
      const sourceSubaccount = SubaccountInfo.forLocalWallet(localWallet, sourceSubaccountNumber);

      const assetId = 0;
      const amountInBaseUnits = Math.round(transferAmount * 1_000_000);

      const transferResult = await client.validatorClient.post.transfer(
        sourceSubaccount,
        address!,
        subaccountNumber,
        assetId,
        new Long(amountInBaseUnits)
      );

      console.log(`[atomic] Transfer tx broadcast: ${this.extractHash(transferResult.hash)}`);

      const walletAddress = address ?? dydxWalletService.getAddress()!;
      await this.waitForTransferToLand(
        client,
        walletAddress,
        subaccountNumber,
        transferAmount,
        SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT
      );

      const oraclePrice = parseFloat(marketInfo.oraclePrice);
      const slippage = params.slippageTolerance ?? TRADING_CONFIG.DEFAULT_SLIPPAGE;
      const normalizedSide = params.side.toUpperCase().trim();
      let freshPrice =
        normalizedSide === 'BUY' ? oraclePrice * (1 + slippage) : oraclePrice * (1 - slippage);
      freshPrice = this.roundPrice(freshPrice, marketInfo.tickSize!);
      const height = await this.getFreshBlockHeight(client);
      const goodTilBlock = height + TRADING_CONFIG.SHORT_BLOCK_FORWARD;

      console.log(
        `[atomic] Transfer confirmed → placing short-term order at block ${height} | goodTilBlock = ${goodTilBlock} | freshPrice = ${freshPrice}`
      );

      return client.placeShortTermOrder(
        subaccount,
        params.market,
        this.normalizeToOrderSide(params.side),
        freshPrice,
        size,
        clientId,
        goodTilBlock,
        Order_TimeInForce.TIME_IN_FORCE_IOC,
        params.reduceOnly || false
      );
    }

    const safeDuration = Math.min(
      params.goodTilTimeInSeconds || TRADING_CONFIG.DEFAULT_STATEFUL_EXPIRY_SECONDS,
      TRADING_CONFIG.MAX_STATEFUL_EXPIRY_SECONDS
    );
    let timeInForce = OrderTimeInForce.GTT;
    if (params.timeInForce === 'IOC') timeInForce = OrderTimeInForce.IOC;
    if (params.reduceOnly || orderCategory.isMarketConditional) timeInForce = OrderTimeInForce.IOC;

    const orderPayload = {
      subaccountNumber,
      marketId: params.market,
      type: this.mapOrderType(params.type),
      side: this.normalizeToOrderSide(params.side),
      price: this.roundPrice(params.price ?? triggerPrice ?? 0, marketInfo.tickSize!),
      size,
      clientId,
      timeInForce,
      goodTilTimeInSeconds: safeDuration,
      execution: orderCategory.isMarketConditional ? OrderExecution.IOC : OrderExecution.DEFAULT,
      postOnly: params.postOnly || false,
      reduceOnly: params.reduceOnly || false,
      triggerPrice: triggerPrice ?? 0,
    };

    console.log(`[atomic] Transfer+stateful order via bulkCancelAndTransferAndPlaceStatefulOrders`);
    const result = await client.bulkCancelAndTransferAndPlaceStatefulOrders(
      subaccount,
      [],
      {
        sourceSubaccountNumber: SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT,
        recipientSubaccountNumber: subaccountNumber,
        transferAmount: transferAmount.toFixed(6),
      },
      [orderPayload]
    );

    console.log(`[atomic] Transfer+order tx: ${this.extractHash(result.hash)}`);
    return result;
  }

  private decodeQuantumsToUSD(quantums: Uint8Array): number {
    if (!quantums || quantums.length <= 1) return 0;
    const negated = (quantums[0] & 1) === 1;
    const hex = Array.from(quantums.slice(1))
      .map((b: any) => b.toString(16).padStart(2, '0'))
      .join('');
    if (!hex) return 0;
    const abs = BigInt(`0x${hex}`);
    const signedBigInt = negated ? -abs : abs;
    return Number(signedBigInt) / 1_000_000;
  }

  private async waitForTransferToLand(
    client: any,
    address: string,
    subaccountNumber: number,
    minEquity: number,
    parentSubaccountNumber: number = 0
  ): Promise<void> {
    const { TRANSFER_CONFIRM_POLL_MS, TRANSFER_CONFIRM_MAX_ATTEMPTS, TRANSFER_WS_GRACE_MS } =
      TRADING_CONFIG;
    const maxWaitMs = TRANSFER_CONFIRM_MAX_ATTEMPTS * TRANSFER_CONFIRM_POLL_MS;

    const parentKey = `parent_subaccount_${address}_${parentSubaccountNumber}`;
    const isConditionMet = (state: any) => {
      const parentData = state.parentSubaccounts.get(parentKey);
      if (!parentData?.childSubaccounts) return false;

      const child = parentData.childSubaccounts.find(
        (c: any) => c.subaccountNumber === subaccountNumber
      );
      if (!child) return false;

      const equity = parseFloat(child.equity || '0');
      const freeCollateral = parseFloat(child.freeCollateral || '0');
      return equity >= minEquity * 0.99 || freeCollateral >= minEquity * 0.99;
    };

    if (isConditionMet(useWebSocketStore.getState())) {
      console.log(`[atomic] [reflection] Transfer already reflected in store state`);
      return;
    }

    console.log(
      `[atomic] [reflection] Waiting up to ${maxWaitMs / 1000}s for transfer ($${minEquity.toFixed(2)}) via WS/Polling`
    );

    return new Promise((resolve, reject) => {
      let resolved = false;
      let validatorPollInterval: ReturnType<typeof setInterval> | null = null;
      let pollInterval: ReturnType<typeof setInterval> | null = null;

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(
            new Error(
              `Transfer of $${minEquity.toFixed(2)} to isolated subaccount ${subaccountNumber} did not confirm within ` +
                `${(maxWaitMs / 1000).toFixed(0)}s. Please check your transaction history.`
            )
          );
        }
      }, maxWaitMs);

      const cleanup = () => {
        resolved = true;
        unsubscribe();
        if (validatorPollInterval) clearInterval(validatorPollInterval);
        if (pollInterval) clearInterval(pollInterval);
        clearTimeout(graceTimeoutId);
        clearTimeout(timeoutId);
      };

      const unsubscribe = useWebSocketStore.subscribe(state => {
        if (isConditionMet(state)) {
          console.log(`[atomic] [reflection] Transfer confirmed via WebSocket update`);
          cleanup();
          resolve();
        }
      });

      const indexer = dydxWalletService.getIndexerClient();
      let pollAttempt = 0;

      const startPolling = () => {
        if (resolved) return;

        validatorPollInterval = setInterval(async () => {
          if (resolved) return;
          try {
            const subaccountResp = await client.validatorClient.get.getSubaccount(
              address,
              subaccountNumber
            );
            if (resolved) return;
            const usdcPosition = subaccountResp?.subaccount?.assetPositions?.find(
              (p: any) => p.assetId === 0
            );
            if (usdcPosition) {
              const usdVal = this.decodeQuantumsToUSD(usdcPosition.quantums);
              if (usdVal >= minEquity * 0.99) {
                console.log(`[atomic] [reflection] Transfer confirmed via Validator polling!`);
                cleanup();
                resolve();
              }
            }
          } catch (e: any) {
            console.log(`[atomic] [reflection] Validator poll error: ${e.message}`);
          }
        }, TRANSFER_CONFIRM_POLL_MS);

        pollInterval = setInterval(async () => {
          if (resolved) return;
          pollAttempt++;
          try {
            const resp = await indexer.account.getSubaccount(address, subaccountNumber);
            if (resolved) return;
            const equity = parseFloat(resp.subaccount?.equity || '0');
            const freeCollateral = parseFloat(resp.subaccount?.freeCollateral || '0');
            if (equity >= minEquity * 0.99 || freeCollateral >= minEquity * 0.99) {
              console.log(
                `[atomic] [reflection] Transfer confirmed via REST fallback (Poll ${pollAttempt})`
              );
              cleanup();
              resolve();
            }
          } catch (e: any) {
            console.log(`[atomic] [reflection] Transfer poll failed: ${e.message}`);
          }
        }, TRANSFER_CONFIRM_POLL_MS * 2);
      };

      const graceTimeoutId = setTimeout(startPolling, TRANSFER_WS_GRACE_MS);
    });
  }

  private async getFreshBlockHeight(client: any): Promise<number> {
    return client.validatorClient.get.latestBlockHeight();
  }

  async closePosition(position: Position, marketInfo?: MarketData) {
    try {
      const closingSide: OrderSideEnum =
        position.side.toUpperCase().trim() === 'LONG' ? 'SELL' : 'BUY';

      const result = await this.placeOrder(
        {
          market: position.market,
          side: closingSide,
          type: 'MARKET',
          size: Math.abs(parseFloat(position.size)),
          reduceOnly: false,
          slippageTolerance: TRADING_CONFIG.CLOSE_POSITION_SLIPPAGE,
          subaccountNumber: position.subaccountNumber,
        },
        marketInfo
      );

      if (
        result.success &&
        position.subaccountNumber !== undefined &&
        position.subaccountNumber >= 128
      ) {
        this.sweepIsolatedSubaccountAsync(position.subaccountNumber);
      }

      return result;
    } catch (error: any) {
      console.error('Close position error:', error);
      const { userMessage, retryable } = this.classifyError(error);
      return {
        success: false,
        error: error.message || 'Failed to close position',
        userMessage,
        retryable,
      };
    }
  }

  private sweepIsolatedSubaccountAsync(subaccountNumber: number): void {
    if (this.sweepingSubaccounts.has(subaccountNumber)) return;
    this.sweepingSubaccounts.add(subaccountNumber);

    (async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await dydxSubaccountService.sweepSubaccountToCross(subaccountNumber);
      } catch (err: any) {
        console.error(
          `[dydxTradingService] Post-close sweep failed for subaccount ${subaccountNumber}:`,
          err.message
        );
      } finally {
        this.sweepingSubaccounts.delete(subaccountNumber);
      }
    })();
  }

  async cancelOrder(order: any) {
    try {
      const { client, localWallet } = await this.getClientAndWallet();
      const orderSubaccountNumber = this.getOrderSubaccountNumber(order);
      const subaccount = SubaccountInfo.forLocalWallet(localWallet, orderSubaccountNumber);

      const clientId = parseInt(order.clientId);
      const orderFlags = parseInt(order.orderFlags);
      const marketId = order.clobPairId || order.ticker;
      const isShortTermOrder = orderFlags === SHORT_TERM_FLAG;

      let goodTilBlock: number | undefined;
      let goodTilTimeInSeconds: number | undefined;

      if (isShortTermOrder) {
        goodTilBlock = order.goodTilBlock ? parseInt(order.goodTilBlock) : undefined;
        goodTilTimeInSeconds = undefined;
      } else {
        goodTilBlock = 0;
        const goodTilBlockTime = order.goodTilBlockTime
          ? Math.floor(new Date(order.goodTilBlockTime).getTime() / 1000)
          : Math.floor((Date.now() + 30000) / 1000);
        const nowInSeconds = Math.floor(Date.now() / 1000);
        goodTilTimeInSeconds = goodTilBlockTime - nowInSeconds;
      }

      const result = await client.cancelOrder(
        subaccount as any,
        clientId,
        orderFlags,
        marketId,
        goodTilBlock,
        goodTilTimeInSeconds
      );

      if (orderSubaccountNumber >= 128) {
        this.sweepIsolatedSubaccountAsync(orderSubaccountNumber);
      }

      return {
        success: true,
        transactionHash: this.extractHash(result.hash),
        message: 'Order cancelled successfully',
      };
    } catch (error: any) {
      console.error('Cancel order error:', error);
      const { userMessage } = this.classifyError(error);
      return {
        success: false,
        error: error.message,
        userMessage,
      };
    }
  }

  async cancelAllOrders(orders: any[]) {
    if (!orders.length) return { success: true, results: [], cancelled: 0, failed: 0 };

    try {
      const { client, localWallet } = await this.getClientAndWallet();
      const subaccount = SubaccountInfo.forLocalWallet(
        localWallet,
        dydxWalletService.getSubaccountNumber()
      );

      const shortTermOrders = orders.filter(o => parseInt(o.orderFlags) === SHORT_TERM_FLAG);
      const statefulOrders = orders.filter(o => parseInt(o.orderFlags) !== SHORT_TERM_FLAG);

      const results: any[] = [];

      const shortTermPromise = (async () => {
        if (!shortTermOrders.length) return;

        const height = await this.getFreshBlockHeight(client);
        const goodTilBlock = height + TRADING_CONFIG.SHORT_BLOCK_FORWARD;

        const byMarket = new Map<string, number[]>();
        for (const order of shortTermOrders) {
          const market = order.ticker || order.clobPairId;
          if (!byMarket.has(market)) byMarket.set(market, []);
          byMarket.get(market)!.push(parseInt(order.clientId));
        }

        const orderBatches = Array.from(byMarket.entries()).map(([marketId, clientIds]) => ({
          marketId,
          clientIds,
        }));

        try {
          const result = await client.batchCancelShortTermOrdersWithMarketId(
            subaccount,
            orderBatches,
            goodTilBlock
          );
          results.push({
            type: 'short_term_batch',
            success: true,
            hash: this.extractHash(result.hash),
          });
        } catch (err: any) {
          console.warn('Batch cancel failed, falling back to individual cancels:', err.message);
          const fallbacks = await Promise.allSettled(shortTermOrders.map(o => this.cancelOrder(o)));
          fallbacks.forEach((r, i) => {
            results.push({
              type: 'short_term_fallback',
              clientId: shortTermOrders[i].clientId,
              success: r.status === 'fulfilled' && r.value.success,
            });
          });
        }
      })();

      const statefulPromise = Promise.allSettled(statefulOrders.map(o => this.cancelOrder(o)));

      const [, statefulResults] = await Promise.all([shortTermPromise, statefulPromise]);

      statefulResults.forEach((r, i) => {
        results.push({
          type: 'stateful',
          clientId: statefulOrders[i].clientId,
          success: r.status === 'fulfilled' && r.value.success,
          error: r.status === 'rejected' ? r.reason?.message : undefined,
        });
      });

      const isolatedSubaccounts = new Set(
        orders.map(o => o.subaccountNumber).filter((n): n is number => n != null && n >= 128)
      );
      for (const subaccountNumber of isolatedSubaccounts) {
        this.sweepIsolatedSubaccountAsync(subaccountNumber);
      }

      const failed = results.filter(r => !r.success).length;
      const cancelled = results.filter(r => r.success).length;

      return {
        success: failed === 0,
        partialSuccess: failed > 0 && cancelled > 0,
        cancelled,
        failed,
        results,
      };
    } catch (error: any) {
      console.error('Cancel all orders error:', error);
      const { userMessage } = this.classifyError(error);
      return {
        success: false,
        error: error.message,
        userMessage,
        cancelled: 0,
        failed: orders.length,
        results: [],
      };
    }
  }

  async closeAllPositions(positions: Position[], marketInfoMap: Record<string, MarketData> = {}) {
    if (!positions.length) return { success: true, results: [], closed: 0, failed: 0 };

    const settlements = await Promise.allSettled(
      positions.map(position => this.closePosition(position, marketInfoMap[position.market]))
    );

    const results = settlements.map((s, i) => ({
      market: positions[i].market,
      success: s.status === 'fulfilled' && s.value.success,
      result: s.status === 'fulfilled' ? s.value : null,
      error: s.status === 'rejected' ? s.reason?.message : null,
    }));

    const failed = results.filter(r => !r.success).length;
    const closed = results.filter(r => r.success).length;

    return {
      success: failed === 0,
      partialSuccess: failed > 0 && closed > 0,
      closed,
      failed,
      results,
    };
  }

  async setTriggers(position: Position, triggers: TriggerParams, marketInfo?: MarketData) {
    const closingSide: OrderSideEnum =
      position.side.toUpperCase().trim() === 'LONG' ? 'SELL' : 'BUY';
    const size = Math.abs(parseFloat(position.size));
    const results: any = {};

    try {
      const jobs: Array<Promise<void>> = [];

      if (triggers.takeProfit?.enabled && triggers.takeProfit?.price) {
        const type =
          triggers.takeProfit.type === 'MARKET' ? 'TAKE_PROFIT_MARKET' : 'TAKE_PROFIT_LIMIT';
        jobs.push(
          this.placeOrder(
            {
              market: position.market,
              side: closingSide,
              type,
              size,
              price: triggers.takeProfit.price,
              triggerPrice: triggers.takeProfit.price,
              reduceOnly: false,
              subaccountNumber: position.subaccountNumber,
            },
            marketInfo
          ).then(r => {
            results.takeProfit = r;
          })
        );
      }

      if (triggers.stopLoss?.enabled && triggers.stopLoss?.price) {
        const type = triggers.stopLoss.type === 'MARKET' ? 'STOP_MARKET' : 'STOP_LIMIT';
        jobs.push(
          this.placeOrder(
            {
              market: position.market,
              side: closingSide,
              type,
              size,
              price: triggers.stopLoss.price,
              triggerPrice: triggers.stopLoss.price,
              reduceOnly: false,
              subaccountNumber: position.subaccountNumber,
            },
            marketInfo
          ).then(r => {
            results.stopLoss = r;
          })
        );
      }

      await Promise.all(jobs);
      return { success: true, results };
    } catch (error: any) {
      console.error('Error setting triggers:', error);
      return { success: false, error: error.message, results };
    }
  }

  private async placeMarketOrder(
    client: any,
    subaccount: any,
    params: PlaceOrderParams,
    clientId: number,
    price: number,
    size: number
  ) {
    const height = await this.getFreshBlockHeight(client);
    const goodTilBlock = height + TRADING_CONFIG.SHORT_BLOCK_FORWARD;
    const side = this.normalizeToOrderSide(params.side);

    return client.placeShortTermOrder(
      subaccount,
      params.market,
      side,
      price,
      size,
      clientId,
      goodTilBlock,
      Order_TimeInForce.TIME_IN_FORCE_IOC,
      params.reduceOnly || false
    );
  }

  private async placeConditionalOrder(
    client: any,
    subaccount: any,
    params: PlaceOrderParams,
    clientId: number,
    price: number,
    size: number,
    triggerPrice?: number
  ) {
    if (!triggerPrice) throw new Error('Trigger price is required for conditional orders');

    const safeDuration = Math.min(
      params.goodTilTimeInSeconds || TRADING_CONFIG.DEFAULT_STATEFUL_EXPIRY_SECONDS,
      TRADING_CONFIG.MAX_STATEFUL_EXPIRY_SECONDS
    );

    const side = this.normalizeToOrderSide(params.side);
    const orderCategory = this.categorizeOrder(params.type);
    const execution = orderCategory.isMarketConditional
      ? OrderExecution.IOC
      : OrderExecution.DEFAULT;

    let timeInForce = OrderTimeInForce.GTT;
    if (params.timeInForce === 'IOC') timeInForce = OrderTimeInForce.IOC;
    if (params.reduceOnly || orderCategory.isMarketConditional) timeInForce = OrderTimeInForce.IOC;

    return client.placeOrder(
      subaccount,
      params.market,
      this.mapOrderType(params.type),
      side,
      price,
      size,
      clientId,
      timeInForce,
      safeDuration,
      execution,
      params.postOnly || false,
      params.reduceOnly || false,
      triggerPrice
    );
  }

  private async placeLimitOrder(
    client: any,
    subaccount: any,
    params: PlaceOrderParams,
    clientId: number,
    price: number,
    size: number
  ) {
    const safeDuration = Math.min(
      params.goodTilTimeInSeconds || TRADING_CONFIG.DEFAULT_STATEFUL_EXPIRY_SECONDS,
      TRADING_CONFIG.MAX_STATEFUL_EXPIRY_SECONDS
    );

    let timeInForce = OrderTimeInForce.GTT;
    if (params.timeInForce === 'IOC') timeInForce = OrderTimeInForce.IOC;
    if (params.reduceOnly) timeInForce = OrderTimeInForce.IOC;

    const side = this.normalizeToOrderSide(params.side);

    return client.placeOrder(
      subaccount,
      params.market,
      OrderType.LIMIT,
      side,
      price,
      size,
      clientId,
      timeInForce,
      safeDuration,
      OrderExecution.DEFAULT,
      params.postOnly || false,
      params.reduceOnly || false,
      undefined
    );
  }

  private validateReduceOnlyConstraints(params: PlaceOrderParams) {
    if (!params.reduceOnly) return;
    if (params.postOnly) throw new Error('Reduce-Only and Post-Only cannot be combined');
  }

  private validatePostOnlyConstraints(params: PlaceOrderParams) {
    if (!params.postOnly) return;
    const isLimitLike =
      params.type === 'LIMIT' ||
      params.type === 'STOP_LIMIT' ||
      params.type === 'TAKE_PROFIT_LIMIT';
    if (!isLimitLike) {
      throw new Error(
        'Post-Only is only valid for Limit, Stop Limit, and Take Profit Limit orders'
      );
    }
  }

  private categorizeOrder(type: string): OrderCategory {
    const t = type.toUpperCase();
    return {
      isMarket: t === 'MARKET',
      isConditional: CONDITIONAL_ORDER_TYPES.has(t),
      isMarketConditional: MARKET_CONDITIONAL_TYPES.has(t),
      isLimit: t === 'LIMIT',
    };
  }

  private normalizeToOrderSide(side: string): OrderSide {
    const normalized = side.toUpperCase().trim();
    if (normalized !== 'BUY' && normalized !== 'SELL') {
      throw new Error(`Invalid side: ${side}. Must be BUY or SELL`);
    }
    return normalized === 'BUY' ? OrderSide.BUY : OrderSide.SELL;
  }

  private mapOrderType(type: string): OrderType {
    const map: Record<string, OrderType> = {
      LIMIT: OrderType.LIMIT,
      MARKET: OrderType.MARKET,
      STOP_LIMIT: OrderType.STOP_LIMIT,
      STOP_MARKET: OrderType.STOP_MARKET,
      TAKE_PROFIT_LIMIT: OrderType.TAKE_PROFIT_LIMIT,
      TAKE_PROFIT_MARKET: OrderType.TAKE_PROFIT_MARKET,
    };
    const t = type.toUpperCase();
    if (!map[t]) throw new Error(`Unknown order type: ${type}`);
    return map[t];
  }

  private async getSlippagePrice(
    ticker: string,
    side: string,
    tolerance: number = TRADING_CONFIG.DEFAULT_SLIPPAGE
  ): Promise<number> {
    const indexer = dydxWalletService.getIndexerClient();
    if (!indexer) throw new Error('Indexer not available');

    const orderbook = await indexer.markets.getPerpetualMarketOrderbook(ticker);
    if (!orderbook.asks?.length || !orderbook.bids?.length) throw new Error('Orderbook empty');

    const normalized = side.toUpperCase().trim();
    const basePrice =
      normalized === 'BUY'
        ? parseFloat(orderbook.asks[0].price)
        : parseFloat(orderbook.bids[0].price);

    return normalized === 'BUY' ? basePrice * (1 + tolerance) : basePrice * (1 - tolerance);
  }

  private roundPrice(value: number, tickSize: string): number {
    const tick = parseFloat(tickSize);
    const decimals = (tickSize.split('.')[1] ?? '').length;
    return parseFloat((Math.round(value / tick) * tick).toFixed(decimals));
  }

  private generateClientId(): number {
    this.clientIdCounter = (this.clientIdCounter + 1) % 0x7fffffff;
    return this.clientIdCounter;
  }

  private extractHash(hash: any): string {
    if (typeof hash === 'string') return hash;
    const data = hash?.data || hash;
    if (Array.isArray(data) || data instanceof Uint8Array) {
      return Array.from(data)
        .map((b: any) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    return 'unknown';
  }

  private getSigningWallet(): LocalWallet {
    const evmSession = walletService.getSession('evm');
    if (!evmSession?.evmAddress) throw new Error('EVM wallet not connected');
    const wallet = walletService.getSigningWallet();
    if (!wallet) {
      throw new Error('Signing wallet not available - please derive dYdX wallet first');
    }
    return wallet;
  }

  private classifyError(error: any): { userMessage: string; retryable: boolean } {
    const msg = error?.message || String(error);

    let userMessage = msg;
    if (msg.includes('NewlyUndercollateralized')) {
      userMessage =
        'Stateful order collateralization check failed. Order size might be too large, please try again with a smaller order or lower leverage.';
    } else if (msg.includes('insufficient')) {
      userMessage = 'Insufficient balance';
    } else if (msg.includes('9003') || msg.includes('reduce-only') || msg.includes('Reduce-only')) {
      userMessage =
        'Reduce-only is currently disabled on dYdX. Using regular market orders instead.';
    } else if (msg.includes('network') || msg.includes('timeout')) {
      userMessage = 'Network error - please try again';
    } else if (msg.includes('Wallet not connected')) {
      userMessage = 'Please connect your wallet';
    } else if (msg.includes('Mnemonic not found')) {
      userMessage = 'Wallet session expired - please reconnect';
    } else if (msg.includes('StatefulOrderTimeWindow')) {
      userMessage = 'Order expiry time is too far in the future. Maximum is 28 days.';
    } else if (msg.includes('did not confirm within')) {
      userMessage = 'Transfer took too long to confirm. Please try again.';
    }

    const retryable =
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('connection') ||
      msg.includes('Indexer not available') ||
      msg.includes('did not confirm within');

    return { userMessage, retryable };
  }

  private getOrderSubaccountNumber(order: any): number {
    if (typeof order.subaccountNumber === 'number') return order.subaccountNumber;
    if (typeof order.subaccountId === 'string' && order.subaccountId.includes('/')) {
      const parts = order.subaccountId.split('/');
      const parsed = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(parsed)) return parsed;
    }
    return dydxWalletService.getSubaccountNumber();
  }
}

export const dydxTradingService = new DydxTradingService();
