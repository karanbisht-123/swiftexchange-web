import * as StellarSDK from '@stellar/stellar-sdk';
import type { Horizon } from '@stellar/stellar-sdk';

import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import type { ActiveOffer, CompletedTrade } from '../types/tradeTransaction.types';
import { StellarSequenceTracker } from '../utils/StellarSequenceTracker';
import { signAndSubmitTransaction } from '../utils/transactionService';

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
    const transactionHash = (trade as any)._links?.transaction?.href?.split('/').pop();
    const operationId = (trade as any)._links?.operation?.href?.split('/').pop();

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
      transactionHash,
      operationId,
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
      // Fetch more trades than requested to allow grouping of paths
      const fetchLimit = Math.max(limit * 3, 50);
      const response = await this.server
        .trades()
        .forAccount(accountId)
        .limit(fetchLimit)
        .cursor(cursor || '')
        .order('desc')
        .call();

      if (response.records.length === 0) {
        return { trades: [], hasMore: false };
      }

      // Group trades by operationId
      const groups = new Map<string, Horizon.ServerApi.TradeRecord[]>();
      const ungroupedTrades: Horizon.ServerApi.TradeRecord[] = [];

      response.records.forEach(record => {
        const opId = (record as any)._links?.operation?.href?.split('/').pop();
        if (opId) {
          const group = groups.get(opId) || [];
          group.push(record);
          groups.set(opId, group);
        } else {
          ungroupedTrades.push(record);
        }
      });

      const consolidatedTrades: CompletedTrade[] = [];

      // Process grouped trades
      groups.forEach((groupTrades, opId) => {
        if (groupTrades.length === 1) {
          consolidatedTrades.push(this.mapTradeRecordToCompletedTrade(groupTrades[0], accountId));
          return;
        }

        // Consolidated multi-hop trade
        // Track net flow for each asset
        const assetFlow = new Map<string, { amount: number; code: string; issuer?: string }>();

        groupTrades.forEach(t => {
          const isBaseSource = t.base_account === accountId;
          const isCounterSource = t.counter_account === accountId;

          // Base asset flow
          const baseKey = `${t.base_asset_code || 'XLM'}:${t.base_asset_issuer || ''}`;
          const currentBase = assetFlow.get(baseKey) || {
            amount: 0,
            code: t.base_asset_code || 'XLM',
            issuer: t.base_asset_issuer,
          };
          // If user is base_account, they are "Selling" base (negative flow).
          // If user is counter_account, they are "Buying" base from someone else (positive flow).
          currentBase.amount += isBaseSource
            ? -parseFloat(t.base_amount)
            : parseFloat(t.base_amount);
          assetFlow.set(baseKey, currentBase);

          // Counter asset flow
          const counterKey = `${t.counter_asset_code || 'XLM'}:${t.counter_asset_issuer || ''}`;
          const currentCounter = assetFlow.get(counterKey) || {
            amount: 0,
            code: t.counter_asset_code || 'XLM',
            issuer: t.counter_asset_issuer,
          };
          currentCounter.amount += isCounterSource
            ? -parseFloat(t.counter_amount)
            : parseFloat(t.counter_amount);
          assetFlow.set(counterKey, currentCounter);
        });

        // Identify starting and ending assets
        const flows = Array.from(assetFlow.values()).filter(f => Math.abs(f.amount) > 0.0000001);
        const spent = flows.filter(f => f.amount < 0).sort((a, b) => a.amount - b.amount)[0]; // Most negative
        const received = flows.filter(f => f.amount > 0).sort((a, b) => b.amount - a.amount)[0]; // Most positive

        if (spent && received) {
          const firstTrade = groupTrades[0];
          const transactionHash = (firstTrade as any)._links?.transaction?.href?.split('/').pop();

          consolidatedTrades.push({
            id: firstTrade.id,
            baseAsset: { code: spent.code, issuer: spent.issuer },
            counterAsset: { code: received.code, issuer: received.issuer },
            baseAmount: Math.abs(spent.amount).toString(),
            counterAmount: received.amount.toString(),
            price: (received.amount / Math.abs(spent.amount)).toString(),
            ledgerCloseTime: firstTrade.ledger_close_time,
            isBuy: false,
            trade_type: 'path_payment',
            transactionHash,
            operationId: opId,
          });
        }
      });

      // Add ungrouped trades
      ungroupedTrades.forEach(t => {
        consolidatedTrades.push(this.mapTradeRecordToCompletedTrade(t, accountId));
      });

      // Sort by time descending
      consolidatedTrades.sort(
        (a, b) => new Date(b.ledgerCloseTime).getTime() - new Date(a.ledgerCloseTime).getTime()
      );

      const finalTrades = consolidatedTrades.slice(0, limit);
      const hasMore = response.records.length === fetchLimit;
      const nextCursor = hasMore
        ? response.records[response.records.length - 1].paging_token
        : undefined;

      return { trades: finalTrades, nextCursor, hasMore };
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
  ): Promise<{ builtTx: StellarSDK.Transaction; baseSeq: string }> {
    const accountResponse = await this.loadAccountWithCache(accountId);
    const baseSeq = StellarSequenceTracker.getAndIncrementSequence(
      accountId,
      accountResponse.sequenceNumber()
    );
    const sourceAccount = new StellarSDK.Account(accountId, baseSeq);

    const txBuilder = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: options.fee || StellarSDK.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    });

    txBuilder.addOperation(operation);

    if (options.memo) {
      txBuilder.addMemo(StellarSDK.Memo.text(options.memo));
    }

    txBuilder.setTimeout(options.timeout || 300);

    return { builtTx: txBuilder.build(), baseSeq };
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

      const { builtTx, baseSeq } = await this.buildTransactionBase(accountId, operation, options);

      return {
        id: `cancel-offer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'cancel-offer',
        from: accountId,
        offer,
        sequence: baseSeq,
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

      const { builtTx, baseSeq } = await this.buildTransactionBase(accountId, operation, options);

      return {
        id: `edit-offer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'edit-offer',
        from: accountId,
        offer,
        newAmount,
        newPrice,
        sequence: baseSeq,
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

  private async executeTransactionWithWalletConnect(
    transaction: any,
    walletProvider: any,
    operationType: string
  ): Promise<string> {
    const isMainnet = this.networkPassphrase.includes('Public Global Stellar Network');
    const network = isMainnet ? 'mainnet' : 'testnet';

    const result = await signAndSubmitTransaction({
      xdr: transaction.xdr,
      network,
      networkPassphrase: this.networkPassphrase,
      provider: walletProvider,
    });

    if (result.success) {
      return result.hash || '';
    }

    throw new Error(`${operationType} failed: ${result.error || 'Unknown error'}`);
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

      const { builtTx, baseSeq } = await this.buildTransactionBase(accountId, operation, options);

      return {
        id: `claim-balance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'claim-balance',
        from: accountId,
        balanceId,
        sequence: baseSeq,
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
