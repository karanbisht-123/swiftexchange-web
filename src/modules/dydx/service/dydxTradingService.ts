import {
  LocalWallet,
  OrderExecution,
  OrderSide,
  OrderTimeInForce,
  OrderType,
  SubaccountInfo,
} from '@dydxprotocol/v4-client-js';

import { walletService } from '../../walletconnect/services/walletService';
import {
  type MarketData,
  type OrderSideEnum,
  type PlaceOrderParams,
  type Position,
  type TriggerParams,
} from '../types/trading.types';
import { dydxSubaccountService } from './dydxSubaccountService';
import { dydxWalletService } from './dydxWalletService';

const TRADING_CONFIG = {
  DEFAULT_SLIPPAGE: 0.05,
  SHORT_TERM_BLOCKS: 20,
  DEFAULT_STATEFUL_EXPIRY_SECONDS: 95 * 24 * 3600,
  CLOSE_POSITION_SLIPPAGE: 0.03,
  MAX_STATEFUL_EXPIRY_SECONDS: 95 * 24 * 3600,
} as const;

// Conditional order types that require a trigger price
const CONDITIONAL_ORDER_TYPES = new Set([
  'STOP_MARKET',
  'STOP_LIMIT',
  'TAKE_PROFIT_MARKET',
  'TAKE_PROFIT_LIMIT',
]);

// These conditional types execute as market (IOC) when triggered
const MARKET_CONDITIONAL_TYPES = new Set(['STOP_MARKET', 'TAKE_PROFIT_MARKET']);

// SDK order flags: 0 = SHORT_TERM, 32 = LONG_TERM, 64 = CONDITIONAL
const SHORT_TERM_FLAG = 0;

type OrderCategory = {
  isMarket: boolean;
  isConditional: boolean;
  isLimit: boolean;
};

class DydxTradingService {
  // Random start avoids duplicate clientIds across page reloads
  private clientIdCounter = Math.floor(Math.random() * 0x7fffffff);

  // Core wallet/client helpers 

  private async getClientAndWallet() {
    const client = await dydxWalletService.getCompositeClient();
    const address = dydxWalletService.getAddress();
    if (!client || !address) throw new Error('Wallet not connected');
    const localWallet = this.getSigningWallet();
    return { client, address, localWallet };
  }

  //Place order 

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

      this.validateReduceOnlyConstraints(params, orderCategory);

      let price = params.price ?? 0;
      if (orderCategory.isMarket || !price) {
        price = await this.getSlippagePrice(params.market, params.side, params.slippageTolerance);
      }
      price = this.roundPrice(price, marketInfo.tickSize!);

      // Isolated subaccounts (number >= 128) need enough equity before order placement
      if (subaccountNumber >= 128 && params.leverage) {
        await this.ensureIsolatedSubaccountEquity({
          subaccountNumber,
          size,
          marketInfo,
          params,
          address,
          subaccount,
          orderCategory,
        });
      }

      const triggerPrice = params.triggerPrice
        ? this.roundPrice(params.triggerPrice, marketInfo.tickSize!)
        : undefined;

      let result;
      if (orderCategory.isMarket) {
        result = await this.placeMarketOrder(client, subaccount, params, clientId, price, size);
      } else if (orderCategory.isConditional) {
        result = await this.placeConditionalOrder(
          client, subaccount, params, clientId, price, size, triggerPrice
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
      return {
        success: false,
        error: error.message || 'Unknown error',
        userMessage: this.getUserFriendlyError(error),
        retryable: this.isRetryableError(error),
      };
    }
  }

  // Close position

  async closePosition(position: Position, marketInfo?: MarketData) {
    try {
      const closingSide: OrderSideEnum =
        position.side.toUpperCase().trim() === 'LONG' ? 'SELL' : 'BUY';

      return await this.placeOrder(
        {
          market: position.market,
          side: closingSide,
          type: 'MARKET',
          size: Math.abs(parseFloat(position.size)),
          reduceOnly: false, // reduce-only is disabled on dYdX
          slippageTolerance: TRADING_CONFIG.CLOSE_POSITION_SLIPPAGE,
          subaccountNumber: position.subaccountNumber,
        },
        marketInfo
      );
    } catch (error: any) {
      console.error('Close position error:', error);
      return {
        success: false,
        error: error.message || 'Failed to close position',
        userMessage: this.getUserFriendlyError(error),
        retryable: this.isRetryableError(error),
      };
    }
  }

  // Cancel single order

  async cancelOrder(order: any) {
    try {
      const { client, address, localWallet } = await this.getClientAndWallet();
      const subaccount = {
        address,
        subaccountNumber: dydxWalletService.getSubaccountNumber(),
        signingWallet: localWallet,
      };

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

      return {
        success: true,
        transactionHash: this.extractHash(result.hash),
        message: 'Order cancelled successfully',
      };
    } catch (error: any) {
      console.error('Cancel order error:', error);
      return {
        success: false,
        error: error.message,
        userMessage: this.getUserFriendlyError(error),
      };
    }
  }

  // Cancel all open orders
  // Short-term orders batch into one tx; long-term/conditional go one-by-one (SDK limitation).

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

      // Batch cancel all short-term orders in a single tx
      const shortTermPromise = (async () => {
        if (!shortTermOrders.length) return;

        // Get current block height once for the whole batch
        const height = await client.validatorClient.get.latestBlockHeight();
        const goodTilBlock = height + TRADING_CONFIG.SHORT_TERM_BLOCKS;

        // Group by market ticker — required shape for batchCancelShortTermOrdersWithMarketId
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
          // Batch failed — fall back to individual cancels so we don't leave orders open
          console.warn('Batch cancel failed, falling back to individual cancels:', err.message);
          const fallbacks = await Promise.allSettled(
            shortTermOrders.map(o => this.cancelOrder(o))
          );
          fallbacks.forEach((r, i) => {
            results.push({
              type: 'short_term_fallback',
              clientId: shortTermOrders[i].clientId,
              success: r.status === 'fulfilled' && r.value.success,
            });
          });
        }
      })();

      // Stateful orders cancel in parallel — each is its own tx, no SDK batching available
      const statefulPromises = statefulOrders.map(order =>
        this.cancelOrder(order)
          .then(r => results.push({ type: 'stateful', clientId: order.clientId, ...r }))
          .catch(err => results.push({ type: 'stateful', clientId: order.clientId, success: false, error: err.message }))
      );

      await Promise.all([shortTermPromise, ...statefulPromises]);

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
      return {
        success: false,
        error: error.message,
        userMessage: this.getUserFriendlyError(error),
        cancelled: 0,
        failed: orders.length,
        results: [],
      };
    }
  }

  // Close all open positions
  // Each position fires its own market order in parallel (can't batch — different subaccounts/blocks).

  async closeAllPositions(
    positions: Position[],
    marketInfoMap: Record<string, MarketData> = {}
  ) {
    if (!positions.length) return { success: true, results: [], closed: 0, failed: 0 };

    const settlements = await Promise.allSettled(
      positions.map(position =>
        this.closePosition(position, marketInfoMap[position.market])
      )
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

  // Set triggers (TP/SL)

  async setTriggers(position: Position, triggers: TriggerParams, marketInfo?: MarketData) {
    const closingSide: OrderSideEnum =
      position.side.toUpperCase().trim() === 'LONG' ? 'SELL' : 'BUY';
    const size = Math.abs(parseFloat(position.size));
    const results: any = {};

    try {
      if (triggers.takeProfit?.enabled && triggers.takeProfit?.price) {
        const type =
          triggers.takeProfit.type === 'MARKET' ? 'TAKE_PROFIT_MARKET' : 'TAKE_PROFIT_LIMIT';

        results.takeProfit = await this.placeOrder(
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
        );
      }

      if (triggers.stopLoss?.enabled && triggers.stopLoss?.price) {
        const type = triggers.stopLoss.type === 'MARKET' ? 'STOP_MARKET' : 'STOP_LIMIT';

        results.stopLoss = await this.placeOrder(
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
        );
      }

      return { success: true, results };
    } catch (error: any) {
      console.error('Error setting triggers:', error);
      return { success: false, error: error.message, results };
    }
  }


  // Pulled out of placeOrder handles isolated margin top-up + on-chain verification
  private async ensureIsolatedSubaccountEquity({
    subaccountNumber,
    size,
    marketInfo,
    params,
    address,
    subaccount,
    orderCategory,
  }: {
    subaccountNumber: number;
    size: number;
    marketInfo: MarketData;
    params: PlaceOrderParams;
    address: string;
    subaccount: any;
    orderCategory: OrderCategory;
  }) {
    const oraclePrice = parseFloat(marketInfo.oraclePrice);
    const notionalValue = size * oraclePrice;
    const requiredMargin = notionalValue / params.leverage!;

    // Long-term (stateful) orders need a minimum of 20.1 USDC equity
    const isLongTermOrder = !orderCategory.isMarket;
    const targetEquity = isLongTermOrder ? Math.max(requiredMargin, 20.1) : requiredMargin;
    const targetEquityWithBuffer = targetEquity * 1.05;

    const equityResult = await dydxSubaccountService.ensureIsolatedEquity(
      subaccountNumber,
      targetEquityWithBuffer
    );
    if (!equityResult.success) {
      throw new Error(equityResult.error || 'Failed to ensure isolated equity');
    }

    if (equityResult.transferredAmount > 0) {
      await this.verifyEquityAfterTransfer({ address, subaccount, targetEquityWithBuffer });
    }
  }

  // Polls indexer until the transferred equity is reflected — chain state can lag
  private async verifyEquityAfterTransfer({
    address,
    subaccount,
    targetEquityWithBuffer,
  }: {
    address: string;
    subaccount: any;
    targetEquityWithBuffer: number;
  }) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const indexer = dydxWalletService.getIndexerClient();
    let verified = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const subaccountResponse = await indexer.account.getSubaccount(
          address,
          subaccount.subaccountNumber
        );
        const currentEquity = parseFloat(subaccountResponse.subaccount?.equity || '0');
        if (currentEquity >= targetEquityWithBuffer * 0.95) {
          verified = true;
          break;
        }
      } catch { }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!verified) {
      throw new Error(
        'Transfer completed but equity not yet reflected. Please try again in a few seconds.'
      );
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
    const height = await client.validatorClient.get.latestBlockHeight();
    const goodTilBlock = height + TRADING_CONFIG.SHORT_TERM_BLOCKS;
    const side = this.normalizeToOrderSide(params.side);

    return client.placeShortTermOrder(
      subaccount,
      params.market,
      side,
      price,
      size,
      clientId,
      goodTilBlock,
      OrderTimeInForce.IOC,
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

    // Market conditionals (stop market / take profit market) use IOC execution
    const isMarketConditional = MARKET_CONDITIONAL_TYPES.has(params.type.toUpperCase());
    const execution = isMarketConditional ? OrderExecution.IOC : OrderExecution.DEFAULT;

    let timeInForce = OrderTimeInForce.GTT;
    if (params.timeInForce === 'IOC') timeInForce = OrderTimeInForce.IOC;
    if (params.reduceOnly || isMarketConditional) timeInForce = OrderTimeInForce.IOC;

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
    // Reduce-only forces IOC to avoid resting on the book
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

  //Utilities

  private validateReduceOnlyConstraints(params: PlaceOrderParams, _orderCategory: any) {
    if (!params.reduceOnly) return;
    if (params.postOnly) throw new Error('Reduce-Only and Post-Only cannot be combined');
  }

  private categorizeOrder(type: string) {
    const t = type.toUpperCase();
    return {
      isMarket: t === 'MARKET',
      isConditional: CONDITIONAL_ORDER_TYPES.has(t),
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

    // Buy fills against asks (slippage up), sell fills against bids (slippage down)
    return normalized === 'BUY'
      ? basePrice * (1 + tolerance)
      : basePrice * (1 - tolerance);
  }

  private roundPrice(value: number, tickSize: string): number {
    const tick = parseFloat(tickSize);
    // toFixed prevents floating-point drift (e.g. 0.1 tick → 0.10000000000000001)
    const decimals = (tickSize.split('.')[1] ?? '').length;
    return parseFloat((Math.round(value / tick) * tick).toFixed(decimals));
  }

  private generateClientId(): number {
    // Wrap within signed 32-bit range — dYdX chain requirement
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

  private getUserFriendlyError(error: any): string {
    const msg = error.message || error.toString();
    if (msg.includes('insufficient')) return 'Insufficient balance';
    if (msg.includes('9003') || msg.includes('reduce-only') || msg.includes('Reduce-only'))
      return 'Reduce-only is currently disabled on dYdX. Using regular market orders instead.';
    if (msg.includes('network') || msg.includes('timeout')) return 'Network error - please try again';
    if (msg.includes('Wallet not connected')) return 'Please connect your wallet';
    if (msg.includes('Mnemonic not found')) return 'Wallet session expired - please reconnect';
    if (msg.includes('StatefulOrderTimeWindow'))
      return 'Order expiry time is too far in the future. Maximum is 28 days.';
    return msg;
  }

  private isRetryableError(error: any): boolean {
    const msg = error.message || error.toString();
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('connection') ||
      msg.includes('Indexer not available')
    );
  }
}

export const dydxTradingService = new DydxTradingService();