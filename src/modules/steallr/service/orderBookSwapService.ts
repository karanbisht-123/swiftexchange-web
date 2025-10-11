import * as StellarSDK from 'stellar-sdk';

import { NETWORK_CONFIGS } from '../../../config';
import { isStellarNetwork } from '../../../utils/transactionUtils';
import type {
  LargeOrderOptions,
  LargeOrderQuote,
  LargeOrderTransaction,
  TokenInfo,
} from '../types/orderBookSwap.types';

export class OrderBookSwapService {
  private server: StellarSDK.Horizon.Server;
  private networkPassphrase: string;
  private networkKey: string;

  constructor(networkKey: string) {
    const config = NETWORK_CONFIGS.stellar;
    console.log(config, 'hii i amdbfkjdsbf');
    if (!config || !isStellarNetwork(config)) {
      throw new Error(`Unsupported Stellar network: ${networkKey}`);
    }

    this.server = new StellarSDK.Horizon.Server(config.horizonUrl, {
      allowHttp: networkKey === 'stellarTestnet',
    });
    this.networkPassphrase =
      networkKey === 'stellarMainnet' ? StellarSDK.Networks.PUBLIC : StellarSDK.Networks.TESTNET;
    this.networkKey = networkKey;
  }

  async getTokenBalances(address: string): Promise<TokenInfo[]> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(address)) {
      throw new Error('Invalid Stellar address');
    }

    try {
      const account = await this.server.loadAccount(address);
      const tokens: TokenInfo[] = [];

      for (const balance of account.balances) {
        if (balance.asset_type === 'native') {
          tokens.push({
            asset: StellarSDK.Asset.native(),
            code: 'XLM',
            balance: balance.balance,
            isPopular: true,
          });
        } else if (
          balance.asset_type === 'credit_alphanum4' ||
          balance.asset_type === 'credit_alphanum12'
        ) {
          const asset = new StellarSDK.Asset(balance.asset_code, balance.asset_issuer);
          tokens.push({
            asset,
            code: balance.asset_code,
            issuer: balance.asset_issuer,
            balance: balance.balance,
            isPopular: false,
          });
        }
      }

      return tokens;
    } catch (error) {
      console.error('Failed to fetch token balances:', error);
      throw new Error('Failed to fetch token balances');
    }
  }

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

  async executeOrder(transaction: LargeOrderTransaction, privateKey: string): Promise<string> {
    if (!privateKey.startsWith('S') || privateKey.length !== 56) {
      throw new Error('Invalid Stellar private key format');
    }

    try {
      const sourceKeypair = StellarSDK.Keypair.fromSecret(privateKey);
      const tx = new StellarSDK.Transaction(transaction.xdr, this.networkPassphrase);
      tx.sign(sourceKeypair);
      const response = await this.server.submitTransaction(tx);
      return response.hash;
    } catch (error: any) {
      console.error('Failed to execute order:', error);
      if (error?.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        throw new Error(`Order failed: ${codes.transaction} - ${codes.operations?.join(', ')}`);
      }
      throw new Error('Order execution failed');
    }
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
    if (this.networkKey === 'stellarMainnet') {
      popular.push(
        new StellarSDK.Asset('USDC', 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN')
      );
    }
    return popular;
  }
}
