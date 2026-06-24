import { ethers } from 'ethers';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import type { SwapQuote } from '../types/swap.types';
import { getEVMNetworkConfig } from '../../../utils/evmUtils';
import { rpcManager } from '../../../utils/rpcProvider';

function safeValue(raw: string | undefined | null): bigint {
  if (!raw) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

function safeGasLimit(tx: { gasLimit?: string; gas?: string }): bigint | undefined {
  const raw = tx.gasLimit ?? tx.gas;
  if (!raw) return undefined;
  try {
    const n = BigInt(raw);
    return n > 0n ? n : undefined;
  } catch {
    return undefined;
  }
}

async function estimateGasWithBuffer(
  provider: ethers.BrowserProvider,
  txParams: ethers.TransactionRequest
): Promise<bigint | undefined> {
  try {
    const estimated = await provider.estimateGas(txParams);
    return (estimated * 120n) / 100n;
  } catch (err: any) {
    if (
      err.message?.includes('execution reverted') ||
      err.info?.error?.message?.includes('execution reverted')
    ) {
      throw new Error(`Transaction will fail: ${err.info?.error?.message || err.message}`);
    }
    console.warn('[estimateGasWithBuffer] Failed, letting wallet decide:', err);
    return undefined;
  }
}

export interface ExecuteSwapDependencies {
  prepareSwapTransaction: (params: any) => Promise<any[]>;
  simulateEVMTransaction: (chainId: any, from: string, to: string, value: string, data: string) => Promise<{ gasLimit: bigint }>;
  getProvider: (type: WalletType) => any;
}

export async function executeSwap(
  chainId: number | string,
  quote: SwapQuote,
  selectedSellAsset: any,
  selectedBuyAsset: any,
  senderAddress: string,
  sellAmount: string,
  slippageTolerance: number,
  deps: ExecuteSwapDependencies,
  onApprovalTxHash?: (hash: string) => void,
  onSwapTxHash?: (hash: string) => void,
  onBeforeWalletSign?: () => void,
  onProgress?: (step: 'approving' | 'signing') => void
): Promise<string> {
  const provider = deps.getProvider(WalletType.EVM);
  if (!provider) throw new Error('EVM wallet not connected');

  try {
    const config = getEVMNetworkConfig(chainId);
    if (config?.rpcUrls) {
      rpcManager.resetChain(chainId, config.rpcUrls);
    }
  } catch (err) {
    console.warn('[executeSwap] Failed to reset chain status:', err);
  }

  const transactions = await deps.prepareSwapTransaction({
    chainId,
    quote,
    tokenIn: { ...selectedSellAsset, chainId },
    tokenOut: { ...selectedBuyAsset, chainId: selectedBuyAsset.chainId || chainId },
    senderAddress,
    amount: sellAmount,
    slippageTolerance,
  });

  if (!transactions?.length) throw new Error('No transactions received from API');

  if (onProgress) {
    onProgress(transactions.length > 1 ? 'approving' : 'signing');
  }

  const ethersProvider = new ethers.BrowserProvider(provider);
  const signer = await ethersProvider.getSigner();

  const txParamsList = await Promise.all(
    transactions.map(async tx => {
      const txParams: ethers.TransactionRequest = {
        from: tx.from || senderAddress,
        to: tx.to,
        data: tx.data,
        value: safeValue(tx.value),
      };

      const rawGasPrice = tx.gasPrice ?? tx.maxFeePerGas;
      if (rawGasPrice) {
        try {
          txParams.gasPrice = BigInt(rawGasPrice as any);
        } catch {
          // ignore invalid gasPrice from API
        }
      }

      if (tx.nonce != null) txParams.nonce = Number(tx.nonce);

      try {
        const sim = await deps.simulateEVMTransaction(
          chainId,
          txParams.from as string,
          txParams.to as string,
          txParams.value?.toString() || '0',
          txParams.data?.toString() || '0x'
        );
        txParams.gasLimit = sim.gasLimit;
      } catch (simError: any) {
        if (
          simError.message?.includes('Insufficient funds') ||
          simError.message?.includes('insufficient funds')
        ) {
          throw new Error('Insufficient native token balance to cover gas fees.');
        }
        console.warn('[executeSwap] Gas simulation failed, trying fallback:', simError.message);
        const apiLimit = safeGasLimit(tx);
        txParams.gasLimit = apiLimit ?? (await estimateGasWithBuffer(ethersProvider, txParams));
      }

      return txParams;
    })
  );

  let lastTxHash = '';
  let signFired = false;
  const fireSign = () => {
    if (!signFired) {
      signFired = true;
      onBeforeWalletSign?.();
    }
  };

  for (let i = 0; i < txParamsList.length; i++) {
    const tx = txParamsList[i];
    const isLast = i === txParamsList.length - 1;
    if (onProgress) {
      onProgress(isLast ? 'signing' : 'approving');
    }
    fireSign();
    const txResponse = await signer.sendTransaction(tx);
    lastTxHash = txResponse.hash;
    console.log(`[executeSwap] tx ${i + 1}/${txParamsList.length} broadcast:`, lastTxHash);

    if (isLast && onSwapTxHash) {
      onSwapTxHash(lastTxHash);
    } else if (!isLast && onApprovalTxHash) {
      onApprovalTxHash(txResponse.hash);
    }
  }

  return lastTxHash;
}
