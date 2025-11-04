// import { getEVMChains } from '../../walletconnect/config/chains';
import { WalletType } from '../../walletconnect/constants/Wallet';

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
      `${deleted ? 'deltet session' : 'not delted'} Session ${deleted ? 'removed' : 'not found'}`
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
      console.error(' Session provider is null/undefined');
      console.groupEnd();
      throw new Error(`Provider not available for ${request.type.toUpperCase()} wallet.`);
    }

    console.log('Provider check:', {
      hasProvider: !!session.provider,
      providerType: typeof session.provider,
      hasRequest: typeof session.provider.request === 'function',
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

  private async handleEVMTransaction(
    session: WalletSession,
    request: TransactionRequest
  ): Promise<TransactionResponse> {
    console.group('⚡ [Router] handleEVMTransaction');

    const { provider } = session;

    try {
      console.log('🔧 Preparing EVM transaction...');
      console.log('Provider info:', {
        hasProvider: !!provider,
        hasRequest: typeof provider.request === 'function',
        providerType: typeof provider,
      });

      const amountInWei = BigInt(Math.floor(parseFloat(request.amount) * 1e18));
      console.log('Amount conversion:', {
        original: request.amount,
        wei: amountInWei.toString(),
        hex: '0x' + amountInWei.toString(16),
      });

      const txParams: any = {
        from: request.from,
        to: request.to,
        value: '0x' + amountInWei.toString(16),
      };

      if (request.data) {
        txParams.data = typeof request.data === 'string' ? request.data : '0x';
        console.log('Data attached:', txParams.data);
      }

      console.log('Final transaction params:', txParams);
      console.log('Calling provider.request with eth_sendTransaction...');

      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      });

      console.log('Transaction sent successfully!');
      console.log('Transaction hash:', hash);
      console.groupEnd();

      return { hash, status: 'success' };
    } catch (error: any) {
      console.error('EVM transaction failed:', {
        message: error.message,
        code: error.code,
        data: error.data,
        fullError: error,
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

      if (!request.data?.xdr) {
        console.error('Missing XDR data');
        throw new Error('Stellar transaction requires XDR data');
      }

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

      console.log('Calling provider.request with stellar_signAndSubmitXDR...');

      const result = await provider.request({
        method: 'stellar_signAndSubmitXDR',
        params: signParams,
      });

      console.log('Provider response:', result);

      if (result.status === 'success') {
        console.log('Stellar transaction successful!');
        console.groupEnd();
        return { status: 'success', hash: 'stellar_submitted' };
      }

      console.error('Stellar transaction failed - status not success');
      throw new Error('Stellar transaction failed');
    } catch (error: any) {
      console.error(' Stellar transaction failed:', {
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

      const result = await provider.request({
        method: 'cosmos_signDirect',
        params: request.data,
      });

      console.log('Provider response:', result);
      console.log('Cosmos transaction successful!');
      console.groupEnd();

      return {
        status: 'success',
        hash: result.transactionHash || 'cosmos_submitted',
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

// private async ensureCorrectNetwork(
//   provider: any,
//   requiredChainId: number,
//   networkName: string
// ): Promise<void> {
//   try {
//     const currentChainIdHex = await provider.request({ method: 'eth_chainId' });
//     const currentChainId = parseInt(currentChainIdHex, 16);
//     const requiredChainIdHex = '0x' + requiredChainId.toString(16);
//     console.log('[Router] Network check:', {
//       current: currentChainId,
//       required: requiredChainId,
//       currentHex: currentChainIdHex,
//       requiredHex: requiredChainIdHex,
//     });
//     if (currentChainId === requiredChainId) {
//       console.log('[Router] Already on correct network');
//       return;
//     }
//     console.log(`[Router] Switching to ${networkName} (${requiredChainId})`);
//     try {
//       await provider.request({
//         method: 'wallet_switchEthereumChain',
//         params: [{ chainId: requiredChainIdHex }],
//       });
//       console.log('[Router] Network switched successfully');
//     } catch (switchError: any) {
//       if (switchError.code === 4902) {
//         console.log('[Router] Network not found, adding it...');
//         await this.addNetwork(provider, requiredChainId);
//         console.log('[Router] Network added and switched successfully');
//       } else {
//         throw switchError;
//       }
//     }
//     const newChainIdHex = await provider.request({ method: 'eth_chainId' });
//     const newChainId = parseInt(newChainIdHex, 16);
//     if (newChainId !== requiredChainId) {
//       throw new Error(`Network switch failed. Expected ${requiredChainId}, got ${newChainId}`);
//     }
//   } catch (error: any) {
//     if (error.code === 4001) {
//       throw new Error('Network switch cancelled by user.');
//     }
//     console.error('[Router] Network switch error:', error);
//     throw new Error(`Failed to switch to ${networkName}: ${error.message}`);
//   }
// }
// private async addNetwork(provider: any, chainId: number): Promise<void> {
//   const networkConfig = getEVMChains().find(c => c.chainId === chainId);
//   if (!networkConfig) {
//     throw new Error(`Network configuration not found for chain ID: ${chainId}`);
//   }
//   const params = {
//     chainId: '0x' + chainId.toString(16),
//     chainName: networkConfig.name,
//     nativeCurrency: networkConfig.nativeCurrency,
//     rpcUrls: [networkConfig.rpcUrl],
//     blockExplorerUrls: [networkConfig.blockExplorerUrl],
//   };
//   await provider.request({
//     method: 'wallet_addEthereumChain',
//     params: [params],
//   });
// }
