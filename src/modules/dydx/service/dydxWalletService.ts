import { type OfflineDirectSigner } from '@cosmjs/proto-signing';
import {
  BECH32_PREFIX,
  CompositeClient,
  IndexerClient,
  LocalWallet,
  Network,
  SubaccountInfo,
} from '@dydxprotocol/v4-client-js';

import { getNetwork } from '../../walletconnect/config/chains';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { walletService } from '../../walletconnect/services/walletService';

export interface AccountBalance {
  equity: string;
  freeCollateral: string;
  totalTradingRewards: string;
  marginUsage: string;
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
  private compositeClient: CompositeClient | null = null;
  private indexerClient: IndexerClient | null = null;
  private localWallet: LocalWallet | null = null;
  private subaccountInfo: SubaccountInfo | null = null;
  private walletProvider: any = null;
  private offlineSigner: OfflineDirectSigner | null = null;
  private address = '';
  private chainId = '';
  private subaccountNumber = 0;
  private status: DydxStatus = 'disconnected';
  private listeners: StatusCallback[] = [];
  private balanceCache: { data: AccountBalance; timestamp: number } | null = null;
  private readonly BALANCE_CACHE_TTL = 10_000;
  private isConnecting = false;

  async connect(subaccountNumber: number = 0): Promise<DydxConnection> {
    if (this.isConnecting) throw new Error('Connection already in progress');
    this.isConnecting = true;
    this.setStatus('connecting');

    try {
      const networkType = getNetwork();
      const network = networkType === 'mainnet' ? Network.mainnet() : Network.testnet();
      this.chainId = network.validatorConfig.chainId;

      this.compositeClient = await CompositeClient.connect(network);
      this.indexerClient = new IndexerClient(network.indexerConfig);

      this.walletProvider = this.getCosmosProvider();
      this.offlineSigner = await this.getOfflineSigner();

      const accounts = await this.offlineSigner.getAccounts();
      this.address = accounts[0].address;

      if (!this.address.startsWith(BECH32_PREFIX)) {
        throw new Error(`Invalid dYdX address. Must start with "${BECH32_PREFIX}"`);
      }

      this.localWallet = await LocalWallet.fromOfflineSigner(this.offlineSigner);
      this.subaccountNumber = subaccountNumber;

      this.subaccountInfo = SubaccountInfo.forLocalWallet(this.localWallet, subaccountNumber);

      const hasSubaccount = await this.checkSubaccountExists();
      const balance = hasSubaccount ? await this.fetchBalance() : undefined;

      this.setStatus(hasSubaccount ? 'connected' : 'no_subaccount', {
        chainId: this.chainId,
        balance,
      });

      return {
        address: this.address,
        chainId: this.chainId,
        subaccountNumber,
        hasSubaccount,
        balance,
      };
    } catch (error: any) {
      this.cleanup();
      this.setStatus('error', { error: error.message });
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this.cleanup();
    this.setStatus('disconnected');
  }

  async getBalance(force = false): Promise<AccountBalance> {
    if (!this.isConnected()) throw new Error('Not connected');

    const now = Date.now();
    if (!force && this.balanceCache && now - this.balanceCache.timestamp < this.BALANCE_CACHE_TTL) {
      return this.balanceCache.data;
    }

    return this.fetchBalance();
  }

  isConnected(): boolean {
    return this.status === 'connected' || this.status === 'no_subaccount';
  }

  isReadyForTrading(): boolean {
    return this.status === 'connected' && !!this.localWallet && !!this.subaccountInfo;
  }

  getAddress(): string | null {
    return this.address || null;
  }

  getSubaccountNumber(): number {
    return this.subaccountNumber;
  }

  getStatus(): DydxStatus {
    return this.status;
  }

  getLocalWallet(): LocalWallet | null {
    return this.localWallet;
  }

  getSubaccountInfo(): SubaccountInfo | null {
    return this.subaccountInfo;
  }

  getCompositeClient(): CompositeClient | null {
    return this.compositeClient;
  }

  getIndexerClient(): IndexerClient | null {
    return this.indexerClient;
  }

  getChainId(): string {
    return this.chainId;
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

  private getCosmosProvider(): any {
    const wcProvider = walletService.getProvider(WalletType.COSMOS);
    if (wcProvider) return wcProvider;

    if (typeof window !== 'undefined' && (window as any).keplr) return (window as any).keplr;
    if (typeof window !== 'undefined' && (window as any).leap) return (window as any).leap;

    throw new Error('No Cosmos wallet detected. Install Keplr/Leap or connect via WalletConnect.');
  }

  private async enableProvider(): Promise<void> {
    if (this.walletProvider.enable) {
      await this.walletProvider.enable(this.chainId);
    }
  }

  private async getOfflineSigner(): Promise<OfflineDirectSigner> {
    await this.enableProvider();

    if (this.walletProvider.request) {
      return this.createWalletConnectSigner();
    }

    if (this.walletProvider.getOfflineSigner) {
      const signer = this.walletProvider.getOfflineSigner(this.chainId);
      const accounts = await signer.getAccounts();
      if (!accounts.length) throw new Error('No accounts found');
      return signer;
    }

    throw new Error('Wallet does not support OfflineSigner');
  }

  private createWalletConnectSigner(): OfflineDirectSigner {
    const self = this;

    return {
      getAccounts: async () => {
        const accounts = await self.walletProvider.request({
          method: 'cosmos_getAccounts',
          params: { chainId: self.chainId },
        });

        return accounts.map((acc: any) => ({
          address: acc.address,
          algo: acc.algo || 'secp256k1',
          pubkey: Uint8Array.from(Buffer.from(acc.pubkey, 'base64')),
        }));
      },

      signDirect: async (signerAddress: string, signDoc: any) => {
        const formatted = {
          chainId: signDoc.chainId,
          accountNumber: signDoc.accountNumber.toString(),
          authInfoBytes: Buffer.from(signDoc.authInfoBytes).toString('base64'),
          bodyBytes: Buffer.from(signDoc.bodyBytes).toString('base64'),
        };

        const result = await self.walletProvider.request({
          method: 'cosmos_signDirect',
          params: { signerAddress, signDoc: formatted },
        });

        let signature = result.signature;
        if (signature?.signature) signature = signature.signature;
        if (signature instanceof Uint8Array) {
          signature = Buffer.from(signature).toString('base64');
        }

        const pubkeyValue = result.pub_key?.value ?? result.signature?.pub_key?.value;

        return {
          signed: signDoc,
          signature: {
            pub_key: {
              type: 'tendermint/PubKeySecp256k1',
              value: pubkeyValue,
            },
            signature,
          },
        };
      },
    };
  }

  private async checkSubaccountExists(): Promise<boolean> {
    if (!this.indexerClient || !this.address) return false;
    try {
      const resp = await this.indexerClient.account.getSubaccount(
        this.address,
        this.subaccountNumber
      );
      return !!resp.subaccount;
    } catch {
      return false;
    }
  }

  private async fetchBalance(): Promise<AccountBalance> {
    if (!this.indexerClient || !this.address) throw new Error('Not connected');

    const resp = await this.indexerClient.account.getSubaccount(
      this.address,
      this.subaccountNumber
    );
    const sub = resp.subaccount;

    const balance: AccountBalance = {
      equity: sub?.equity ?? '0',
      freeCollateral: sub?.freeCollateral ?? '0',
      totalTradingRewards: sub?.totalTradingRewards ?? '0',
      marginUsage: sub?.marginUsage ?? '0',
    };

    this.balanceCache = { data: balance, timestamp: Date.now() };
    return balance;
  }

  private cleanup(): void {
    this.address = '';
    this.chainId = '';
    this.subaccountNumber = 0;
    this.walletProvider = null;
    this.offlineSigner = null;
    this.localWallet = null;
    this.subaccountInfo = null;
    this.compositeClient = null;
    this.indexerClient = null;
    this.balanceCache = null;
  }
}

export const dydxWalletService = new DydxWalletService();
