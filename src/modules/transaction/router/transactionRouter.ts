import { ethers } from 'ethers';

import { sendCustomNotification } from '../../../service/notificationService';
import { sendEVMTransaction } from '../../../utils/walletConnectUtils';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

function isMainnet(): boolean {
  return useWalletStore.getState().network === 'mainnet';
}

export interface TransactionRequest {
  type: 'evm' | 'stellar';
  network: string;
  networkKey: number | string;
  from: string;
  to: string;
  amount: string;
  data?: any;
  memo?: string;
  unsignedTx?: string;
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
    const token = localStorage.getItem('device_token');
    if (token) {
      sendCustomNotification(token, {
        title: 'Transaction Request',
        body: `New ${request.type} transaction of ${request.amount} to ${request.to}`,
      }).catch(err => {
        console.error(err);
      });
    }
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
    if (
      provider.session &&
      (!provider.namespaces || Object.keys(provider.namespaces).length === 0)
    ) {
      console.log('[Router] Patching provider namespaces from session...');
      provider.namespaces = provider.session.namespaces;
    }
  }

  private async handleEVMTransaction(
    session: WalletSession,
    request: TransactionRequest
  ): Promise<TransactionResponse> {
    const { provider } = session;

    try {
      const amountInWei = BigInt(Math.floor(parseFloat(request.amount) * 1e18));
      this.ensureProviderNamespaces(provider);

      const chainId =
        typeof request.networkKey === 'number'
          ? request.networkKey
          : parseInt(String(session.chainId)) || 1;

      let txParams: any = {};
      let gasLimitBigInt: bigint = BigInt(21000);

      if (request.unsignedTx) {
        // If the backend already built the fully signed transaction, parse and use it!
        console.log('[Router] Using backend-prepared unsignedTx');
        const parsedTx = ethers.Transaction.from(request.unsignedTx);
        txParams = {
          from: session.address,
          to: parsedTx.to,
          value: '0x' + parsedTx.value.toString(16),
          data: parsedTx.data !== '0x' ? parsedTx.data : '0x',
          chainId: chainId,
          nonce: parsedTx.nonce,
        };

        if (parsedTx.gasLimit) txParams.gasLimit = '0x' + parsedTx.gasLimit.toString(16);
        if (parsedTx.maxFeePerGas)
          txParams.maxFeePerGas = '0x' + parsedTx.maxFeePerGas.toString(16);
        if (parsedTx.maxPriorityFeePerGas)
          txParams.maxPriorityFeePerGas = '0x' + parsedTx.maxPriorityFeePerGas.toString(16);
        if (parsedTx.gasPrice && !parsedTx.maxFeePerGas)
          txParams.gasPrice = '0x' + parsedTx.gasPrice.toString(16);
        if (parsedTx.type !== null) txParams.type = parsedTx.type;

        // Perform strict simulation to check for reverts, gas limits, and balance issues
        try {
          const { simulateEVMTransaction } = await import('../../evm/utils/evmUtils');
          const sim = await simulateEVMTransaction(
            chainId,
            txParams.from,
            txParams.to,
            txParams.value,
            txParams.data
          );

          // If simulation estimated a higher gas limit than encoded (e.g. smart contracts), auto-adjust!
          const simGas = sim.gasLimit;
          const encodedGas = parsedTx.gasLimit ? BigInt(parsedTx.gasLimit) : BigInt(0);
          if (simGas > encodedGas) {
            console.log(
              `[Router] Simulation estimated higher gas limit: ${simGas.toString()} > ${encodedGas.toString()}. Adjusting gas limit.`
            );
            txParams.gasLimit = '0x' + simGas.toString(16);
          }
        } catch (simError: any) {
          throw new Error(`Simulation failed: ${simError.message}`);
        }
      } else {
        txParams = {
          from: session.address,
          to: request.to,
          value: '0x' + amountInWei.toString(16),
          data:
            request.data &&
            typeof request.data === 'string' &&
            request.data.startsWith('0x') &&
            request.data.length > 2
              ? request.data
              : '0x',
          chainId: chainId,
        };

        gasLimitBigInt = txParams.data === '0x' ? BigInt(21000) : BigInt(100000);

        try {
          const { simulateEVMTransaction } = await import('../../evm/utils/evmUtils');
          const sim = await simulateEVMTransaction(
            chainId,
            txParams.from,
            txParams.to,
            txParams.value,
            txParams.data
          );
          gasLimitBigInt = sim.gasLimit;

          if (sim.feeData.maxFeePerGas)
            txParams.maxFeePerGas = '0x' + sim.feeData.maxFeePerGas.toString(16);
          if (sim.feeData.maxPriorityFeePerGas)
            txParams.maxPriorityFeePerGas = '0x' + sim.feeData.maxPriorityFeePerGas.toString(16);
        } catch (simError: any) {
          if (simError.message.includes('Insufficient funds')) throw simError;
        }

        txParams.gasLimit = '0x' + gasLimitBigInt.toString(16);
      }

      // Enforce minGasGwei safety check on txParams
      try {
        const { getEVMNetworkConfig } = await import('../../evm/utils/evmUtils');
        const minGasConfig = getEVMNetworkConfig(chainId);
        const minGasGwei = (minGasConfig as any).minGasGwei ?? 0;
        if (minGasGwei > 0) {
          const minGasPrice = ethers.parseUnits(minGasGwei.toString(), 'gwei');
          if (
            txParams.maxPriorityFeePerGas !== undefined &&
            txParams.maxPriorityFeePerGas !== null
          ) {
            let maxPriorityFee = BigInt(txParams.maxPriorityFeePerGas);
            if (maxPriorityFee < minGasPrice) {
              const diff = minGasPrice - maxPriorityFee;
              maxPriorityFee = minGasPrice;
              txParams.maxPriorityFeePerGas = '0x' + maxPriorityFee.toString(16);
              if (txParams.maxFeePerGas !== undefined && txParams.maxFeePerGas !== null) {
                txParams.maxFeePerGas = '0x' + (BigInt(txParams.maxFeePerGas) + diff).toString(16);
              }
            }
          }
          if (txParams.gasPrice !== undefined && txParams.gasPrice !== null) {
            const gasPrice = BigInt(txParams.gasPrice);
            if (gasPrice < minGasPrice) {
              txParams.gasPrice = '0x' + minGasPrice.toString(16);
            }
          }
        }
      } catch (minGasError) {
        console.warn('[Router] Failed to enforce minGasGwei check:', minGasError);
      }

      let lastTxHash: string;

      if (isMainnet()) {
        lastTxHash = await sendEVMTransaction(provider, chainId, txParams);
      } else {
        const ethersProvider = new ethers.BrowserProvider(provider);
        const signer = await ethersProvider.getSigner();
        const txResponse = await signer.sendTransaction(txParams);
        const receipt = await txResponse.wait();

        if (!receipt || receipt.status === 0) {
          throw new Error('Transaction failed on-chain');
        }
        lastTxHash = txResponse.hash;
      }

      return { hash: lastTxHash, status: 'success' };
    } catch (error: any) {
      console.error('EVM Transaction Error:', error);
      throw error;
    }
  }

  private async handleStellarTransaction(
    session: WalletSession,
    request: TransactionRequest
  ): Promise<TransactionResponse> {
    console.group('[Router] handleStellarTransaction');

    try {
      if (!request.data?.xdr) {
        console.error('Missing XDR data');
        throw new Error('Stellar transaction requires XDR data');
      }

      this.ensureProviderNamespaces(session.provider);

      const STELLAR_PASSPHRASES: Record<string, string> = {
        pubnet: 'Public Global Stellar Network ; September 2015',
        mainnet: 'Public Global Stellar Network ; September 2015',
        PUBNET: 'Public Global Stellar Network ; September 2015',
        publink: 'Public Global Stellar Network ; September 2015',
        testnet: 'Test SDF Network ; September 2015',
        TESTNET: 'Test SDF Network ; September 2015',
      };

      const networkKeyStr = String(request.networkKey);

      const resolvedPassphrase =
        request.data.networkPassphrase ||
        STELLAR_PASSPHRASES[networkKeyStr] ||
        STELLAR_PASSPHRASES[request.data.network] ||
        'Test SDF Network ; September 2015';

      const resolvedNetwork =
        request.data.network ||
        (['pubnet', 'mainnet', 'PUBLIC', 'publink'].includes(networkKeyStr) ? 'PUBNET' : 'TESTNET');

      const { signAndSubmitTransaction } = await import('../../stellar/utils/transactionService');

      const result = await signAndSubmitTransaction({
        xdr: request.data.xdr,
        network: resolvedNetwork.toUpperCase(),
        networkPassphrase: resolvedPassphrase,
        provider: session.provider,
        stellarAddress: session.address,
      });

      if (!result.success || !result.hash) {
        throw new Error(result.error || 'Stellar transaction failed');
      }

      console.log('Stellar transaction successful!', result.hash);
      console.groupEnd();
      return {
        status: 'success',
        hash: result.hash,
      };
    } catch (error: any) {
      console.error('Stellar transaction failed:', {
        message: error.message,
        code: error.code,
        fullError: error,
      });

      let errorMessage = error.message || 'Stellar transaction failed';
      if (error.response?.data?.extras?.result_codes?.transaction) {
        errorMessage = `Stellar Error: ${error.response.data.extras.result_codes.transaction}`;
        if (error.response.data.extras.result_codes.operations) {
          errorMessage += ` (${error.response.data.extras.result_codes.operations.join(', ')})`;
        }
      } else if (error.data?.extras?.result_codes?.transaction) {
        errorMessage = `Stellar Error: ${error.data.extras.result_codes.transaction}`;
      } else if (error.response?.data?.detail) {
        errorMessage = `Stellar Error: ${error.response.data.detail}`;
      } else if (typeof error === 'object' && error !== null) {
        const errorJson = JSON.stringify(error).toLowerCase();
        if (errorJson.includes('tx_bad_seq'))
          errorMessage = 'Stellar Error: tx_bad_seq (Sequence Number Mismatch)';
        else if (errorJson.includes('tx_insufficient_balance'))
          errorMessage = 'Stellar Error: tx_insufficient_balance';
      }

      console.groupEnd();
      const enhancedError = new Error(errorMessage);
      (enhancedError as any).originalError = error;
      (enhancedError as any).code = error.code;
      throw enhancedError;
    }
  }

  private getWalletType(type: 'evm' | 'stellar'): WalletType {
    const mapping: Record<string, WalletType> = {
      evm: WalletType.EVM,
      stellar: WalletType.STELLAR,
    };

    const walletType = mapping[type];
    console.log(`[Router] Mapped ${type} → ${walletType}`);
    return walletType;
  }
}

export const transactionRouter = new TransactionRouter();
