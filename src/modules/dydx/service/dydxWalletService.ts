import { SubaccountInfo } from '@dydxprotocol/v4-client-js';
import { Long } from '@dydxprotocol/v4-proto/src/codegen/helpers';

import { walletService } from '../../walletconnect/services/walletService';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getCompositeClient, getIndexerClient } from '../client/clients';
import { type MarginMode, SUBACCOUNT_CONSTANTS } from '../types/trading.types';

type NetworkType = 'mainnet' | 'testnet';

export interface AccountBalance {
  equity: string;
  freeCollateral: string;
}

export interface DydxConnection {
  address: string;
  chainId: string;
  subaccountNumber: number;
  hasSubaccount: boolean;
  balance?: AccountBalance;
}

export type DydxStatus = 'disconnected' | 'connecting' | 'connected' | 'no_subaccount' | 'error';

interface StatusErrorPayload {
  error: string;
}

type StatusCallback = (status: DydxStatus, payload?: StatusErrorPayload) => void;

class DydxWalletService {
  private address = '';
  private chainId = '';
  private subaccountNumber = 0;
  private activeSubaccountNumber = 0;
  private status: DydxStatus = 'disconnected';
  private listeners: StatusCallback[] = [];
  private balanceCache: { data: AccountBalance; timestamp: number } | null = null;
  private readonly BALANCE_CACHE_TTL = 10_000;
  private isConnecting = false;

  async connect(networkType: NetworkType, subaccountNumber = 0): Promise<DydxConnection> {
    if (this.isConnecting) {
      throw new Error('Connection already in progress');
    }

    this.isConnecting = true;
    this.setStatus('connecting');

    try {
      const address = this.getAddressFromStore();
      if (!address) {
        throw new Error('No dYdX wallet found in store');
      }

      useWalletStore.setState({ network: networkType });

      const compositeClient = await getCompositeClient();
      const indexerClient = getIndexerClient();

      try {
        await indexerClient.utility.getHeight();
      } catch (err) {
        console.error('[dydxWalletService] IndexerClient verification failed:', err);
        throw new Error('Failed to connect to Indexer');
      }

      this.address = address;
      this.subaccountNumber = subaccountNumber;
      this.chainId = compositeClient.validatorClient.config.chainId;

      const hasSubaccount = await this.checkSubaccountExists();
      const balance = hasSubaccount ? await this.fetchBalance() : undefined;

      this.setStatus(hasSubaccount ? 'connected' : 'no_subaccount');

      return {
        address: this.address,
        chainId: this.chainId,
        subaccountNumber,
        hasSubaccount,
        balance,
      };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[dydxWalletService] Connection error:', err);
      this.setStatus('error', { error: err.message });
      throw err;
    } finally {
      this.isConnecting = false;
    }
  }

  disconnect(): void {
    this.address = '';
    this.chainId = '';
    this.subaccountNumber = 0;
    this.balanceCache = null;
    this.setStatus('disconnected');
  }

  getIndexerClient() {
    return getIndexerClient();
  }

  async getCompositeClient() {
    return getCompositeClient();
  }

  async getBalance(forceRefresh = false): Promise<AccountBalance> {
    if (!forceRefresh && this.balanceCache) {
      const age = Date.now() - this.balanceCache.timestamp;
      if (age < this.BALANCE_CACHE_TTL) {
        return this.balanceCache.data;
      }
    }
    return this.fetchBalance();
  }

  private async fetchBalance(): Promise<AccountBalance> {
    const address = this.address || this.getAddressFromStore();
    if (!address) {
      throw new Error('Not connected - address missing');
    }

    try {
      const indexerClient = getIndexerClient();
      const resp = await indexerClient.account.getSubaccount(address, this.subaccountNumber);

      if (!resp.subaccount) {
        throw new Error('Subaccount not found');
      }

      const balance: AccountBalance = {
        equity: resp.subaccount.equity ?? '0',
        freeCollateral: resp.subaccount.freeCollateral ?? '0',
      };

      this.balanceCache = { data: balance, timestamp: Date.now() };
      return balance;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new Error(`Failed to fetch balance: ${err.message}`);
    }
  }

  async depositToSubaccount(
    quantumsString: string,
    subaccountNumber = 0
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      const client = await this.getCompositeClient();
      const address = this.getAddress();
      if (!client || !address) throw new Error('Wallet not connected');

      const localWallet = walletService.getSigningWallet();
      if (!localWallet)
        throw new Error('Signing wallet not available - please derive dYdX wallet first');

      const subaccount = SubaccountInfo.forLocalWallet(localWallet, subaccountNumber);
      const quantums = Long.fromString(quantumsString);

      const result = await client.validatorClient.post.deposit(subaccount, 0, quantums);

      return { success: true, transactionHash: this.extractHash(result.hash) };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[dydxWalletService] depositToSubaccount failed:', err);
      return { success: false, error: err.message || 'Deposit failed' };
    }
  }

  async withdraw(
    amount: string,
    toAddress?: string
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      const client = await this.getCompositeClient();
      const address = this.getAddress();
      if (!client || !address) {
        throw new Error('Wallet not connected');
      }

      const evmSession = walletService.getSession('evm');
      if (!evmSession?.evmAddress) {
        throw new Error('EVM wallet not connected');
      }

      const localWallet = walletService.getSigningWallet();
      if (!localWallet) {
        throw new Error('Signing wallet not available - please derive dYdX wallet first');
      }

      const subaccount = SubaccountInfo.forLocalWallet(localWallet, this.subaccountNumber);
      const amountInQuantums = Math.floor(parseFloat(amount) * 1e6);

      if (amountInQuantums <= 0) {
        throw new Error('Withdraw amount must be greater than 0');
      }

      const recipient = toAddress || address;

      const result = await client.validatorClient.post.withdraw(
        subaccount,
        0,
        Long.fromString(amountInQuantums.toString()),
        recipient
      );

      return { success: true, transactionHash: this.extractHash(result.hash) };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[dydxWalletService] Withdraw failed:', err);
      return { success: false, error: err.message || 'Withdraw failed' };
    }
  }

  async send(
    amount: string,
    toAddress: string
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      const client = await this.getCompositeClient();
      const address = this.getAddress();
      if (!client || !address) {
        throw new Error('Wallet not connected');
      }

      const localWallet = walletService.getSigningWallet();
      if (!localWallet) {
        throw new Error('Signing wallet not available - please derive dYdX wallet first');
      }
      const amountInQuantums = BigInt(Math.floor(parseFloat(amount) * 1e18));

      if (amountInQuantums <= 0n) {
        throw new Error('Send amount must be greater than 0');
      }

      const subaccount = SubaccountInfo.forLocalWallet(localWallet, 0);

      const msg = {
        typeUrl: '/cosmos.bank.v1.MsgSend',
        value: {
          fromAddress: address,
          toAddress: toAddress,
          amount: [{ denom: 'adydx', amount: amountInQuantums.toString() }],
        },
      };

      const result = await client.validatorClient.post.send(
        subaccount,
        () => Promise.resolve([msg]),
        false
      );

      return { success: true, transactionHash: this.extractHash(result.hash) };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[dydxWalletService] Send failed:', err);
      return { success: false, error: err.message || 'Send failed' };
    }
  }

  private extractHash(
    hash: string | Uint8Array | { data?: Uint8Array } | null | undefined
  ): string {
    if (typeof hash === 'string') return hash;
    const data = (hash as { data?: Uint8Array })?.data ?? hash;
    if (Array.isArray(data) || data instanceof Uint8Array) {
      return Array.from(data as Uint8Array)
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    return 'unknown';
  }

  isConnected = () => this.status === 'connected' || this.status === 'no_subaccount';
  isReadyForTrading = () => this.status === 'connected';
  getAddress = (): string | null => this.address || this.getAddressFromStore();
  getSubaccountNumber = () => this.subaccountNumber;
  getActiveSubaccountNumber = () => this.activeSubaccountNumber;
  getChainId = () => this.chainId;
  getStatus = () => this.status;

  setActiveSubaccount(subaccountNumber: number): void {
    if (subaccountNumber < 0 || subaccountNumber > SUBACCOUNT_CONSTANTS.ISOLATED_END) {
      return;
    }
    this.activeSubaccountNumber = subaccountNumber;
  }

  getMarginMode(): MarginMode {
    return this.activeSubaccountNumber >= SUBACCOUNT_CONSTANTS.ISOLATED_START
      ? 'ISOLATED'
      : 'CROSS';
  }

  resetToDefaultSubaccount(): void {
    this.activeSubaccountNumber = SUBACCOUNT_CONSTANTS.DEFAULT_CROSS_SUBACCOUNT;
  }

  private getAddressFromStore(): string | null {
    const store = useWalletStore.getState();
    return (
      store.connectedWallets.evm?.dydxAddress || store.connectedWallets.cosmos?.dydxAddress || null
    );
  }

  private async checkSubaccountExists(): Promise<boolean> {
    const address = this.address || this.getAddressFromStore();
    if (!address) return false;

    try {
      const indexerClient = getIndexerClient();
      const resp = await indexerClient.account.getSubaccount(address, this.subaccountNumber);
      return !!resp.subaccount;
    } catch {
      return false;
    }
  }

  onStatusChange(callback: StatusCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private setStatus(status: DydxStatus, payload?: StatusErrorPayload): void {
    this.status = status;
    this.listeners.forEach(cb => cb(status, payload));
  }
}

export const dydxWalletService = new DydxWalletService();
