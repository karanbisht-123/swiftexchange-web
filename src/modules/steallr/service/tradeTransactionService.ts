import * as StellarSDK from '@stellar/stellar-sdk';
import type { Horizon } from '@stellar/stellar-sdk';

import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import type { ActiveOffer, CompletedTrade } from '../types/tradeTransaction.types';

export class TradeTransactionService {
  private server: StellarSDK.Horizon.Server;
  private networkPassphrase: string;
  private currentNetwork: any;

  private accountCache: Map<string, { account: any; timestamp: number }> = new Map();
  private readonly ACCOUNT_CACHE_TTL = 30_000;

  private static serverCache: Map<
    string,
    { server: StellarSDK.Horizon.Server; timestamp: number }
  > = new Map();
  private static readonly SERVER_CACHE_TTL = 300_000;

  constructor() {
    this.currentNetwork = useWalletStore.getState().network;
    const config = getStellarConfig(this.currentNetwork);

    if (!config) {
      throw new Error(`Unsupported Stellar network: ${this.currentNetwork}`);
    }

    const cacheKey = `${config.horizonUrl}_${config.networkPassphrase}`;
    const cached = TradeTransactionService.serverCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < TradeTransactionService.SERVER_CACHE_TTL) {
      this.server = cached.server;
    } else {
      const serverOptions: any = {};
      if (config.horizonUrl.startsWith('http://')) {
        serverOptions.allowHttp = true;
      }

      this.server = new StellarSDK.Horizon.Server(config.horizonUrl, serverOptions);
      TradeTransactionService.serverCache.set(cacheKey, { server: this.server, timestamp: now });
    }

    this.networkPassphrase = config.networkPassphrase;
  }
  private mapOfferRecordToActiveOffer = (offer: Horizon.ServerApi.OfferRecord): ActiveOffer => ({
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
  });

  private mapTradeRecordToCompletedTrade = (
    trade: Horizon.ServerApi.TradeRecord,
    accountId: string
  ): CompletedTrade => {
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
  };

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
      const hasMore = response.records.length === limit;
      const nextCursor = hasMore
        ? response.records[response.records.length - 1].paging_token
        : undefined;

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
      const hasMore = response.records.length === limit;
      const nextCursor = hasMore
        ? response.records[response.records.length - 1].paging_token
        : undefined;

      return { trades, nextCursor, hasMore };
    } catch (error) {
      console.error('Failed to fetch completed trades:', error);
      throw new Error('Failed to fetch completed trades');
    }
  }
  private async loadAccountWithCache(accountId: string): Promise<any> {
    const now = Date.now();
    const cached = this.accountCache.get(accountId);

    if (cached && now - cached.timestamp < this.ACCOUNT_CACHE_TTL) {
      return cached.account;
    }

    const account = await this.server.loadAccount(accountId);
    this.accountCache.set(accountId, { account, timestamp: now });
    return account;
  }
  private createAsset(code: string, issuer?: string): StellarSDK.Asset {
    return code === 'XLM' ? StellarSDK.Asset.native() : new StellarSDK.Asset(code, issuer!);
  }
  private async buildTransactionBase(
    accountId: string,
    operation: StellarSDK.xdr.Operation,
    options: any = {}
  ): Promise<{ builtTx: StellarSDK.Transaction; sourceAccount: any }> {
    const sourceAccount = await this.loadAccountWithCache(accountId);

    const txBuilder = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: options.fee || StellarSDK.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    });

    txBuilder.addOperation(operation);

    if (options.memo) {
      txBuilder.addMemo(StellarSDK.Memo.text(options.memo));
    }

    txBuilder.setTimeout(options.timeout || 300);

    return { builtTx: txBuilder.build(), sourceAccount };
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
      const sellingAsset = this.createAsset(offer.selling.code, offer.selling.issuer);
      const buyingAsset = this.createAsset(offer.buying.code, offer.buying.issuer);

      const operation = StellarSDK.Operation.manageSellOffer({
        selling: sellingAsset,
        buying: buyingAsset,
        amount: '0',
        price: offer.price,
        offerId: offer.id,
      });

      const { builtTx, sourceAccount } = await this.buildTransactionBase(
        accountId,
        operation,
        options
      );

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
        xdr: builtTx.toXDR(),
        networkPassphrase: this.networkPassphrase,
      };
    } catch (error: any) {
      console.error('Failed to build cancel offer transaction:', error);
      throw new Error('Failed to build cancel offer transaction');
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
      const sellingAsset = this.createAsset(offer.selling.code, offer.selling.issuer);
      const buyingAsset = this.createAsset(offer.buying.code, offer.buying.issuer);

      const operation = StellarSDK.Operation.manageSellOffer({
        selling: sellingAsset,
        buying: buyingAsset,
        amount: newAmount,
        price: newPrice,
        offerId: offer.id,
      });

      const { builtTx, sourceAccount } = await this.buildTransactionBase(
        accountId,
        operation,
        options
      );

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
        xdr: builtTx.toXDR(),
        networkPassphrase: this.networkPassphrase,
      };
    } catch (error: any) {
      console.error('Failed to build edit offer transaction:', error);
      throw new Error('Failed to build edit offer transaction');
    }
  }

  // OPTIMIZATION 7: Unified wallet execution with better error handling
  private async executeTransactionWithWalletConnect(
    transaction: any,
    walletProvider: any,
    operationType: string
  ): Promise<string> {
    try {
      if (!transaction.xdr) {
        throw new Error('Stellar transaction requires XDR data');
      }

      const isMainnet = this.networkPassphrase.includes('Public Global Stellar Network');
      const network = isMainnet ? 'MAINNET' : 'TESTNET';

      const signParams = {
        xdr: transaction.xdr,
        networkPassphrase: this.networkPassphrase,
        network,
      };

      console.log(`[${operationType}] Executing Stellar transaction via WalletConnect...`);

      const result = await walletProvider.request({
        method: 'stellar_signAndSubmitXDR',
        params: signParams,
      });

      if (result.status === 'success') {
        console.log(`[${operationType}] Transaction successful!`);
        return result.hash || result.transactionHash || 'stellar_submitted';
      }

      throw new Error(`${operationType} failed - invalid status`);
    } catch (error: any) {
      console.error(`[${operationType}] Execution failed:`, {
        message: error.message,
        code: error.code,
      });

      if (error?.response?.data?.extras?.result_codes) {
        const codes = error.response.data.extras.result_codes;
        throw new Error(
          `${operationType} failed: ${codes.transaction} - ${codes.operations?.join(', ')}`
        );
      }

      throw new Error(
        `${operationType} execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async executeCancelOfferWithWalletConnect(
    transaction: any,
    walletProvider: any
  ): Promise<string> {
    return this.executeTransactionWithWalletConnect(transaction, walletProvider, 'Cancel offer');
  }

  async executeEditOfferWithWalletConnect(transaction: any, walletProvider: any): Promise<string> {
    return this.executeTransactionWithWalletConnect(transaction, walletProvider, 'Edit offer');
  }
  async getActiveOffersAndTrades(
    accountId: string,
    offersLimit: number = 10,
    tradesLimit: number = 10
  ): Promise<{
    offers: ActiveOffer[];
    trades: CompletedTrade[];
    offersNextCursor?: string;
    tradesNextCursor?: string;
  }> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(accountId)) {
      throw new Error('Invalid Stellar account ID');
    }
    const [offersResult, tradesResult] = await Promise.allSettled([
      this.getActiveOffers(accountId, offersLimit),
      this.getCompletedTrades(accountId, tradesLimit),
    ]);

    return {
      offers: offersResult.status === 'fulfilled' ? offersResult.value.offers : [],
      trades: tradesResult.status === 'fulfilled' ? tradesResult.value.trades : [],
      offersNextCursor:
        offersResult.status === 'fulfilled' ? offersResult.value.nextCursor : undefined,
      tradesNextCursor:
        tradesResult.status === 'fulfilled' ? tradesResult.value.nextCursor : undefined,
    };
  }
  clearAccountCache(accountId?: string): void {
    if (accountId) {
      this.accountCache.delete(accountId);
    } else {
      this.accountCache.clear();
    }
  }

  async prefetchAccountData(accountId: string): Promise<void> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(accountId)) {
      return;
    }

    try {
      await this.loadAccountWithCache(accountId);
    } catch (error) {
      console.warn('Failed to prefetch account data:', error);
    }
  }
  async getAllOperations(
    accountId: string,
    limit: number = 20,
    cursor?: string
  ): Promise<{
    operations: any[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(accountId)) {
      throw new Error('Invalid Stellar account ID');
    }

    try {
      const response = await this.server
        .operations()
        .forAccount(accountId)
        .limit(limit)
        .cursor(cursor || '')
        .order('desc')
        .includeFailed(false)
        .call();

      const hasMore = response.records.length === limit;
      const nextCursor = hasMore
        ? response.records[response.records.length - 1].paging_token
        : undefined;

      return { operations: response.records, nextCursor, hasMore };
    } catch (error) {
      console.error('Failed to fetch operations:', error);
      throw new Error('Failed to fetch operations');
    }
  }

  async getClaimableBalances(accountId: string): Promise<any[]> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(accountId)) {
      throw new Error('Invalid Stellar account ID');
    }

    try {
      const response = await this.server.claimableBalances().claimant(accountId).limit(50).call();

      return response.records;
    } catch (error) {
      console.error('Failed to fetch claimable balances:', error);
      throw new Error('Failed to fetch claimable balances');
    }
  }

  async buildClaimBalanceTransaction(
    accountId: string,
    balanceId: string,
    options: any = {}
  ): Promise<any> {
    if (!StellarSDK.StrKey.isValidEd25519PublicKey(accountId)) {
      throw new Error('Invalid Stellar account ID');
    }

    try {
      const operation = StellarSDK.Operation.claimClaimableBalance({
        balanceId: balanceId,
      });

      const { builtTx, sourceAccount } = await this.buildTransactionBase(
        accountId,
        operation,
        options
      );

      return {
        id: `claim-balance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'claim-balance',
        from: accountId,
        balanceId,
        sequence: sourceAccount.sequence,
        fee: options.fee || StellarSDK.BASE_FEE,
        memo: options.memo,
        timestamp: Date.now(),
        status: 'pending',
        xdr: builtTx.toXDR(),
        networkPassphrase: this.networkPassphrase,
      };
    } catch (error: any) {
      console.error('Failed to build claim balance transaction:', error);
      throw new Error('Failed to build claim balance transaction');
    }
  }

  async executeClaimBalanceWithWalletConnect(
    transaction: any,
    walletProvider: any
  ): Promise<string> {
    return this.executeTransactionWithWalletConnect(transaction, walletProvider, 'Claim Balance');
  }
}
