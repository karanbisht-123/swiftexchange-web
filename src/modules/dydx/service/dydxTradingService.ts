import { OrderExecution, OrderSide, OrderTimeInForce, OrderType } from '@dydxprotocol/v4-client-js';

import {
  type MarketInfo,
  type OrderConfig,
  type OrderResult,
  OrderSideEnum,
  type PlaceOrderParams,
  type Position,
  mapOrderSide,
  mapOrderType,
} from '../types/trading.types';
import { dydxWalletService } from './dydxWalletService';

class DydxTradingService {
  private clientIdCounter = Date.now() >>> 0;
  private readonly DEFAULT_SLIPPAGE = 0.05;
  private readonly SHORT_TERM_ORDER_BLOCKS = 20;
  private readonly STATEFUL_ORDER_TIME_WINDOW = 8_208_000; // ~95 days in seconds

  // Main order placement - handles all order types (market, limit, stop, take profit)
  async placeOrder(params: PlaceOrderParams, marketInfo: MarketInfo): Promise<OrderResult> {
    if (!dydxWalletService.isReadyForTrading()) {
      return this.createErrorResult(
        'Wallet not connected',
        'NOT_READY',
        'Please connect your wallet first',
        true
      );
    }

    const compositeClient = dydxWalletService.getCompositeClient();
    const subaccountInfo = dydxWalletService.getSubaccountInfo();

    if (!compositeClient || !subaccountInfo) {
      return this.createErrorResult(
        'Clients not initialized',
        'CLIENT_MISSING',
        'Trading client not ready',
        true
      );
    }

    // Validate order size against market minimum
    const minSize = parseFloat(marketInfo.minOrderSize);
    if (params.size <= 0 || params.size < minSize) {
      return this.createErrorResult(
        'Invalid or too small size',
        'INVALID_SIZE',
        `Minimum size: ${marketInfo.minOrderSize}`,
        false
      );
    }

    try {
      const orderConfig = await this.buildOrderConfig(params, marketInfo);

      console.log('[Trading] Placing order:', {
        market: marketInfo.ticker,
        ...orderConfig,
      });

      const result = await compositeClient.placeOrder(
        subaccountInfo,
        marketInfo.ticker,
        orderConfig.type,
        orderConfig.side,
        orderConfig.price,
        orderConfig.size,
        orderConfig.clientId,
        orderConfig.timeInForce,
        orderConfig.goodTilTimeInSeconds,
        orderConfig.execution,
        orderConfig.postOnly,
        orderConfig.reduceOnly,
        orderConfig.triggerPrice
      );

      // Convert hash to hex string for block explorer
      const txHash =
        typeof result.hash === 'string'
          ? result.hash
          : Array.from(new Uint8Array(result.hash))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');

      const network = dydxWalletService.getChainId().includes('testnet') ? 'testnet' : 'mainnet';
      const explorerUrl =
        network === 'testnet'
          ? `https://testnet.mintscan.io/dydx-testnet/txs/${txHash}`
          : `https://www.mintscan.io/dydx/txs/${txHash}`;

      return {
        success: true,
        orderId: `client_${orderConfig.clientId}`,
        clientId: orderConfig.clientId,
        transactionHash: txHash,
        confirmationUrl: explorerUrl,
        timestamp: new Date().toISOString(),
        userMessage: 'Order placed successfully!',
        orderStatus: 'PENDING',
      };
    } catch (err: any) {
      console.error('[Trading] Place order failed:', err);
      const info = this.parseError(err);
      return {
        success: false,
        error: info.technicalDetails,
        errorCode: err.code || 'UNKNOWN',
        errorType: info.errorType,
        userMessage: info.userMessage,
        retryable: info.retryable,
      };
    }
  }

  // Set TP/SL for existing position
  async setPositionTriggers(
    position: Position,
    marketInfo: MarketInfo,
    config: {
      takeProfit?: { price: number; type: 'MARKET' | 'LIMIT' };
      stopLoss?: { price: number; type: 'MARKET' | 'LIMIT' };
    }
  ): Promise<{ takeProfitResult?: OrderResult; stopLossResult?: OrderResult }> {
    const results: { takeProfitResult?: OrderResult; stopLossResult?: OrderResult } = {};

    // Closing order side is opposite of position side
    const closingSide: OrderSideEnum = position.side === 'LONG' ? 'SELL' : 'BUY';
    const positionSize = Math.abs(parseFloat(position.size));

    const promises: Promise<void>[] = [];

    if (config.takeProfit) {
      promises.push(
        (async () => {
          const tpOrderType =
            config.takeProfit!.type === 'MARKET' ? 'TAKE_PROFIT_MARKET' : 'TAKE_PROFIT_LIMIT';

          results.takeProfitResult = await this.placeOrder(
            {
              market: position.market,
              side: closingSide,
              type: tpOrderType,
              size: positionSize,
              triggerPrice: config.takeProfit!.price,
              price: config.takeProfit!.type === 'LIMIT' ? config.takeProfit!.price : undefined,
              reduceOnly: true,
              timeInForce: 'GTT',
            },
            marketInfo
          );
        })()
      );
    }

    if (config.stopLoss) {
      promises.push(
        (async () => {
          const slOrderType = config.stopLoss!.type === 'MARKET' ? 'STOP_MARKET' : 'STOP_LIMIT';

          results.stopLossResult = await this.placeOrder(
            {
              market: position.market,
              side: closingSide,
              type: slOrderType,
              size: positionSize,
              triggerPrice: config.stopLoss!.price,
              price: config.stopLoss!.type === 'LIMIT' ? config.stopLoss!.price : undefined,
              reduceOnly: true,
              timeInForce: 'GTT',
            },
            marketInfo
          );
        })()
      );
    }

    await Promise.all(promises);
    return results;
  }

  // Close position at market price
  async closePosition(
    market: string,
    position: Position,
    marketInfo: MarketInfo
  ): Promise<OrderResult> {
    const side = position.side === 'LONG' ? 'SELL' : 'BUY';

    return this.placeOrder(
      {
        market,
        side: side as OrderSideEnum,
        type: 'MARKET',
        size: Math.abs(parseFloat(position.size)),
        reduceOnly: true,
        slippageTolerance: 0.01,
      },
      marketInfo
    );
  }

  // Fetch market details from indexer
  async getMarketInfo(ticker: string): Promise<MarketInfo> {
    const indexer = dydxWalletService.getIndexerClient();
    if (!indexer) throw new Error('Indexer not ready');

    const resp = await indexer.markets.getPerpetualMarkets(ticker);
    const m = resp.markets[ticker];
    if (!m) throw new Error(`Market ${ticker} not found`);

    return {
      clobPairId: Number(m.clobPairId),
      ticker: m.ticker,
      stepSize: m.stepSize,
      tickSize: m.tickSize,
      minOrderSize: m.minOrderSize,
      atomicResolution: m.atomicResolution,
      status: m.status,
      baseAsset: m.baseAsset || ticker.split('-')[0],
      quoteAsset: m.quoteAsset || ticker.split('-')[1],
    };
  }

  // Validate TP/SL prices make sense for the position
  validateTriggerPrice(
    position: Position,
    triggerPrice: number,
    orderType: 'TAKE_PROFIT' | 'STOP_LOSS'
  ): { valid: boolean; error?: string } {
    const entryPrice = parseFloat(position.entryPrice);
    const isLong = position.side === 'LONG';

    if (orderType === 'TAKE_PROFIT') {
      if (isLong && triggerPrice <= entryPrice) {
        return {
          valid: false,
          error: 'Take Profit price must be above entry price for LONG positions',
        };
      }
      if (!isLong && triggerPrice >= entryPrice) {
        return {
          valid: false,
          error: 'Take Profit price must be below entry price for SHORT positions',
        };
      }
    }

    if (orderType === 'STOP_LOSS') {
      if (isLong && triggerPrice >= entryPrice) {
        return {
          valid: false,
          error: 'Stop Loss price must be below entry price for LONG positions',
        };
      }
      if (!isLong && triggerPrice <= entryPrice) {
        return {
          valid: false,
          error: 'Stop Loss price must be above entry price for SHORT positions',
        };
      }
    }

    return { valid: true };
  }

  // Build full order config from user params
  private async buildOrderConfig(
    params: PlaceOrderParams,
    marketInfo: MarketInfo
  ): Promise<OrderConfig> {
    const type = mapOrderType(params.type);
    const side = mapOrderSide(params.side);
    const clientId = params.clientId ?? this.generateClientId();
    let price = params.price ?? 0;

    // Fetch market price for market orders
    if (this.needsMarketPrice(type) && !price) {
      price = await this.getMarketPrice(marketInfo.ticker, side, params.slippageTolerance);
    }
    if (price > 0) {
      price = this.roundToTick(price, marketInfo.tickSize);
    }

    const isMarket = type === OrderType.MARKET;
    const isConditional = this.isConditionalOrder(type);
    const isLimit = this.isLimitOrder(type);

    let timeInForce: OrderTimeInForce;
    let goodTilTimeInSeconds: number;
    let execution: OrderExecution;

    // Configure timing based on order type
    if (isMarket) {
      timeInForce = OrderTimeInForce.IOC; // Immediate or Cancel
      goodTilTimeInSeconds = 0;
      execution = OrderExecution.DEFAULT;
    } else if (isConditional) {
      // Conditional orders use stateful time window (max ~95 days)
      const desiredDurationSeconds = 94 * 24 * 3600;
      goodTilTimeInSeconds = Math.min(desiredDurationSeconds, this.STATEFUL_ORDER_TIME_WINDOW);
      timeInForce = OrderTimeInForce.GTT;

      execution =
        type === OrderType.STOP_MARKET || type === OrderType.TAKE_PROFIT_MARKET
          ? OrderExecution.IOC
          : OrderExecution.DEFAULT;
    } else if (isLimit) {
      if (params.timeInForce === 'IOC') {
        timeInForce = OrderTimeInForce.IOC;
        goodTilTimeInSeconds = 0;
        execution = OrderExecution.DEFAULT;
      } else if (params.timeInForce === 'FOK') {
        timeInForce = OrderTimeInForce.FOK; // Fill or Kill
        goodTilTimeInSeconds = 0;
        execution = OrderExecution.DEFAULT;
      } else {
        const desiredDurationSeconds = 94 * 24 * 3600;
        goodTilTimeInSeconds = Math.min(desiredDurationSeconds, this.STATEFUL_ORDER_TIME_WINDOW);
        timeInForce = OrderTimeInForce.GTT;
        execution = OrderExecution.DEFAULT;
      }
    } else {
      throw new Error('Unsupported order type');
    }

    let triggerPrice = params.triggerPrice;
    if (isConditional && !triggerPrice) {
      throw new Error('Trigger price required for conditional orders');
    }

    if (triggerPrice) {
      triggerPrice = this.roundToTick(triggerPrice, marketInfo.tickSize);
    }

    return {
      type,
      side,
      timeInForce,
      execution,
      price,
      size: params.size,
      clientId,
      postOnly: params.postOnly || false,
      reduceOnly: params.reduceOnly || false,
      triggerPrice,
      goodTilTimeInSeconds,
    };
  }

  private needsMarketPrice(type: OrderType): boolean {
    return [OrderType.MARKET, OrderType.STOP_MARKET, OrderType.TAKE_PROFIT_MARKET].includes(type);
  }

  private isConditionalOrder(type: OrderType): boolean {
    return [
      OrderType.STOP_MARKET,
      OrderType.STOP_LIMIT,
      OrderType.TAKE_PROFIT_MARKET,
      OrderType.TAKE_PROFIT_LIMIT,
    ].includes(type);
  }

  private isLimitOrder(type: OrderType): boolean {
    return [OrderType.LIMIT, OrderType.STOP_LIMIT, OrderType.TAKE_PROFIT_LIMIT].includes(type);
  }

  // Get best price from orderbook with slippage buffer
  private async getMarketPrice(
    ticker: string,
    side: OrderSide,
    slippageTolerance?: number
  ): Promise<number> {
    const indexer = dydxWalletService.getIndexerClient();
    if (!indexer) throw new Error('Indexer not available');

    const book = await indexer.markets.getPerpetualMarketOrderbook(ticker);
    if (!book.bids?.length || !book.asks?.length) throw new Error('Empty orderbook');

    const basePrice =
      side === OrderSide.BUY ? parseFloat(book.asks[0].price) : parseFloat(book.bids[0].price);

    const slippage = slippageTolerance ?? this.DEFAULT_SLIPPAGE;
    return side === OrderSide.BUY ? basePrice * (1 + slippage) : basePrice * (1 - slippage);
  }

  // Round price to market tick size
  private roundToTick(price: number, tickSize: string): number {
    const tick = parseFloat(tickSize);
    return Math.round(price / tick) * tick;
  }

  // Generate unique client ID for order tracking
  private generateClientId(): number {
    this.clientIdCounter = (this.clientIdCounter + 1) % 0x7fffffff;
    return this.clientIdCounter;
  }

  private createErrorResult(
    error: string,
    errorCode: string,
    userMessage: string,
    retryable: boolean
  ): OrderResult {
    return {
      success: false,
      error,
      errorCode,
      userMessage,
      retryable,
    };
  }

  // Parse error messages into user-friendly format
  private parseError(err: any) {
    const msg = err.message || String(err);

    if (msg.includes('3004') || msg.includes('StatefulOrderTimeWindow')) {
      return {
        errorType: 'TIMING_ERROR',
        userMessage: 'Order duration too long — using shorter duration',
        technicalDetails: msg,
        retryable: true,
      };
    }

    if (msg.includes('GoodTilBlock') || msg.includes('blockHeight')) {
      return {
        errorType: 'TIMING_ERROR',
        userMessage: 'Block timing issue — please retry',
        technicalDetails: msg,
        retryable: true,
      };
    }

    if (msg.includes('insufficient')) {
      return {
        errorType: 'INSUFFICIENT_FUNDS',
        userMessage: 'Insufficient balance',
        technicalDetails: msg,
        retryable: false,
      };
    }

    if (msg.includes('rate limit') || msg.includes('too many requests')) {
      return {
        errorType: 'RATE_LIMIT',
        userMessage: 'Rate limited, please wait',
        technicalDetails: msg,
        retryable: true,
      };
    }

    return {
      errorType: 'UNKNOWN',
      userMessage: 'Order failed — please try again',
      technicalDetails: msg,
      retryable: true,
    };
  }
}

export const dydxTradingService = new DydxTradingService();
