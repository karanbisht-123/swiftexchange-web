import * as StellarSDK from '@stellar/stellar-sdk';
import type { Horizon } from '@stellar/stellar-sdk';

import { NETWORK_CONFIGS } from '../../../config';
import { isStellarNetwork } from '../../../utils/transactionUtils';
import type { ActiveOffer, CompletedTrade } from '../types/tradeTransaction.types';

export class TradeTransactionService {
  private server: StellarSDK.Horizon.Server;
  private networkPassphrase: string;
  constructor(networkKey: string) {
    const config = NETWORK_CONFIGS.stellar;
    if (!config || !isStellarNetwork(config)) {
      throw new Error(`Unsupported Stellar network: ${networkKey}`);
    }

    this.server = new StellarSDK.Horizon.Server(config.horizonUrl, {
      allowHttp: networkKey === 'testnet',
    });
    this.networkPassphrase =
      networkKey === 'stellarMainnet' ? StellarSDK.Networks.PUBLIC : StellarSDK.Networks.TESTNET;
  }

  private mapOfferRecordToActiveOffer(offer: Horizon.ServerApi.OfferRecord): ActiveOffer {
    return {
      id: offer.id,
      selling: {
        code: offer.selling.asset_code || 'XLM',
        issuer: offer.selling.asset_issuer,
      },
      buying: {
        code: offer.buying.asset_code || 'XLM',
        issuer: offer.buying.asset_issuer,
      },
      amount: offer.amount,
      price: offer.price,
      lastModifiedTime: offer.last_modified_time,
    };
  }

  private mapTradeRecordToCompletedTrade(
    trade: Horizon.ServerApi.TradeRecord,
    accountId: string
  ): CompletedTrade {
    const isBuy = trade.counter_account === accountId;
    return {
      id: trade.id,
      baseAsset: {
        code: trade.base_asset_code || 'XLM',
        issuer: trade.base_asset_issuer,
      },
      counterAsset: {
        code: trade.counter_asset_code || 'XLM',
        issuer: trade.counter_asset_issuer,
      },
      baseAmount: trade.base_amount,
      counterAmount: trade.counter_amount,
      price: trade.price ? (Number(trade.price.n) / Number(trade.price.d)).toString() : '',
      ledgerCloseTime: trade.ledger_close_time,
      isBuy,
      trade_type: trade.trade_type,
    };
  }

  async getActiveOffers(
    accountId: string,
    limit: number = 10,
    cursor?: string
  ): Promise<{ offers: ActiveOffer[]; nextCursor?: string; hasMore: boolean }> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(accountId)) {
      throw new Error('Invalid Stellar account ID');
    }

    try {
      const response = await this.server
        .offers()
        .forAccount(accountId)
        .limit(limit)
        .cursor(cursor || '')
        .order('desc')
        .call();

      const offers = response.records.map(this.mapOfferRecordToActiveOffer);
      const nextCursor =
        response.records.length === limit
          ? response.records[response.records.length - 1].paging_token
          : undefined;
      const hasMore = response.records.length === limit;

      return { offers, nextCursor, hasMore };
    } catch (error) {
      console.error('Failed to fetch active offers:', error);
      throw new Error('Failed to fetch active offers');
    }
  }

  async getCompletedTrades(
    accountId: string,
    limit: number = 10,
    cursor?: string
  ): Promise<{
    trades: CompletedTrade[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(accountId)) {
      throw new Error('Invalid Stellar account ID');
    }

    try {
      const response = await this.server
        .trades()
        .forAccount(accountId)
        .limit(limit)
        .cursor(cursor || '')
        .order('desc')
        .call();

      const trades = response.records.map(trade =>
        this.mapTradeRecordToCompletedTrade(trade, accountId)
      );
      const nextCursor =
        response.records.length === limit
          ? response.records[response.records.length - 1].paging_token
          : undefined;
      const hasMore = response.records.length === limit;

      return { trades, nextCursor, hasMore };
    } catch (error) {
      console.error('Failed to fetch completed trades:', error);
      throw new Error('Failed to fetch completed trades');
    }
  }

  async cancelOffer(accountId: string, offer: ActiveOffer, privateKey: string): Promise<string> {
    if (!privateKey.startsWith('S') || privateKey.length !== 56) {
      throw new Error('Invalid Stellar private key format');
    }

    try {
      const sourceAccount = await this.server.loadAccount(accountId);
      const sellingAsset =
        offer.selling.code === 'XLM'
          ? StellarSDK.Asset.native()
          : new StellarSDK.Asset(offer.selling.code, offer.selling.issuer!);

      const buyingAsset =
        offer.buying.code === 'XLM'
          ? StellarSDK.Asset.native()
          : new StellarSDK.Asset(offer.buying.code, offer.buying.issuer!);

      const txBuilder = new StellarSDK.TransactionBuilder(sourceAccount, {
        fee: StellarSDK.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      const operation = StellarSDK.Operation.manageSellOffer({
        selling: sellingAsset,
        buying: buyingAsset,
        amount: '0',
        price: offer.price,
        offerId: offer.id,
      });

      txBuilder.addOperation(operation);
      txBuilder.setTimeout(300);

      const builtTx = txBuilder.build();
      const keypair = StellarSDK.Keypair.fromSecret(privateKey);
      builtTx.sign(keypair);

      const response = await this.server.submitTransaction(builtTx);
      return response.hash;
    } catch (error: any) {
      console.error('Failed to cancel offer:', error);
      if (error?.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        throw new Error(`Cancel failed: ${codes.transaction} - ${codes.operations?.join(', ')}`);
      }
      throw new Error('Offer cancel failed');
    }
  }

  async editOffer(
    accountId: string,
    offer: ActiveOffer,
    newAmount: string,
    newPrice: string,
    privateKey: string
  ): Promise<string> {
    if (!privateKey.startsWith('S') || privateKey.length !== 56) {
      throw new Error('Invalid Stellar private key format');
    }

    if (parseFloat(newAmount) <= 0 || parseFloat(newPrice) <= 0) {
      throw new Error('Amount and price must be positive');
    }

    try {
      const sourceAccount = await this.server.loadAccount(accountId);
      const sellingAsset =
        offer.selling.code === 'XLM'
          ? StellarSDK.Asset.native()
          : new StellarSDK.Asset(offer.selling.code, offer.selling.issuer!);

      const buyingAsset =
        offer.buying.code === 'XLM'
          ? StellarSDK.Asset.native()
          : new StellarSDK.Asset(offer.buying.code, offer.buying.issuer!);

      const txBuilder = new StellarSDK.TransactionBuilder(sourceAccount, {
        fee: StellarSDK.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      const operation = StellarSDK.Operation.manageSellOffer({
        selling: sellingAsset,
        buying: buyingAsset,
        amount: newAmount,
        price: newPrice,
        offerId: offer.id,
      });

      txBuilder.addOperation(operation);
      txBuilder.setTimeout(300);

      const builtTx = txBuilder.build();
      const keypair = StellarSDK.Keypair.fromSecret(privateKey);
      builtTx.sign(keypair);

      const response = await this.server.submitTransaction(builtTx);
      return response.hash;
    } catch (error: any) {
      console.error('Failed to edit offer:', error);
      if (error?.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        throw new Error(`Edit failed: ${codes.transaction} - ${codes.operations?.join(', ')}`);
      }
      throw new Error('Offer edit failed');
    }
  }
}
