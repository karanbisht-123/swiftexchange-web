import { type OfflineDirectSigner } from '@cosmjs/proto-signing';
import {
  BECH32_PREFIX,
  CompositeClient,
  IndexerClient,
  LocalWallet,
  Network,
  SubaccountInfo,
} from '@dydxprotocol/v4-client-js';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { walletService } from '../../walletconnect/services/walletService';

type NetworkType = 'mainnet' | 'testnet';

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

  private static clientCache: Map<
    string,
    { composite: CompositeClient; indexer: IndexerClient; timestamp: number }
  > = new Map();
  private static readonly CLIENT_CACHE_TTL = 300_000;

  async connect(networkType: NetworkType, subaccountNumber: number = 0): Promise<DydxConnection> {
    if (this.isConnecting) throw new Error('Connection already in progress');
    this.isConnecting = true;
    this.setStatus('connecting');

    try {
      const network = networkType === 'mainnet' ? Network.mainnet() : Network.testnet();

      this.chainId = network.validatorConfig.chainId;
      this.subaccountNumber = subaccountNumber;

      console.log('[DydxWallet] Connecting:', {
        networkType,
        chainId: this.chainId,
        subaccountNumber,
      });

      this.walletProvider = this.getCosmosProvider();
      this.offlineSigner = await this.getOfflineSigner();
      const accounts = await this.offlineSigner.getAccounts();
      this.address = accounts[0].address;

      if (!this.address.startsWith(BECH32_PREFIX)) {
        throw new Error(`Invalid dYdX address. Must start with "${BECH32_PREFIX}"`);
      }

      console.log('[DydxWallet] Connected address:', this.address);

      this.setStatus('connecting', { address: this.address, chainId: this.chainId });

      const cacheKey = `${networkType}_${this.chainId}`;
      const cachedClients = DydxWalletService.clientCache.get(cacheKey);
      const now = Date.now();

      if (cachedClients && now - cachedClients.timestamp < DydxWalletService.CLIENT_CACHE_TTL) {
        console.log('[DydxWallet] Using cached clients');
        this.compositeClient = cachedClients.composite;
        this.indexerClient = cachedClients.indexer;
      } else {
        console.log('[DydxWallet] Creating new client connections');
        const [compositeClient, indexerClient] = await Promise.all([
          CompositeClient.connect(network),
          Promise.resolve(new IndexerClient(network.indexerConfig)),
        ]);

        this.compositeClient = compositeClient;
        this.indexerClient = indexerClient;

        DydxWalletService.clientCache.set(cacheKey, {
          composite: compositeClient,
          indexer: indexerClient,
          timestamp: now,
        });
      }

      this.localWallet = await LocalWallet.fromOfflineSigner(this.offlineSigner);
      this.subaccountInfo = SubaccountInfo.forLocalWallet(this.localWallet, subaccountNumber);

      try {
        const account = await this.compositeClient.validatorClient.get.getAccount(this.address);
        console.log('[DydxWallet] Account details fetched:', {
          accountNumber: account?.accountNumber,
          sequence: account?.sequence,
        });
      } catch (err) {
        console.error('[DydxWallet] Failed to fetch account details:', err);
      }

      const [hasSubaccount, balanceResult] = await Promise.allSettled([
        this.checkSubaccountExists(),
        this.fetchBalance(),
      ]);

      const hasSubaccountValue = hasSubaccount.status === 'fulfilled' ? hasSubaccount.value : false;
      const balanceValue = balanceResult.status === 'fulfilled' ? balanceResult.value : undefined;

      const connection: DydxConnection = {
        address: this.address,
        chainId: this.chainId,
        subaccountNumber,
        hasSubaccount: hasSubaccountValue,
        balance: balanceValue,
      };

      this.setStatus(hasSubaccountValue ? 'connected' : 'no_subaccount', {
        chainId: this.chainId,
        hasSubaccount: hasSubaccountValue,
        balance: balanceValue,
      });

      return connection;
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
        // ... (keep existing getAccounts code)
        const accounts = await self.walletProvider.request({
          method: 'cosmos_getAccounts',
          params: { chainId: self.chainId },
        });

        return accounts.map((acc: any) => {
          const pubkeyBytes = new Uint8Array(
            atob(acc.pubkey)
              .split('')
              .map(c => c.charCodeAt(0))
          );

          return {
            address: acc.address,
            algo: acc.algo || 'secp256k1',
            pubkey: pubkeyBytes,
          };
        });
      },

      signDirect: async (signerAddress: string, signDoc: any) => {
        console.log('[SignDirect] Starting signature process for address:', signerAddress);

        let accountNumber = signDoc.accountNumber;

        // 1. Fetch account data (keep existing logic to get account number)
        if (self.compositeClient) {
          try {
            const account =
              await self.compositeClient.validatorClient.get.getAccount(signerAddress);
            if (account?.accountNumber !== undefined) {
              accountNumber = account.accountNumber;
            }
          } catch (err) {
            console.error('[SignDirect] Failed to fetch account details:', err);
          }
        }

        // 2. Generate the Timestamp Sequence
        // dYdX often uses this as a Client ID/Nonce for orders
        const timestampSequence = Date.now().toString();

        console.log('[SignDirect] Overriding sequence with timestamp:', timestampSequence);

        // 3. Add 'sequence' to the formatted request object
        const formatted = {
          chainId: signDoc.chainId,
          accountNumber: accountNumber.toString(),
          sequence: timestampSequence, // <--- NEW FIELD ADDED HERE
          authInfoBytes: btoa(String.fromCharCode(...new Uint8Array(signDoc.authInfoBytes))),
          bodyBytes: btoa(String.fromCharCode(...new Uint8Array(signDoc.bodyBytes))),
        };

        const result = await self.walletProvider.request({
          method: 'cosmos_signDirect',
          params: { signerAddress, signDoc: formatted },
        });

        // ... (keep existing response handling)
        let signature = result.signature;
        if (signature?.signature) {
          signature = signature.signature;
        }

        let pubkeyValue =
          result.pub_key?.value ||
          result.signature?.pub_key?.value ||
          result.signed?.pub_key?.value;

        if (!pubkeyValue) {
          // Fallback if pubkey is missing (common in some WC bridges)
          const accounts = await self.offlineSigner?.getAccounts();
          if (accounts?.[0]?.pubkey) {
            pubkeyValue = btoa(String.fromCharCode(...accounts[0].pubkey));
          } else {
            throw new Error('Could not extract public key');
          }
        }

        return {
          signed: {
            ...signDoc,
            accountNumber: BigInt(accountNumber.toString()),
          },
          signature: {
            pub_key: {
              type: 'tendermint/PubKeySecp256k1',
              value: pubkeyValue,
            },
            signature:
              typeof signature === 'string'
                ? signature
                : btoa(String.fromCharCode(...new Uint8Array(signature))),
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
    this.balanceCache = null;
  }
}

export const dydxWalletService = new DydxWalletService();
