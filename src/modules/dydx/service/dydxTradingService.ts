import {
  BECH32_PREFIX,
  LocalWallet,
  OrderExecution,
  OrderSide,
  OrderTimeInForce,
  OrderType,
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

class DydxTradingService {
  private clientIdCounter = Date.now() >>> 0;

  async placeOrder(params: PlaceOrderParams, marketInfo?: MarketData) {
    try {
      const client = await dydxWalletService.getCompositeClient();
      const address = dydxWalletService.getAddress();
      if (!client || !address) throw new Error('Wallet not connected');

      const localWallet = await this.getSigningWallet();

      if (!marketInfo) {
        throw new Error('Market information is required');
      }

      const subaccount = {
        address,
        subaccountNumber: params.subaccountNumber ?? dydxWalletService.getActiveSubaccountNumber(),
        signingWallet: localWallet,
      };

      const clientId = params.clientId ?? this.generateClientId();
      const size = typeof params.size === 'string' ? parseFloat(params.size) : params.size;
      const orderCategory = this.categorizeOrder(params.type);

      this.validateReduceOnlyConstraints(params, orderCategory);

      let price = params.price ?? 0;
      if (orderCategory.isMarket || !price) {
        price = await this.getSlippagePrice(params.market, params.side, params.slippageTolerance);
      }
      price = this.roundPrice(price, marketInfo.tickSize!);


      if (subaccount.subaccountNumber >= 128 && params.leverage) {
        const oraclePrice = parseFloat(marketInfo.oraclePrice);
        const notionalValue = size * oraclePrice;
        const requiredMargin = notionalValue / params.leverage;

        const isLongTermOrder = !orderCategory.isMarket;
        const targetEquity = isLongTermOrder
          ? Math.max(requiredMargin, 20.1)
          : requiredMargin;
        const targetEquityWithBuffer = targetEquity * 1.05;

        console.log('[dydxTradingService] Auto-deposit calculation:', {
          size,
          oraclePrice,
          leverage: params.leverage,
          notionalValue,
          requiredMargin,
          targetEquity,
          targetEquityWithBuffer,
          isLongTermOrder,
          subaccountNumber: subaccount.subaccountNumber,
        });


        const equityResult = await dydxSubaccountService.ensureIsolatedEquity(
          subaccount.subaccountNumber,
          targetEquityWithBuffer
        );
        if (!equityResult.success) {
          throw new Error(equityResult.error || 'Failed to ensure isolated equity');
        }


        if (equityResult.transferredAmount > 0) {
          console.log('[dydxTradingService] Transfer made, verifying equity before order...');


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
              console.log(`[dydxTradingService] Equity verification attempt ${attempt + 1}:`, {
                currentEquity,
                requiredMargin: targetEquityWithBuffer,
                verified: currentEquity >= targetEquityWithBuffer * 0.95,
              });

              if (currentEquity >= targetEquityWithBuffer * 0.95) {
                verified = true;
                break;
              }
            } catch (err) {
              console.log(`[dydxTradingService] Equity check attempt ${attempt + 1} failed:`, err);
            }


            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          if (!verified) {
            throw new Error('Transfer completed but equity not yet reflected. Please try again in a few seconds.');
          }
        }
      }

      const triggerPrice = params.triggerPrice
        ? this.roundPrice(params.triggerPrice, marketInfo.tickSize!)
        : undefined;

      let result;

      if (orderCategory.isMarket) {
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
      return {
        success: false,
        error: error.message || 'Unknown error',
        userMessage: this.getUserFriendlyError(error),
        retryable: this.isRetryableError(error),
      };
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

    return await client.placeShortTermOrder(
      subaccount,
      params.market,
      side,
      price,
      size,
      clientId,
      goodTilBlock,
      OrderTimeInForce.IOC,
      false
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
    if (!triggerPrice) {
      throw new Error('Trigger price is required for conditional orders');
    }

    // Use duration in seconds
    // dYdX expects goodTilTimeInSeconds as a duration
    const durationSeconds =
      params.goodTilTimeInSeconds || TRADING_CONFIG.DEFAULT_STATEFUL_EXPIRY_SECONDS;

    const safeDuration = Math.min(durationSeconds, TRADING_CONFIG.MAX_STATEFUL_EXPIRY_SECONDS);

    const side = this.normalizeToOrderSide(params.side);

    return await client.placeOrder(
      subaccount,
      params.market,
      this.mapOrderType(params.type),
      side,
      price,
      size,
      clientId,
      OrderTimeInForce.GTT,
      safeDuration,
      OrderExecution.DEFAULT,
      params.postOnly || false,
      false,
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
    const durationSeconds =
      params.goodTilTimeInSeconds || TRADING_CONFIG.DEFAULT_STATEFUL_EXPIRY_SECONDS;
    const safeDuration = Math.min(durationSeconds, TRADING_CONFIG.MAX_STATEFUL_EXPIRY_SECONDS);

    let timeInForce = OrderTimeInForce.GTT;
    if (params.timeInForce === 'IOC') {
      timeInForce = OrderTimeInForce.IOC;
    } else if (params.timeInForce === 'FOK') {
      timeInForce = OrderTimeInForce.FOK;
    }

    const side = this.normalizeToOrderSide(params.side);

    return await client.placeOrder(
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
      false,
      undefined
    );
  }

  async closePosition(position: Position, marketInfo?: MarketData) {
    try {
      const positionSide = position.side.toUpperCase().trim();
      const closingSide: OrderSideEnum = positionSide === 'LONG' ? 'SELL' : 'BUY';
      const size = Math.abs(parseFloat(position.size));

      console.log('Closing position:', {
        market: position.market,
        positionSide,
        closingSide,
        size,
      });

      const result = await this.placeOrder(
        {
          market: position.market,
          side: closingSide,
          type: 'MARKET',
          size,
          reduceOnly: false,
          slippageTolerance: TRADING_CONFIG.CLOSE_POSITION_SLIPPAGE,
        },
        marketInfo
      );

      console.log(result, 'Close position result');
      return result;
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

  async setTriggers(position: Position, triggers: TriggerParams, marketInfo?: MarketData) {
    const positionSide = position.side.toUpperCase().trim();
    const closingSide: OrderSideEnum = positionSide === 'LONG' ? 'SELL' : 'BUY';
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

  async cancelOrder(order: any) {
    try {
      const client = await dydxWalletService.getCompositeClient();
      const address = dydxWalletService.getAddress();
      if (!client || !address) throw new Error('Wallet not connected');

      const localWallet = await this.getSigningWallet();
      const subaccount = {
        address,
        subaccountNumber: dydxWalletService.getSubaccountNumber(),
        signingWallet: localWallet,
      };

      const clientId = parseInt(order.clientId);
      const orderFlags = parseInt(order.orderFlags);
      const marketId = order.clobPairId || order.ticker;

      const isShortTermOrder = orderFlags === 0;

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

      console.log('[cancelOrder] Order details:', {
        clientId,
        orderFlags,
        isShortTermOrder,
        goodTilBlock: goodTilTimeInSeconds,
        rawGoodTilBlockTime: order.goodTilBlockTime,
        rawType: typeof order.goodTilBlockTime,
        marketId,
      });

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

  private validateReduceOnlyConstraints(params: PlaceOrderParams, _orderCategory: any) {
    if (!params.reduceOnly) return;
    throw new Error(
      'Reduce-only is currently disabled on dYdX. Use regular market orders to close positions instead.'
    );
  }

  private categorizeOrder(type: string) {
    const t = type.toUpperCase();
    return {
      isMarket: t === 'MARKET',
      isConditional: [
        'STOP_MARKET',
        'STOP_LIMIT',
        'TAKE_PROFIT_MARKET',
        'TAKE_PROFIT_LIMIT',
      ].includes(t),
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

    if (!orderbook.asks?.length || !orderbook.bids?.length) {
      throw new Error('Orderbook empty');
    }

    const normalized = side.toUpperCase().trim();
    const basePrice =
      normalized === 'BUY'
        ? parseFloat(orderbook.asks[0].price)
        : parseFloat(orderbook.bids[0].price);

    const priceWithSlippage =
      normalized === 'BUY' ? basePrice * (1 + tolerance) : basePrice * (1 - tolerance);

    return priceWithSlippage;
  }

  private roundPrice(value: number, tickSize: string): number {
    const tick = parseFloat(tickSize);
    return Math.round(value / tick) * tick;
  }

  private generateClientId(): number {
    return this.clientIdCounter++ % 0x7fffffff;
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

  private async getSigningWallet(): Promise<LocalWallet> {
    const evmSession = walletService.getSession('evm');
    if (!evmSession?.evmAddress) {
      throw new Error('EVM wallet not connected');
    }

    const mnemonic =
      walletService.getMnemonic(evmSession.evmAddress) ||
      (await walletService.restoreMnemonicFromStorage());

    if (!mnemonic) {
      throw new Error('Mnemonic not found - please reconnect wallet');
    }

    return await LocalWallet.fromMnemonic(mnemonic, BECH32_PREFIX);
  }

  private getUserFriendlyError(error: any): string {
    const msg = error.message || error.toString();

    if (msg.includes('insufficient')) return 'Insufficient balance';
    if (msg.includes('9003') || msg.includes('reduce-only') || msg.includes('Reduce-only'))
      return 'Reduce-only is currently disabled on dYdX. Using regular market orders instead.';
    if (msg.includes('network') || msg.includes('timeout'))
      return 'Network error - please try again';
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
