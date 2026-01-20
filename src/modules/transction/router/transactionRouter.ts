import { ethers } from 'ethers';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { WalletType } from '../../walletconnect/constants/Wallet';

function isMainnet(): boolean {
  return useWalletStore.getState().network === 'mainnet';
}

export interface TransactionRequest {
  type: 'evm' | 'stellar' | 'cosmos';
  network: string;
  networkKey: number | string;
  from: string;
  to: string;
  amount: string;
  data?: any;
  memo?: string;
}

export interface TransactionResponse {
  hash?: string;
  status: 'success' | 'failed';
  error?: string;
}

interface WalletSession {
  provider: any;
  address: string;
  chainId: string | number;
  walletId: string;
}

class TransactionRouter {
  private sessions = new Map<WalletType, WalletSession>();

  registerSession(
    type: WalletType,
    provider: any,
    address: string,
    chainId: string | number,
    walletId: string
  ): void {
    console.group(`[Router] registerSession - ${type}`);

    if (!provider || !address) {
      console.error(`Invalid session data for ${type}`, { provider, address });
      console.groupEnd();
      return;
    }

    this.sessions.set(type, { provider, address, chainId, walletId });

    console.log('Session registered:', {
      type,
      address,
      chainId,
      walletId,
      providerType: typeof provider,
      providerMethods: provider ? Object.keys(provider).slice(0, 5) : 'none',
    });

    console.log('Total active sessions:', this.sessions.size);
    console.log('Session keys:', Array.from(this.sessions.keys()));
    console.groupEnd();
  }

  unregisterSession(type: WalletType): void {
    console.log(`[Router] Unregistering ${type} session`);
    const deleted = this.sessions.delete(type);
    console.log(
      `${deleted ? 'deleted session' : 'not deleted'} Session ${deleted ? 'removed' : 'not found'}`
    );
    console.log('Remaining sessions:', Array.from(this.sessions.keys()));
  }

  getSession(type: WalletType): WalletSession | null {
    const session = this.sessions.get(type) || null;
    console.log(`[Router] getSession(${type}):`, session ? 'Found' : 'Not found');
    if (session) {
      console.log('Session details:', {
        address: session.address,
        chainId: session.chainId,
        walletId: session.walletId,
        hasProvider: !!session.provider,
      });
    }
    return session;
  }

  hasActiveSession(type: WalletType): boolean {
    const exists = this.sessions.has(type);
    console.log(`[Router] hasActiveSession(${type}): ${exists ? 'Yes' : 'No'}`);
    return exists;
  }

  getAllSessions(): Map<WalletType, WalletSession> {
    console.log('[Router] getAllSessions - Total:', this.sessions.size);
    this.sessions.forEach((session, type) => {
      console.log(`  - ${type}:`, session.address);
    });
    return new Map(this.sessions);
  }

  getActiveTransactionsCount(): number {
    return 0;
  }

  clearAllSessions(): void {
    console.warn('[Router] Clearing ALL sessions');
    this.sessions.clear();
    console.log('All sessions cleared');
  }

  async routeTransaction(request: TransactionRequest): Promise<TransactionResponse> {
    console.group('[Router] routeTransaction START');
    console.log('Request details:', {
      type: request.type,
      network: request.network,
      networkKey: request.networkKey,
      from: request.from,
      to: request.to,
      amount: request.amount,
      hasData: !!request.data,
      memo: request.memo,
    });

    const walletType = this.getWalletType(request.type);
    console.log('Target wallet type:', walletType);

    const session = this.getSession(walletType);

    if (!session) {
      console.error(`No active session for ${walletType}`);
      console.log('Available sessions:', Array.from(this.sessions.keys()));
      console.groupEnd();
      throw new Error(`Please connect your ${request.type.toUpperCase()} wallet first.`);
    }

    console.log('Session found:', {
      sessionAddress: session.address,
      requestFrom: request.from,
      addressMatch: session.address.toLowerCase() === request.from.toLowerCase(),
      chainId: session.chainId,
      walletId: session.walletId,
    });

    if (!session.provider) {
      console.error('Session provider is null/undefined');
      console.groupEnd();
      throw new Error(`Provider not available for ${request.type.toUpperCase()} wallet.`);
    }

    console.log('Provider check:', {
      hasProvider: !!session.provider,
      providerType: typeof session.provider,
      hasRequest: typeof session.provider.request === 'function',
      hasClient: !!session.provider.client,
      hasSession: !!session.provider.session,
      providerKeys: session.provider ? Object.keys(session.provider).slice(0, 10) : [],
    });

    if (session.address.toLowerCase() !== request.from.toLowerCase()) {
      console.error('Address mismatch:', {
        sessionAddress: session.address,
        requestFrom: request.from,
      });
      console.groupEnd();
      throw new Error('Connected wallet address does not match transaction sender.');
    }

    console.log('Address verification passed');
    console.log(`Routing to ${request.type} handler...`);

    try {
      let result: TransactionResponse;

      switch (request.type) {
        case 'evm':
          result = await this.handleEVMTransaction(session, request);
          break;
        case 'stellar':
          result = await this.handleStellarTransaction(session, request);
          break;
        case 'cosmos':
          result = await this.handleCosmosTransaction(session, request);
          break;
        default:
          console.error('Unsupported transaction type:', request.type);
          throw new Error(`Unsupported transaction type: ${request.type}`);
      }

      console.log('Transaction completed successfully:', result);
      console.groupEnd();
      return result;
    } catch (error: any) {
      console.error('Transaction failed:', {
        error: error.message,
        code: error.code,
        stack: error.stack?.slice(0, 200),
      });
      console.groupEnd();
      throw error;
    }
  }

  private ensureProviderNamespaces(provider: any): void {
    if (provider.session && (!provider.namespaces || Object.keys(provider.namespaces).length === 0)) {
      console.log('[Router] Patching provider namespaces from session...');
      provider.namespaces = provider.session.namespaces;
    }
  }

  // Helper to detect if this is a WalletConnect provider that needs client.request()
  private isWalletConnectProvider(provider: any): boolean {
    return !!(provider.client && provider.session && typeof provider.client.request === 'function');
  }

  private async handleEVMTransaction(
    session: WalletSession,
    request: TransactionRequest
  ): Promise<TransactionResponse> {
    console.group('[Router] handleEVMTransaction');

    const { provider } = session;

    console.log('Provider:', provider);
    console.log('Is WalletConnect provider:', this.isWalletConnectProvider(provider));

    try {
      console.log('Preparing EVM transaction...');
      const amountInWei = BigInt(Math.floor(parseFloat(request.amount) * 1e18));

      this.ensureProviderNamespaces(provider);

      const chainId = typeof request.networkKey === 'number'
        ? request.networkKey
        : parseInt(String(session.chainId)) || 1;
      const chainIdCAIP = `eip155:${chainId}`;

      if (provider.setDefaultChain) {
        try {
          const availableChains = provider.namespaces?.eip155?.chains || [];
          if (availableChains.includes(chainIdCAIP)) {
            provider.setDefaultChain(chainIdCAIP);
            console.log(`Set default chain to ${chainIdCAIP}`);
          } else {
            console.warn(`Chain ${chainIdCAIP} not in namespaces, skipping setDefaultChain`);
          }
        } catch (e) {
          console.warn('Failed to set default chain:', e);
        }
      }

      let lastTxHash: string;

      if (isMainnet()) {
        const txParams: any = {
          from: request.from,
          to: request.to,
          value: '0x' + amountInWei.toString(16),
        };
        if (request.data && typeof request.data === 'string' && request.data.startsWith('0x') && request.data.length > 2) {
          txParams.data = request.data;
        }

        console.log('Transaction params (Mainnet):', txParams);

        // Check if this is a WalletConnect provider
        if (this.isWalletConnectProvider(provider)) {
          console.log('Using WalletConnect client.request() for EVM');
          const topic = provider.session?.topic;
          if (!topic) {
            throw new Error('No WalletConnect session topic found');
          }

          lastTxHash = await provider.client.request({
            topic,
            chainId: chainIdCAIP,
            request: {
              method: 'eth_sendTransaction',
              params: [txParams],
            },
          });
        } else {
          // Direct provider (MetaMask, injected, etc.)
          console.log('Using direct provider.request() for EVM');
          lastTxHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [txParams],
          });
        }

      } else {
        // Testnet using ethers
        console.log('Using ethers.BrowserProvider for Testnet transaction');
        const ethersProvider = new ethers.BrowserProvider(provider);
        const signer = await ethersProvider.getSigner();

        const tx = {
          to: request.to,
          value: amountInWei,
          from: request.from,
          data: (request.data && typeof request.data === 'string' && request.data.startsWith('0x')) ? request.data : undefined
        };

        console.log('Transaction params (Testnet/Ethers):', tx);

        const txResponse = await signer.sendTransaction(tx);
        console.log('Transaction sent, waiting for receipt...');
        const receipt = await txResponse.wait();

        if (!receipt || receipt.status === 0) {
          throw new Error('Transaction failed');
        }

        lastTxHash = txResponse.hash;
      }

      console.log('Transaction sent successfully!');
      console.log('Transaction hash:', lastTxHash);
      console.groupEnd();

      return { hash: lastTxHash, status: 'success' };
    } catch (error: any) {
      console.error('EVM transaction failed:', {
        message: error.message,
        code: error.code,
        data: error.data,
      });
      console.groupEnd();
      throw error;
    }
  }

  private async handleStellarTransaction(
    session: WalletSession,
    request: TransactionRequest
  ): Promise<TransactionResponse> {
    console.group('[Router] handleStellarTransaction');

    const { provider } = session;

    try {
      console.log('Preparing Stellar transaction...');
      console.log('Session info:', {
        hasProvider: !!provider,
        hasClient: !!provider?.client,
        hasSession: !!provider?.session,
        sessionTopic: provider?.session?.topic,
        chainId: session.chainId,
        requestNetworkKey: request.networkKey,
      });

      if (!request.data?.xdr) {
        console.error('Missing XDR data');
        throw new Error('Stellar transaction requires XDR data');
      }

      this.ensureProviderNamespaces(provider);

      console.log('XDR data present:', {
        xdrLength: request.data.xdr.length,
        networkPassphrase: request.data.networkPassphrase,
        network: request.data.network,
      });

      const signParams = {
        xdr: request.data.xdr,
        networkPassphrase: request.data.networkPassphrase || 'Test SDF Network ; September 2015',
        network: request.data.network || 'TESTNET',
      };

      const stellarChainId = typeof request.networkKey === 'string'
        ? request.networkKey
        : String(session.chainId) || 'pubnet';
      const chainCAIP = `${stellarChainId}`;

      console.log('Using Stellar chain:', chainCAIP);

      if (provider.setDefaultChain) {
        try {
          const availableChains = provider.namespaces?.stellar?.chains || [];
          if (availableChains.includes(chainCAIP)) {
            provider.setDefaultChain(chainCAIP);
            console.log(`Set default chain to ${chainCAIP}`);
          } else {
            console.warn(`Chain ${chainCAIP} not in namespaces`);
          }
        } catch (e) {
          console.warn('Failed to set default chain (Stellar):', e);
        }
      }

      console.log('Calling Stellar transaction method...');

      let result: any;
      if (this.isWalletConnectProvider(provider)) {
        console.log('Using WalletConnect client.request() for Stellar');
        const topic = provider.session?.topic;

        if (!topic) {
          console.error('No WalletConnect session topic found');
          throw new Error('No active WalletConnect session for Stellar wallet');
        }

        console.log('WalletConnect request params:', {
          topic,
          chainId: chainCAIP,
          method: 'stellar_signAndSubmitXDR',
          params: signParams,
        });

        result = await provider.client.request({
          topic,
          chainId: chainCAIP,
          request: {
            method: 'stellar_signAndSubmitXDR',
            params: signParams,
          },
        });
      } else {

        console.log('Using direct provider.request() for Stellar');
        result = await provider.request({
          method: 'stellar_signAndSubmitXDR',
          params: signParams,
        });
      }

      console.log('Provider response:', result);

      if (result?.status === 'success' || result?.hash || result?.signedXDR) {
        console.log('Stellar transaction successful!');
        console.groupEnd();
        return {
          status: 'success',
          hash: result.hash || result.transactionHash || 'stellar_submitted'
        };
      }

      if (typeof result === 'string') {
        console.log('Stellar transaction returned string result');
        console.groupEnd();
        return { status: 'success', hash: result };
      }

      console.error('Stellar transaction failed - unexpected response:', result);
      throw new Error('Stellar transaction failed - unexpected response format');
    } catch (error: any) {
      console.error('Stellar transaction failed:', {
        message: error.message,
        code: error.code,
        fullError: error,
      });
      console.groupEnd();
      throw error;
    }
  }

  private async handleCosmosTransaction(
    session: WalletSession,
    request: TransactionRequest
  ): Promise<TransactionResponse> {
    console.group('[Router] handleCosmosTransaction');

    const { provider } = session;

    try {
      console.log('Preparing Cosmos transaction...');

      if (!request.data) {
        console.error('Missing transaction data');
        throw new Error('Cosmos transaction requires data');
      }

      console.log('Transaction data present:', {
        dataKeys: Object.keys(request.data),
      });

      console.log('Calling provider.request with cosmos_signDirect...');

      let result: any;

      if (this.isWalletConnectProvider(provider)) {
        console.log('Using WalletConnect client.request() for Cosmos');
        const topic = provider.session?.topic;

        if (!topic) {
          throw new Error('No active WalletConnect session for Cosmos wallet');
        }

        const cosmosChainId = String(request.networkKey);
        const chainCAIP = `cosmos:${cosmosChainId}`;

        result = await provider.client.request({
          topic,
          chainId: chainCAIP,
          request: {
            method: 'cosmos_signDirect',
            params: request.data,
          },
        });
      } else {
        result = await provider.request({
          method: 'cosmos_signDirect',
          params: request.data,
        });
      }

      console.log('Provider response:', result);
      console.log('Cosmos transaction successful!');
      console.groupEnd();

      return {
        status: 'success',
        hash: result.transactionHash || result.hash || 'cosmos_submitted',
      };
    } catch (error: any) {
      console.error('Cosmos transaction failed:', {
        message: error.message,
        code: error.code,
        fullError: error,
      });
      console.groupEnd();
      throw error;
    }
  }

  private getWalletType(type: 'evm' | 'stellar' | 'cosmos'): WalletType {
    const mapping: Record<string, WalletType> = {
      evm: WalletType.EVM,
      stellar: WalletType.STELLAR,
      cosmos: WalletType.COSMOS,
    };

    const walletType = mapping[type];
    console.log(`[Router] Mapped ${type} → ${walletType}`);
    return walletType;
  }
}

export const transactionRouter = new TransactionRouter();