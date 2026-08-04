import { ethers } from 'ethers';

import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { getEVMNetworkConfig } from '../../../utils/evmUtils';
import { rpcManager } from '../../../utils/rpcProvider';
import type { SwapQuote } from '../types/swap.types';

export interface ExecuteSwapDependencies {
  prepareSwapTransaction: (params: any) => Promise<any[]>;
  simulateEVMTransaction: (
    chainId: any,
    from: string,
    to: string,
    value: string,
    data: string
  ) => Promise<{ gasLimit: bigint }>;
  getProvider: (type: WalletType) => any;
}

/**
 * Executes EVM Swap transactions (Approval + Swap).
 * Simple, clean, and developer-friendly using standard ethers.js.
 */
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
  const rawProvider = deps.getProvider(WalletType.EVM);
  if (!rawProvider) throw new Error('EVM wallet not connected');

  // Reset RPC cache if needed
  try {
    const config = getEVMNetworkConfig(chainId);
    if (config?.rpcUrls) rpcManager.resetChain(chainId, config.rpcUrls);
  } catch (err) {
    console.warn('[executeSwap] Failed to reset RPC cache, continuing with existing config:', err);
  }

  // 1. Get transaction payloads from API
  const transactions = await deps.prepareSwapTransaction({
    chainId,
    quote,
    tokenIn: { ...selectedSellAsset, chainId },
    tokenOut: { ...selectedBuyAsset, chainId: selectedBuyAsset.chainId || chainId },
    senderAddress,
    amount: sellAmount,
    slippageTolerance,
  });

  if (!transactions?.length) throw new Error('No transactions returned by swap quoter API');

  const provider = new ethers.BrowserProvider(rawProvider);
  const signer = await provider.getSigner();

  let lastTxHash = '';
  let didNotifyWalletSign = false;

  // 2. Execute each transaction in sequence (e.g. 1st: ERC20 approve, 2nd: DEX swap)
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const isLast = i === transactions.length - 1;

    if (onProgress) {
      onProgress(isLast ? 'signing' : 'approving');
    }

    if (!didNotifyWalletSign) {
      didNotifyWalletSign = true;
      onBeforeWalletSign?.();
    }

    // Build standard ethers TransactionRequest
    const txParams: ethers.TransactionRequest = {
      from: tx.from || senderAddress,
      to: tx.to,
      data: tx.data || '0x',
      value: tx.value ? BigInt(tx.value) : 0n,
    };

    if (tx.gasPrice || tx.maxFeePerGas) {
      try {
        txParams.gasPrice = BigInt(tx.gasPrice || tx.maxFeePerGas);
      } catch (err) {
        console.warn('[executeSwap] Failed to parse gasPrice, letting wallet estimate it:', err);
      }
    }

    if (tx.nonce != null) {
      txParams.nonce = Number(tx.nonce);
    }

    // Determine gasLimit: from API payload or estimate with 20% margin
    if (tx.gasLimit || tx.gas) {
      try {
        txParams.gasLimit = BigInt(tx.gasLimit || tx.gas);
      } catch (err) {
        console.warn(
          '[executeSwap] Failed to parse gasLimit from API payload, will estimate instead:',
          err
        );
      }
    }
    if (!txParams.gasLimit) {
      try {
        const estimatedGas = await provider.estimateGas(txParams);
        txParams.gasLimit = (estimatedGas * 120n) / 100n;
      } catch (err: any) {
        console.warn('[executeSwap] Gas estimation failed, letting wallet handle:', err.message);
      }
    }

    // 3. Send transaction to wallet
    const response = await signer.sendTransaction(txParams);
    lastTxHash = response.hash;
    console.log(`[executeSwap] Step ${i + 1}/${transactions.length} broadcast: ${lastTxHash}`);

    if (isLast && onSwapTxHash) {
      onSwapTxHash(lastTxHash);
    } else if (!isLast && onApprovalTxHash) {
      onApprovalTxHash(lastTxHash);
    }
  }

  return lastTxHash;
}
