import * as StellarSDK from '@stellar/stellar-sdk';
import { StellarBaseService } from './StellarBaseService';
import type {
  LargeOrderOptions,
  LargeOrderQuote,
  LargeOrderTransaction,
} from '../types/orderBookSwap.types';
import { signAndSubmitTransaction } from '../utils/transactionService';

export class OrderBookSwapService extends StellarBaseService {
  calculateTotal(amount: string, price: string): string {
    const amt = parseFloat(amount);
    const prc = parseFloat(price);
    if (isNaN(amt) || isNaN(prc)) {
      throw new Error('Invalid amount or price');
    }
    return (amt * prc).toFixed(7);
  }

  async getOrderQuote(
    fromAsset: StellarSDK.Asset,
    toAsset: StellarSDK.Asset,
    amount: string,
    price: string,
    options: LargeOrderOptions = {}
  ): Promise<LargeOrderQuote> {
    try {
      const total = this.calculateTotal(amount, price);
      return {
        fromAsset,
        toAsset,
        amount,
        price,
        total,
        slippageTolerance: options.slippageTolerance || 1,
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error('Failed to generate quote:', err);
      throw new Error('Failed to generate order quote');
    }
  }

  async buildOrderTransaction(
    fromAddress: string,
    quote: LargeOrderQuote,
    isBuy: boolean,
    options: LargeOrderOptions = {}
  ): Promise<LargeOrderTransaction> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(fromAddress)) {
      throw new Error('Invalid sender Stellar address');
    }

    try {
      const sourceAccount = await this.server.loadAccount(fromAddress);
      const txBuilder = new StellarSDK.TransactionBuilder(sourceAccount, {
        fee: options.fee || StellarSDK.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      this.ensureTrustline(txBuilder, sourceAccount, quote.toAsset);

      let operation;
      if (isBuy) {
        operation = StellarSDK.Operation.manageBuyOffer({
          selling: quote.fromAsset,
          buying: quote.toAsset,
          buyAmount: quote.amount,
          price: quote.price,
          offerId: '0',
        });
      } else {
        operation = StellarSDK.Operation.manageSellOffer({
          selling: quote.fromAsset,
          buying: quote.toAsset,
          amount: quote.amount,
          price: quote.price,
          offerId: '0',
        });
      }

      txBuilder.addOperation(operation);

      if (options.memo) {
        txBuilder.addMemo(StellarSDK.Memo.text(options.memo));
      }
      txBuilder.setTimeout(options.timeout || 300);

      const builtTransaction = txBuilder.build();
      const xdr = builtTransaction.toXDR();

      return {
        id: `large-order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'large-order',
        from: fromAddress,
        quote,
        sequence: sourceAccount.sequenceNumber(),
        fee: options.fee || StellarSDK.BASE_FEE,
        memo: options.memo,
        timestamp: Date.now(),
        status: 'pending',
        xdr,
        networkKey: this.networkKey,
      };
    } catch (err) {
      console.error('Failed to build transaction:', err);
      throw new Error('Failed to build transaction');
    }
  }

  async executeOrderWithWalletConnect(
    transaction: LargeOrderTransaction,
    walletProvider: any
  ): Promise<string> {
    const isMainnet = this.networkPassphrase.includes('Public Global Stellar Network');
    const network = isMainnet ? 'mainnet' : 'testnet';

    const result = await signAndSubmitTransaction({
      xdr: transaction.xdr,
      network,
      networkPassphrase: this.networkPassphrase,
      provider: walletProvider,
    });

    if (result.success && result.hash) {
      return result.hash;
    }

    throw new Error(`Order execution failed: ${result.error || 'Unknown error'}`);
  }

  async getOrderBook(selling: StellarSDK.Asset, buying: StellarSDK.Asset, limit: number = 20) {
    try {
      const orderbook = await this.server.orderbook(selling, buying).limit(limit).call();
      return orderbook;
    } catch (error) {
      console.error('Failed to fetch order book:', error);
      throw new Error('Failed to fetch order book');
    }
  }

  streamOrderBook(
    selling: StellarSDK.Asset,
    buying: StellarSDK.Asset,
    onUpdate: (orderbook: any) => void,
    onError?: (error: any) => void
  ): () => void {
    let closeStream: (() => void) | null = null;

    try {
      closeStream = this.server
        .orderbook(selling, buying)
        .limit(20)
        .stream({
          onmessage: (orderbook: any) => {
            onUpdate(orderbook);
          },
          onerror: (error: any) => {
            console.error('[StellarOrderbook] Stream error:', error);
            if (closeStream) closeStream();
            if (onError) {
              onError(error);
            }
          },
        }) as unknown as () => void;
    } catch (error) {
      console.error('[StellarOrderbook] Failed to start stream:', error);
      if (onError) {
        onError(error);
      }
    }

    return () => {
      if (closeStream && typeof closeStream === 'function') {
        closeStream();
      }
    };
  }

  async getBestPrice(
    selling: StellarSDK.Asset,
    buying: StellarSDK.Asset,
    isBuy: boolean
  ): Promise<string | null> {
    try {
      const orderbook = await this.getOrderBook(selling, buying, 1);
      if (isBuy && orderbook.asks.length > 0) {
        return orderbook.asks[0].price;
      } else if (!isBuy && orderbook.bids.length > 0) {
        return orderbook.bids[0].price;
      }
      return null;
    } catch (error) {
      console.error('Failed to get best price:', error);
      return null;
    }
  }

  getPopularAssets(): StellarSDK.Asset[] {
    const popular = [StellarSDK.Asset.native()];
    const isMainnet = this.networkPassphrase.includes('Public Global Stellar Network');

    if (isMainnet) {
      popular.push(
        new StellarSDK.Asset('USDC', 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN')
      );
    }

    return popular;
  }
}
