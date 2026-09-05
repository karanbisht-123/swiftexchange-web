import { ethers } from 'ethers';

import { WalletType } from '../../../../walletconnect/constants/Wallet';
import { parseRawChainId, switchOrAddChain } from '../../../utils/evmChainUtils';
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

  try {
    const config = getEVMNetworkConfig(chainId);
    if (config?.rpcUrls) rpcManager.resetChain(chainId);
  } catch (err) {
    console.warn('[executeSwap] Failed to reset RPC cache, continuing with existing config:', err);
  }
  try {
    const rawChainId = await rawProvider.request({ method: 'eth_chainId' });
    const currentChainId = parseRawChainId(rawChainId);
    if (currentChainId !== Number(chainId)) {
      await switchOrAddChain(rawProvider, chainId);
    }
  } catch (switchErr: any) {
    console.error('[executeSwap] Chain switch failed:', switchErr?.message);
    throw new Error(`Chain switch failed: ${switchErr?.message || 'User rejected'}`);
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

  if (!transactions?.length) throw new Error('No transactions returned by swap quoter API');

  const provider = new ethers.BrowserProvider(rawProvider);
  // Request a signer for the specific sender address.
  // Passing the address explicitly ensures the BrowserProvider binds to
  // the correct account — calling getSigner() with no argument relies on
  // eth_accounts[0] which may differ from senderAddress in multi-account
  // or recently-switched-account scenarios, causing -32000 "unknown account".
  const signer = await provider.getSigner(senderAddress);
  let lastTxHash = '';
  let walletSignNotified = false;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const isLast = i === transactions.length - 1;
    const stepLabel: 'approving' | 'signing' = isLast ? 'signing' : 'approving';
    if (onProgress) {
      onProgress(stepLabel);
    }
    if (!walletSignNotified) {
      walletSignNotified = true;
      onBeforeWalletSign?.();
    }

    const txParams: ethers.TransactionRequest = {
      // Do NOT include `from` here. When using a named signer (getSigner(address)),
      // ethers will automatically set the correct `from`. Explicitly passing
      // `tx.from` (from an API payload) can cause -32000 "unknown account" in
      // extension wallets that validate `from` against the active keyring session.
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

    if (tx.gasLimit || tx.gas) {
      try {
        txParams.gasLimit = BigInt(tx.gasLimit || tx.gas);
      } catch (err) {
        console.warn('[executeSwap] Failed to parse gasLimit from API, estimating instead:', err);
      }
    }
    if (!txParams.gasLimit) {
      try {
        const estimatedGas = await provider.estimateGas(txParams);
        txParams.gasLimit = (estimatedGas * 120n) / 100n;
      } catch (err: any) {
        console.error('[executeSwap] Gas estimation failed:', err.message);
        throw new Error(`Transaction simulation failed: ${err.message || 'Unknown error'}`);
      }
    }
    const response = await signer.sendTransaction(txParams);
    lastTxHash = response.hash;
    console.log(`[executeSwap] Step ${i + 1}/${transactions.length} tx broadcast: ${lastTxHash}`);

    if (isLast && onSwapTxHash) {
      onSwapTxHash(lastTxHash);
    } else if (!isLast && onApprovalTxHash) {
      onApprovalTxHash(lastTxHash);
      if (onProgress) onProgress('signing');
    }
  }

  return lastTxHash;
}
