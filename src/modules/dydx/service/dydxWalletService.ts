import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getCompositeClient, getIndexerClient } from '../client/clients';
import { type MarginMode, SUBACCOUNT_CONSTANTS } from '../types/trading.types';

type NetworkType = 'mainnet' | 'testnet';

export interface AccountBalance {
  equity: string;
  freeCollateral: string;
  // totalTradingRewards: string;
  // marginUsage: string;
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
  private activeSubaccountNumber = 0; // For trading operations (can differ from connection subaccount)
  private status: DydxStatus = 'disconnected';
  private listeners: StatusCallback[] = [];
  private balanceCache: { data: AccountBalance; timestamp: number } | null = null;
  private readonly BALANCE_CACHE_TTL = 10_000;
  private isConnecting = false;

  async connect(networkType: NetworkType, subaccountNumber: number = 0): Promise<DydxConnection> {
    // console.log(networkType);
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

      // Verify indexer connection
      try {
        await indexerClient.utility.getHeight();
        console.log('[dydxWalletService] IndexerClient verified');
      } catch (err) {
        console.error('[dydxWalletService] IndexerClient verification failed:', err);
        throw new Error('Failed to connect to Indexer');
      }

      // Set service state
      this.address = address;
      this.subaccountNumber = subaccountNumber;
      this.chainId = compositeClient.validatorClient.config.chainId;

      // Check subaccount and fetch balance
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
    console.log('[dydxWalletService] Disconnecting');
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
        console.log('[dydxWalletService] Returning cached balance');
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
      console.log('[dydxWalletService] Fetching balance for:', address);

      const indexerClient = getIndexerClient();
      const resp = await indexerClient.account.getSubaccount(address, this.subaccountNumber);

      if (!resp.subaccount) {
        throw new Error('Subaccount not found');
      }

      const balance: AccountBalance = {
        equity: resp.subaccount.equity ?? '0',
        freeCollateral: resp.subaccount.freeCollateral ?? '0',
        // totalTradingRewards: resp.subaccount.totalTradingRewards ?? '0',
        // marginUsage: resp.subaccount.marginUsage ?? '0',
      };

      this.balanceCache = { data: balance, timestamp: Date.now() };
      console.log('[dydxWalletService] Balance fetched successfully');

      return balance;
    } catch (error: any) {
      console.error('[dydxWalletService] Balance fetch error:', error);
      throw new Error(`Failed to fetch balance: ${error.message}`);
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
      console.warn('[dydxWalletService] Invalid subaccount number:', subaccountNumber);
      return;
    }
    console.log('[dydxWalletService] Active subaccount changed:', this.activeSubaccountNumber, '->', subaccountNumber);
    this.activeSubaccountNumber = subaccountNumber;
  }

  getMarginMode(): MarginMode {
    return this.activeSubaccountNumber >= SUBACCOUNT_CONSTANTS.ISOLATED_START ? 'ISOLATED' : 'CROSS';
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
    if (!address) {
      return false;
    }

    try {
      const indexerClient = getIndexerClient();
      const resp = await indexerClient.account.getSubaccount(address, this.subaccountNumber);

      console.log('[dydxWalletService] Subaccount check:', !!resp.subaccount);
      return !!resp.subaccount;
    } catch (error) {
      console.error('[dydxWalletService] Check subaccount error:', error);
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
    console.log('[dydxWalletService] Status change:', status);
    this.status = status;
    this.listeners.forEach(cb => cb(status, payload));
  }
}

export const dydxWalletService = new DydxWalletService();
