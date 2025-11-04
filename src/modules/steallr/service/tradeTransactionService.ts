import * as StellarSDK from '@stellar/stellar-sdk';
import type { Horizon } from '@stellar/stellar-sdk';

// import { isStellarNetwork } from '../../../utils/transactionUtils';
import { getStellarConfig } from '../../walletconnect/config/chains';
import type { ActiveOffer, CompletedTrade } from '../types/tradeTransaction.types';

export class TradeTransactionService {
  private server: StellarSDK.Horizon.Server;
  private networkPassphrase: string;
  // private networkKey: string;

  constructor(networkKey: string) {
    const config = getStellarConfig();
    if (!config) {
      throw new Error(`Unsupported Stellar network: ${networkKey}`);
    }

    const serverOptions: any = {};
    if (config.horizonUrl.startsWith('http://')) {
      serverOptions.allowHttp = true;
    }

    this.server = new StellarSDK.Horizon.Server(config.horizonUrl, serverOptions);
    this.networkPassphrase = config.networkPassphrase;
    // this.networkKey = networkKey;
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

  async buildCancelOfferTransaction(
    accountId: string,
    offer: ActiveOffer,
    options: any = {}
  ): Promise<any> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(accountId)) {
      throw new Error('Invalid Stellar account ID');
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
        fee: options.fee || StellarSDK.BASE_FEE,
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

      if (options.memo) {
        txBuilder.addMemo(StellarSDK.Memo.text(options.memo));
      }
      txBuilder.setTimeout(options.timeout || 300);

      const builtTx = txBuilder.build();
      const xdr = builtTx.toXDR();

      return {
        id: `cancel-offer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'cancel-offer',
        from: accountId,
        offer,
        sequence: sourceAccount.sequence,
        fee: options.fee || StellarSDK.BASE_FEE,
        memo: options.memo,
        timestamp: Date.now(),
        status: 'pending',
        xdr,
        networkPassphrase: this.networkPassphrase,
      };
    } catch (error: any) {
      console.error('Failed to build cancel offer transaction:', error);
      throw new Error('Failed to build cancel offer transaction');
    }
  }

  async executeCancelOfferWithWalletConnect(
    transaction: any,
    walletProvider: any
  ): Promise<string> {
    try {
      console.log('Preparing Stellar transaction via WalletConnect...');

      if (!transaction.xdr) {
        console.error('Missing XDR data');
        throw new Error('Stellar transaction requires XDR data');
      }

      const isMainnet = this.networkPassphrase.includes('Public Global Stellar Network');
      const network = isMainnet ? 'MAINNET' : 'TESTNET';

      const signParams = {
        xdr: transaction.xdr,
        networkPassphrase: this.networkPassphrase,
        network,
      };

      console.log('Calling walletProvider.request with stellar_signAndSubmitXDR...', signParams);

      const result = await walletProvider.request({
        method: 'stellar_signAndSubmitXDR',
        params: signParams,
      });

      console.log('WalletConnect provider response:', result);

      if (result.status === 'success') {
        console.log('Stellar transaction successful!');
        return result.hash || result.transactionHash || 'stellar_submitted';
      }

      console.error('Stellar transaction failed - status not success');
      throw new Error('Stellar transaction failed');
    } catch (error: any) {
      console.error('Failed to execute cancel offer via WalletConnect:', {
        message: error.message,
        code: error.code,
        fullError: error,
      });
      if (error?.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        throw new Error(`Cancel failed: ${codes.transaction} - ${codes.operations?.join(', ')}`);
      }
      throw new Error(
        `Cancel execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async buildEditOfferTransaction(
    accountId: string,
    offer: ActiveOffer,
    newAmount: string,
    newPrice: string,
    options: any = {}
  ): Promise<any> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(accountId)) {
      throw new Error('Invalid Stellar account ID');
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
        fee: options.fee || StellarSDK.BASE_FEE,
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

      if (options.memo) {
        txBuilder.addMemo(StellarSDK.Memo.text(options.memo));
      }
      txBuilder.setTimeout(options.timeout || 300);

      const builtTx = txBuilder.build();
      const xdr = builtTx.toXDR();

      return {
        id: `edit-offer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'edit-offer',
        from: accountId,
        offer,
        newAmount,
        newPrice,
        sequence: sourceAccount.sequence,
        fee: options.fee || StellarSDK.BASE_FEE,
        memo: options.memo,
        timestamp: Date.now(),
        status: 'pending',
        xdr,
        networkPassphrase: this.networkPassphrase,
      };
    } catch (error: any) {
      console.error('Failed to build edit offer transaction:', error);
      throw new Error('Failed to build edit offer transaction');
    }
  }

  async executeEditOfferWithWalletConnect(transaction: any, walletProvider: any): Promise<string> {
    try {
      console.log('Preparing Stellar transaction via WalletConnect...');

      if (!transaction.xdr) {
        console.error('Missing XDR data');
        throw new Error('Stellar transaction requires XDR data');
      }

      const isMainnet = this.networkPassphrase.includes('Public Global Stellar Network');
      const network = isMainnet ? 'MAINNET' : 'TESTNET';

      const signParams = {
        xdr: transaction.xdr,
        networkPassphrase: this.networkPassphrase,
        network,
      };

      console.log('Calling walletProvider.request with stellar_signAndSubmitXDR...', signParams);

      const result = await walletProvider.request({
        method: 'stellar_signAndSubmitXDR',
        params: signParams,
      });

      console.log('WalletConnect provider response:', result);

      if (result.status === 'success') {
        console.log('Stellar transaction successful!');
        return result.hash || result.transactionHash || 'stellar_submitted';
      }

      console.error('Stellar transaction failed - status not success');
      throw new Error('Stellar transaction failed');
    } catch (error: any) {
      console.error('Failed to execute edit offer via WalletConnect:', {
        message: error.message,
        code: error.code,
        fullError: error,
      });
      if (error?.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        throw new Error(`Edit failed: ${codes.transaction} - ${codes.operations?.join(', ')}`);
      }
      throw new Error(
        `Edit execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
