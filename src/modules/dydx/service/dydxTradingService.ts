import { OrderExecution, OrderSide, OrderTimeInForce, OrderType } from '@dydxprotocol/v4-client-js';

import {
  type MarketInfo,
  type OpenOrder,
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
  private readonly STATEFUL_ORDER_TIME_WINDOW = 8_208_000;

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

      const txHash =
        typeof result.hash === 'string' ? result.hash : Buffer.from(result.hash).toString('hex');
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

  async cancelOrder(order: OpenOrder): Promise<OrderResult> {
    const compositeClient = dydxWalletService.getCompositeClient();
    const subaccountInfo = dydxWalletService.getSubaccountInfo();

    if (!compositeClient || !subaccountInfo) {
      return this.createErrorResult('Client not ready', 'CLIENT_MISSING', 'Client not ready', true);
    }

    try {
      let goodTilBlock: number | undefined;
      let goodTilBlockTime: number | undefined;

      if (order.goodTilBlock) {
        const currentHeight = await compositeClient.validatorClient.get.latestBlockHeight();
        goodTilBlock = currentHeight + this.SHORT_TERM_ORDER_BLOCKS;
      } else if (order.goodTilBlockTime) {
        const datetime = new Date(order.goodTilBlockTime);
        goodTilBlockTime = Math.round(datetime.getTime() / 1000);
      }

      const market = order.market.includes('-') ? order.market.split('-')[0] : order.market;

      const tx = await compositeClient.cancelOrder(
        subaccountInfo,
        order.clientId,
        order.orderFlags,
        market,
        goodTilBlock ?? 0,
        goodTilBlockTime ?? 0
      );

      const txHash = typeof tx.hash === 'string' ? tx.hash : Buffer.from(tx.hash).toString('hex');

      return {
        success: true,
        clientId: order.clientId,
        transactionHash: txHash,
        userMessage: 'Order cancelled',
        orderStatus: 'CANCELLED',
      };
    } catch (err: any) {
      console.error('[Trading] Cancel failed:', err);
      const info = this.parseError(err);
      return {
        success: false,
        userMessage: info.userMessage,
        error: info.technicalDetails,
        retryable: info.retryable,
      };
    }
  }

  async closePosition(market: string, position: Position, marketInfo: MarketInfo) {
    const side = position.side === 'LONG' ? 'SELL' : 'BUY';
    return this.placeOrder(
      {
        market,
        side: side as OrderSideEnum,
        type: 'MARKET',
        size: parseFloat(position.size),
        reduceOnly: true,
        slippageTolerance: 0.01,
      },
      marketInfo
    );
  }

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

  private async buildOrderConfig(
    params: PlaceOrderParams,
    marketInfo: MarketInfo
  ): Promise<OrderConfig> {
    const type = mapOrderType(params.type);
    const side = mapOrderSide(params.side);
    const clientId = params.clientId ?? this.generateClientId();
    let price = params.price ?? 0;

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

    if (isMarket) {
      timeInForce = OrderTimeInForce.IOC;
      goodTilTimeInSeconds = 0;
      execution = OrderExecution.DEFAULT;
    } else if (isConditional) {
      const desiredDurationSeconds = 94 * 24 * 3600;
      goodTilTimeInSeconds = Math.min(desiredDurationSeconds, this.STATEFUL_ORDER_TIME_WINDOW);
      timeInForce = OrderTimeInForce.GTT;
      execution = OrderExecution.IOC;
    } else if (isLimit) {
      if (params.timeInForce === 'IOC') {
        timeInForce = OrderTimeInForce.IOC;
        goodTilTimeInSeconds = 0;
        execution = OrderExecution.DEFAULT;
      } else if (params.timeInForce === 'FOK') {
        timeInForce = OrderTimeInForce.FOK;
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
      triggerPrice: params.triggerPrice,
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

  private roundToTick(price: number, tickSize: string): number {
    const tick = parseFloat(tickSize);
    return Math.round(price / tick) * tick;
  }

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
