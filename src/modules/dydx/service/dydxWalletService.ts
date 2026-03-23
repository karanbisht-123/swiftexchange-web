import { SubaccountInfo } from '@dydxprotocol/v4-client-js';
import Long from 'long';

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
type StatusCallback = (status: DydxStatus, payload?: any) => void;

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

  async connect(networkType: NetworkType, subaccountNumber: number = 0): Promise<DydxConnection> {
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
      const balance = hasSubaccount ? await this.fetchBalance(true) : undefined;

      this.setStatus(hasSubaccount ? 'connected' : 'no_subaccount');

      return {
        address: this.address,
        chainId: this.chainId,
        subaccountNumber,
        hasSubaccount,
        balance,
      };
    } catch (error: any) {
      console.error('[dydxWalletService] Connection error:', error);
      this.setStatus('error', { error: error.message });
      throw error;
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
    return await getCompositeClient();
  }

  async getBalance(forceRefresh = false): Promise<AccountBalance> {
    if (!forceRefresh && this.balanceCache) {
      const age = Date.now() - this.balanceCache.timestamp;
      if (age < this.BALANCE_CACHE_TTL) {
        return this.balanceCache.data;
      }
    }
    return this.fetchBalance(forceRefresh);
  }

  private async fetchBalance(_forceRefresh = false): Promise<AccountBalance> {
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
    } catch (error: any) {
      throw new Error(`Failed to fetch balance: ${error.message}`);
    }
  }

  async depositToSubaccount(
    quantumsString: string,
    subaccountNumber: number = 0
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

      let txHash = typeof result.hash === 'string' ? result.hash : 'unknown';
      if (result.hash && typeof result.hash !== 'string') {
        const data = (result.hash as any).data || result.hash;
        if (Array.isArray(data) || data instanceof Uint8Array) {
          txHash = Array.from(data as any[])
            .map((b: any) => b.toString(16).padStart(2, '0'))
            .join('');
        }
      }

      return { success: true, transactionHash: txHash };
    } catch (error: any) {
      console.error('[dydxWalletService] depositToSubaccount failed:', error);
      return { success: false, error: error.message || 'Deposit failed' };
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

      const recipient = toAddress || address; // Send to self if no address is provided

      const result = await client.validatorClient.post.withdraw(
        subaccount,
        0, // Asset ID 0 for USDC
        Long.fromString(amountInQuantums.toString()),
        recipient
      );

      let txHash = typeof result.hash === 'string' ? result.hash : 'unknown';
      if (result.hash && typeof result.hash !== 'string') {
        const data = (result.hash as any).data || result.hash;
        if (Array.isArray(data) || data instanceof Uint8Array) {
          txHash = Array.from(data)
            .map((b: any) => b.toString(16).padStart(2, '0'))
            .join('');
        }
      }

      return {
        success: true,
        transactionHash: txHash,
      };
    } catch (error: any) {
      console.error('[dydxWalletService] Withdraw failed:', error);
      return {
        success: false,
        error: error.message || 'Withdraw failed',
      };
    }
  }

  isConnected = () => this.status === 'connected' || this.status === 'no_subaccount';
  isReadyForTrading = () => this.status === 'connected';
  getAddress = () => this.address || this.getAddressFromStore();
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

  private setStatus(status: DydxStatus, payload?: any): void {
    this.status = status;
    this.listeners.forEach(cb => cb(status, payload));
  }
}

export const dydxWalletService = new DydxWalletService();
